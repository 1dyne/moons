import {z} from 'zod';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {v2} from '@workspace/life-contract';
import {evalSignal, itemView, periodRange, query, tidyReport, type SourceLike} from '@workspace/lit-core';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {deleteRecord, getSettings, putSettings} from './store.ts';
import {acceptSuggestion, ctxOf, getScreen, installTemplate, listSuggestions, loadWorkspace, localId, mergeProperties, previewRule, putScreen, saveV2} from './v2.ts';

// lit v2 for Claude (docs/lit/V2_DESIGN.md §5): the same grammar the screen uses. Claude reads the user's structure,
// proposes, and builds with the user's OK. Nothing here knows any template; templates are data files.

type Tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>, owner: string) => Promise<unknown>) => unknown;
const litUrl = () => (process.env.PLANNER_PUBLIC_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5175')).replace(/\/$/, '');
function templatesDir() {
  for (const d of [process.env.LIT_TEMPLATES_DIR, path.resolve('artifacts/lit/dist/public/templates'), path.resolve('artifacts/lit/public/templates'), path.resolve('../lit/public/templates')]) if (d && existsSync(path.join(d, 'index.json'))) return d;
  return null;
}
const templateIndex = () => { const d = templatesDir(); return d ? JSON.parse(readFileSync(path.join(d, 'index.json'), 'utf8')) as {file: string; id: string; name: string; desc: string; requires: string[]}[] : []; };

const guide = () => `lit v2 · 사용자가 lit 문법으로 직접 짓는 자동화 플래너
문법 (English canonical · 한국어):
- Property(속성): lit 전체에 하나뿐인 속성 사전. 종류 ${v2.PROPERTY_KINDS.join('·')}. 역할(Property role) ${v2.ROLES.join('·')}을 붙이면 lit이 뜻을 안다(day=어느 날, start/end=시간, done=달성, fixed=고정 일정). done 역할 select는 선택지마다 meaning done|open|skip.
- Database(DB) = 태그: "이 태그 항목이 보통 가지는 칸". 항목은 DB 없이도, 여러 DB로도 있을 수 있다.
- Item(항목): values는 속성 id → 값(이름이 아니라 id). select 값은 선택지 id. relation 값은 항목 id 배열.
- Formula(계산 속성): diff(a−b, 시각이면 분) · rollup(via 연결, back=반대쪽, agg ${v2.AGGREGATES.join('|')}) · sameDay(같은 날 항목 모아 계산) · latest(지난번 값) · ifThen · expr("{속성id} - {속성id}").
- Lens(모아보기): 저장한 필터(dbs + where). Cond: {prop|role, on:"value"|"db"|"text", op ${v2.OPS.join('|')}, value}. 특수 값 @today @yesterday @thisWeek @weekday @day @done @open @skip @none @carried.
- Signal(상황): measure(source+of+agg+period) op compare({n} 또는 {signal}).
- Rule(규칙): on enter|change|signal|dayStart|time|open → source/if → do set|create|createEach(하루 한 번 반복)|archive|notify|effect|openForm|goTo. mode auto|suggest.
- 하위 항목: 같은 DB를 가리키는 relation 칸(예: "상위 항목", many:false)에 상위 항목 id를 넣는다. 상위의 진행률은 rollup(via 그 칸, back:true, agg doneRatio). 상위와 하위는 각자 날짜·달성 단계를 가진다(따로 체크하고 따로 미룬다). 상위를 하위에 맞춰 저절로 바꾸고 싶을 때만 사용자가 규칙을 만든다(on enter, where 하위 진행률 gte 100 → set 달성). 엔진은 항목을 쓰면 연결된 항목(양방향, 3단계)의 enter 규칙도 다시 본다. 하위 찾기: query_items({source:{where:[{prop:"<상위 칸 id>", op:"contains", value:"<상위 id>"}]}}).
- Screen: pages → widgets(w 1~4칸) → parts(${v2.PART_KINDS.join('·')}), part.view = source + period('' 모든 날|day 보이는 날|today…) + show/edit/chips/group/nest(하위로 묶을 relation 칸)/sort/styles(조건부 모양 ${v2.LOOKS.join('|')}).
- Template: 예시로 조립해 둔 데이터. install_template 으로 설치하면 사용자 것으로 복사된다.
지킬 것 (개인 공간):
1. 먼저 get_workspace 로 지금 구조를 본다. 이미 있는 속성·DB를 다시 만들지 않는다(비슷한 이름은 tidy 결과를 본다).
2. 이름·문구는 사용자가 말한 것만 쓴다. 지어내지 않는다. 설명용 예시 항목을 넣지 않는다.
3. 구조를 바꾸기 전에 무엇을 만들지 짧게 보여 주고 OK를 받는다. 규칙은 preview_rule 로 영향을 보여 준다.
4. 템플릿이 맞으면 list_templates → install_template 을 먼저 제안한다.
주소: ${litUrl()}`;

const cell = v2.CellValue;
export function registerLitV2Tools(tool: Tool) {
  tool('lit_guide', 'lit v2 문법과 규칙(English/한국어). lit 도구를 쓰기 전에 한 번 읽는다.', {}, async () => guide());

  tool('get_workspace', '사용자가 정의한 구조 전체: 속성 사전·DB(태그)·모아보기·상황·규칙·페이지 요약, 오늘 날짜, 항목 수.', {}, async (_a, owner) => {
    const ws = await loadWorkspace(owner), ctx = await ctxOf(owner), screen = await getScreen(owner);
    const b = screen.body as v2.ScreenBody;
    return {url: litUrl(), today: ctx.today, items: ws.items.size,
      properties: [...ws.properties.values()].map(p => ({id: p.id, ...p.body})),
      databases: [...ws.databases.values()].map(d => ({id: d.id, ...d.body, count: [...ws.items.values()].filter(x => x.body.dbs.includes(d.id)).length})),
      lenses: [...ws.lenses.values()].map(l => ({id: l.id, ...l.body})), signals: [...ws.signals.values()].map(s => ({id: s.id, ...s.body, now: evalSignal(ws, s.id, ctx)})),
      rules: [...ws.rules.values()].map(r => ({id: r.id, ...r.body})),
      pages: b.pages.map(p => ({id: p.id, name: p.name, widgets: p.widgets.map(w => ({id: w.id, title: w.title, w: w.w, parts: w.parts.map(x => x.kind)}))})), installed: Object.keys(b.installed)};
  });

  const saver = (kind: v2.V2Kind) => async ({id, body}: {id?: string; body: unknown}, owner: string) => {
    const out = await saveV2(owner, id ?? null, {kind, body});
    return {id: out.record.id, revision: out.record.revision, effects: out.effects};
  };
  tool('save_property', '속성 하나를 만들거나(id 없이) 고친다(id). body: {name, kind, role?, desc?, unit?, options?[{id,name,color,meaning}], max?, relation?{db,many}, formula?}.', {id: z.string().optional(), body: z.record(z.unknown())}, saver('property'));
  tool('save_database', 'DB(태그)를 만들거나 고친다. body: {name, icon?, desc?, properties: [속성 id], focus?}.', {id: z.string().optional(), body: z.record(z.unknown())}, saver('database'));
  tool('save_lens', '모아보기(저장한 필터)를 만들거나 고친다. body: {name, dbs, where, archived?, sort?}.', {id: z.string().optional(), body: z.record(z.unknown())}, saver('lens'));
  tool('save_signal', '상황을 만들거나 고친다. body: {name, measure:{dbs?,lens?,where?,of?,agg,period}, op, compare:{n}|{signal}}.', {id: z.string().optional(), body: z.record(z.unknown())}, saver('signal'));
  tool('save_rule', '규칙을 만들거나 고친다. body: {name, enabled?, mode auto|suggest, on:{kind,signal?,at?}, source:{lens?,dbs,where}, if, do:[...]}. 켜기 전에 preview_rule 로 보여 준다.', {id: z.string().optional(), body: z.record(z.unknown())}, saver('rule'));

  tool('query_items', '항목 읽기(계산 속성 포함). source: {lens?, dbs?, where?}; period(today|yesterday|week|last7|month|last30|all) 또는 from/to(YYYY-MM-DD).',
    {source: z.record(z.unknown()).optional(), period: z.enum(v2.PERIODS).optional(), from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(500).optional()},
    async ({source, period, from, to, limit}, owner) => {
      const ws = await loadWorkspace(owner), ctx = await ctxOf(owner);
      const [a, b] = period ? periodRange(period, ctx.today) : [from ?? '0000-01-01', to ?? '9999-12-31'];
      const all = query(ws, v2.Source.parse(source ?? {}) as SourceLike, ctx).map(x => itemView(ws, x, ctx)).filter(v => v.day >= a && v.day <= b);
      return {total: all.length, items: all.slice(0, limit ?? 100)};
    });
  tool('save_items', '항목 여러 개를 만들거나 고친다. items: [{id?, dbs?, text?, values?: {속성id: 값}, archived?}]. 고칠 때 values는 합쳐진다(null이면 지움). 규칙이 서버에서 돈다.',
    {items: z.array(z.object({id: z.string().optional(), dbs: z.array(z.string()).optional(), text: z.string().optional(), values: z.record(cell).optional(), archived: z.boolean().optional()})).min(1).max(100)},
    async ({items}, owner) => {
      const out = [];
      for (const it of items) {
        const ws = await loadWorkspace(owner), prior = it.id ? ws.items.get(it.id) : undefined;
        if (it.id && !prior) throw new WorkspaceError(404, `No item ${it.id}`);
        const values = {...(prior?.body.values ?? {})};
        for (const [k, val] of Object.entries(it.values ?? {})) { if (val === null) delete values[k]; else values[k] = val; }
        const body = {...(prior?.body ?? {}), ...(it.dbs ? {dbs: it.dbs} : {}), ...(it.text !== undefined ? {text: it.text} : {}), ...(it.archived !== undefined ? {archived: it.archived} : {}), values};
        const r = await saveV2(owner, it.id ?? null, {kind: 'item', body}, {ws});
        out.push({id: r.record.id, effects: r.effects, rulesRan: r.ran});
      }
      return {saved: out};
    });
  tool('delete_records', '항목·속성·DB·모아보기·상황·규칙을 지운다(이력은 남는다). 지우기 전에 사용자에게 확인한다.', {ids: z.array(z.string()).min(1).max(100)}, async ({ids}, owner) => {
    for (const id of ids) await deleteRecord(owner, id);
    return {deleted: ids.length};
  });
  tool('preview_rule', '저장한 규칙이 지금 어떤 항목을 어떻게 바꿀지 (켜기 전에 보여 준다).', {id: z.string()}, async ({id}, owner) => ({plans: await previewRule(owner, id)}));
  tool('suggestions', '"제안만" 규칙들이 지금 바꾸고 싶은 것. accept 로 하나씩 적용.', {accept: z.object({rule: z.string(), item: z.string()}).optional()}, async ({accept}, owner) => accept ? acceptSuggestion(owner, accept.rule, accept.item) : {plans: await listSuggestions(owner)});
  tool('tidy', '정리 도우미: 비슷한 이름의 속성, 안 쓰는 속성, 태그 없는 항목, 항목 없는 DB. merge 를 주면 속성을 합친다(값·필터·규칙·계산이 따라감).',
    {merge: z.object({from: z.string(), into: z.string()}).optional()}, async ({merge}, owner) => merge ? mergeProperties(owner, merge.from, merge.into) : tidyReport(await loadWorkspace(owner)));
  tool('save_pages', '페이지·위젯·부품 배치를 바꾼다(전체 pages 를 보낸다, 새 버전). 위젯 id·부품 id가 없으면 만든다. skin 은 바꿀 값만.',
    {pages: z.array(z.record(z.unknown())).max(20), skin: z.record(z.unknown()).optional()}, async ({pages, skin}, owner) => {
      const cur = (await getScreen(owner)).body as v2.ScreenBody;
      const withIds = pages.map(p => ({...p, id: typeof p.id === 'string' && /^[a-z0-9]{1,16}$/.test(p.id) ? p.id : localId(),
        widgets: ((p.widgets as Record<string, unknown>[] | undefined) ?? []).map(w => ({...w, id: typeof w.id === 'string' && /^[a-z0-9]{1,16}$/.test(w.id) ? w.id : localId(),
          parts: ((w.parts as Record<string, unknown>[] | undefined) ?? []).map(x => ({...x, id: typeof x.id === 'string' && /^[a-z0-9]{1,16}$/.test(x.id) ? x.id : localId()}))}))}));
      const next = v2.ScreenBody.safeParse({...cur, pages: withIds, skin: {...cur.skin, ...(skin ?? {})}});
      if (!next.success) throw new WorkspaceError(400, `Invalid pages: ${next.error.issues[0]?.path.join('.')} ${next.error.issues[0]?.message}`);
      const saved = await putScreen(owner, next.data);
      return {revision: saved.revision, pages: next.data.pages.map(p => ({id: p.id, name: p.name}))};
    });
  tool('list_templates', '설치할 수 있는 예시 템플릿(데이터)과 설치 여부.', {}, async (_a, owner) => {
    const installed = ((await getScreen(owner)).body as v2.ScreenBody).installed;
    return templateIndex().map(t => ({...t, installed: !!installed[t.id]}));
  });
  tool('install_template', '템플릿을 설치한다(필요한 템플릿을 먼저 설치). id 는 list_templates 의 id. 설치하면 사용자 것으로 복사된다. 사용자의 OK를 받고 부른다.', {id: z.string()}, async ({id}, owner) => {
    const index = templateIndex(), d = templatesDir();
    if (!d) throw new WorkspaceError(503, 'Templates are not available on this server.');
    const done: string[] = [];
    const run = async (tid: string, chain: string[]): Promise<void> => {
      const t = index.find(x => x.id === tid);
      if (!t) throw new WorkspaceError(404, `Unknown template ${tid}`);
      const installed = ((await getScreen(owner)).body as v2.ScreenBody).installed;
      if (installed[tid]) return;
      for (const r of t.requires) if (!chain.includes(r)) await run(r, [...chain, tid]);
      await installTemplate(owner, JSON.parse(readFileSync(path.join(d, t.file), 'utf8')));
      done.push(t.name);
    };
    await run(id, []);
    return {installed: done, url: litUrl()};
  });
  tool('set_timezone', '시간대와 하루 경계(기본 04:00)를 정한다.', {tz: z.string(), dayBoundary: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()}, async ({tz, dayBoundary}, owner) => putSettings(owner, {tz, dayBoundary: dayBoundary ?? (await getSettings(owner)).dayBoundary}));
}
export const _templatesForTest = () => readdirSync(templatesDir() ?? '.');

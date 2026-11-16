import {useEffect, useState} from 'react';
import {v2} from '@workspace/life-contract';
import {inferDatabase, itemDay, similarProperties, tidyReport, title, value, type Plan} from '@workspace/lit-core';
import {api, useLit} from './store.tsx';
import {PartView} from './Parts.tsx';
import {ItemSheet} from './Item.tsx';
import {MergeButton, PlanList} from './Data.tsx';
import {newItemBody, propsForItem} from './model.ts';
import {En, Sheet, ValueInput, fmt, nameOf} from './ui.tsx';

// ── Flow (흐름): every item lands on a day, whatever database it has — the one place where everything shows. ──
export function FlowScreen() {
  const {ws, today} = useLit(), [opened, setOpened] = useState<string | null>(null), [only, setOnly] = useState<string>('all'), [n, setN] = useState(14);
  const items = [...ws.items.values()].filter(x => !x.body.archived && (only === 'all' || (only === '@none' ? !x.body.dbs.length : x.body.dbs.includes(only))));
  const byDay = new Map<string, typeof items>();
  for (const it of items) { const d = itemDay(ws, it); byDay.set(d, [...(byDay.get(d) ?? []), it]); }
  const days = [...byDay.keys()].sort().reverse().slice(0, n);
  const capture = v2.Part.parse({id: 'flowcap', kind: 'capture'});
  return <div className="flow">
    <PartView part={capture} day={today} setDay={() => {}} />
    <div className="filter-chips"><button className={`chip ${only === 'all' ? 'on' : ''}`} onClick={() => setOnly('all')}>모두</button><button className={`chip ${only === '@none' ? 'on' : ''}`} onClick={() => setOnly('@none')}>태그 없음</button>{[...ws.databases.values()].map(d => <button key={d.id} className={`chip ${only === d.id ? 'on' : ''}`} onClick={() => setOnly(d.id)}>#{d.body.name}</button>)}</div>
    {days.map(d => <section key={d} className="flow-day"><h3>{d === today ? '오늘' : d}</h3><ul>{byDay.get(d)!.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(it => <li key={it.id}>
      <button className="line-title" onClick={() => setOpened(it.id)}>{title(ws, it) || <span className="muted">(이름 없음)</span>}</button>
      <span className="line-props">{it.body.dbs.map(db => <span key={db} className="pv tag">#{nameOf(ws, db)}</span>)}{propsForItem(ws, it).filter(p => p.body.role !== 'title' && p.body.role !== 'day').slice(0, 4).map(p => { const t = fmt(ws, p, value(ws, it, p.id)); return t ? <span key={p.id} className="pv">{p.body.name} {t}</span> : null; })}</span>
    </li>)}</ul></section>)}
    {!days.length && <p className="muted">아직 아무것도 없어요. 위에 한 줄 써 보세요.</p>}
    {byDay.size > n && <button onClick={() => setN(n + 14)}>더 보기</button>}
    {opened && <ItemSheet id={opened} onClose={() => setOpened(null)} />}
  </div>;
}

// ── Tidy (정리): lit points things out, the user decides. ───────────────────────────────────────────
export function TidyScreen() {
  const {ws, save, remove, toast} = useLit();
  const r = tidyReport(ws), [picked, setPicked] = useState<string[]>([]), [name, setName] = useState('');
  const guess = picked.length ? inferDatabase(ws, picked) : null;
  return <div className="tidy">
    <section><h3>비슷한 이름의 칸</h3>{r.similar.length ? r.similar.map(([a, b]) => <div key={a + b} className="row wrap"><b>{nameOf(ws, a)}</b> ↔ <b>{nameOf(ws, b)}</b><MergeButton from={a} into={b} done={() => {}} /><span className="muted small">(왼쪽을 오른쪽에)</span></div>) : <p className="muted small">없어요 ✓</p>}</section>
    <section><h3>안 쓰는 칸</h3>{r.unusedProperties.length ? <div className="chips">{r.unusedProperties.map(id => <button key={id} className="chip" onClick={() => { if (confirm(`“${nameOf(ws, id)}” 칸을 지울까요?`)) void remove(id); }}>{nameOf(ws, id)} ✕</button>)}</div> : <p className="muted small">없어요 ✓</p>}</section>
    <section><h3>태그 없는 항목 {r.untaggedItems.length}개 <En>DB로 묶기</En></h3>
      <ul className="pick-list">{r.untaggedItems.slice(0, 60).map(id => { const it = ws.items.get(id)!; return <li key={id}><label className="inline"><input type="checkbox" checked={picked.includes(id)} onChange={e => setPicked(e.target.checked ? [...picked, id] : picked.filter(x => x !== id))} /> {title(ws, it) || '(이름 없음)'} <span className="muted small">{itemDay(ws, it)}</span></label></li>; })}</ul>
      {guess && <div className="infer"><p className="small">고른 {guess.items}개가 쓰는 칸: {guess.properties.map(p => `${nameOf(ws, p.id)} ${p.share}%`).join(', ') || '없음'}</p>
        <div className="row"><input placeholder="새 DB 이름" value={name} onChange={e => setName(e.target.value)} />
          <button className="primary small" disabled={!name.trim()} onClick={async () => {
            const db = await save('database', {name: name.trim(), properties: guess.suggested}); if (!db) return;
            for (const id of picked) { const it = ws.items.get(id); if (it) await save('item', {...it.body, dbs: [...it.body.dbs, db.id]}, id); }
            toast(`${picked.length}개를 “${name.trim()}”로 묶었어요`); setPicked([]); setName('');
          }}>DB로 묶기</button>
          <select value="" onChange={async e => { const db = e.target.value; if (!db) return; for (const id of picked) { const it = ws.items.get(id); if (it) await save('item', {...it.body, dbs: [...it.body.dbs, db]}, id); } setPicked([]); }}><option value="">있는 DB에 넣기</option>{[...ws.databases.values()].map(d => <option key={d.id} value={d.id}>{d.body.name}</option>)}</select>
        </div></div>}
    </section>
    <section><h3>항목이 없는 DB</h3>{r.emptyDatabases.length ? <p className="small">{r.emptyDatabases.map(id => nameOf(ws, id)).join(', ')}</p> : <p className="muted small">없어요 ✓</p>}</section>
  </div>;
}

export function SuggestionsScreen() {
  const {runEffects, pull, toast} = useLit(), [plans, setPlans] = useState<Plan[] | null>(null);
  const load = () => void api.suggestions().then(r => setPlans(r.plans)).catch(e => toast((e as Error).message, 'error'));
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plans) return <p className="muted">불러오는 중…</p>;
  return <div className="suggest"><p className="muted small">“제안만” 규칙이 지금 바꾸고 싶어 하는 것들이에요. 눌러야 바뀌어요.</p>
    {plans.length ? <PlanList plans={plans} accept={async p => { try { const r = await api.accept(p.rule, p.item ?? ''); runEffects(r.effects); await pull(); load(); } catch (e) { toast((e as Error).message, 'error'); } }} /> : <p className="muted">제안이 없어요 ✓</p>}
  </div>;
}

type TemplateInfo = {file: string; id: string; name: string; desc: string; requires: string[]};
export function TemplatesScreen() {
  const {screen, reload, toast, setPage} = useLit(), [list, setList] = useState<TemplateInfo[]>([]), [busy, setBusy] = useState('');
  useEffect(() => { void fetch('/templates/index.json').then(r => r.json()).then(setList).catch(() => setList([])); }, []);
  const install = async (t: TemplateInfo, chain: string[] = []): Promise<string[]> => {
    let pages: string[] = [];
    for (const req of t.requires) if (!screen.installed[req] && !chain.includes(req)) { const dep = list.find(x => x.id === req); if (dep) pages = [...pages, ...await install(dep, [...chain, t.id])]; }
    const data = await fetch(`/templates/${t.file}`).then(r => r.json());
    const r = await api.install(data);
    toast(`“${t.name}” 설치 · ${r.created}개 만듦`);
    return [...pages, ...r.pages];
  };
  return <div className="templates"><p className="muted small">템플릿은 lit 문법으로 조립해 둔 예시예요. 설치하면 내 것으로 복사되고, 마음대로 고치거나 지워도 돼요.</p>
    <div className="palette">{list.map(t => <div key={t.id} className="palette-item">
      <b>{t.name}</b><span>{t.desc}</span>{t.requires.length > 0 && <span className="muted small">함께 설치: {t.requires.map(r => list.find(x => x.id === r)?.name ?? r).join(', ')}</span>}
      {screen.installed[t.id] ? <span className="small">✓ 설치됨</span> : <button className="primary small" disabled={!!busy} onClick={async () => { setBusy(t.id); try { const pages = await install(t); await reload(); if (pages[0]) setPage(pages[0]); } catch (e) { toast((e as Error).message, 'error'); } setBusy(''); }}>{busy === t.id ? '설치 중…' : '설치'}</button>}
    </div>)}</div>
    {!list.length && <p className="muted">템플릿 목록을 불러오지 못했어요.</p>}
  </div>;
}

const FONTS: [string, string][] = [['pretendard', '고딕'], ['plex', 'IBM Plex'], ['serif', '명조'], ['hand', '손글씨']];
export function SkinScreen() {
  const {screen, saveScreen} = useLit(), s = screen.skin, set = (x: Partial<typeof s>) => void saveScreen({...screen, skin: {...s, ...x}});
  return <div className="editor">
    {(['accent', 'background', 'surface', 'ink'] as const).map(k => <label key={k}><span className="k">{{accent: '강조색', background: '바탕', surface: '카드', ink: '글자'}[k]}</span><input type="color" value={s[k]} onChange={e => set({[k]: e.target.value})} /></label>)}
    <label><span className="k">글꼴</span><select value={s.font} onChange={e => set({font: e.target.value})}>{FONTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
    <label><span className="k">모서리</span><input type="range" min={0} max={24} value={s.radius} onChange={e => set({radius: Number(e.target.value)})} /></label>
  </div>;
}

/** A rule asked for a form (기록지 열기): saving it adds one item, linked back to the item that started the rule. */
export function FormModal() {
  const {form, closeForm, ws, save, today, toast} = useLit(), [vals, setVals] = useState<Record<string, v2.CellValue>>({});
  useEffect(() => setVals({}), [form]);
  if (!form) return null;
  const props = form.props.map(id => ws.properties.get(id)).filter(p => !!p);
  return <Sheet title={form.title || '기록하기'} onClose={closeForm}>
    <div className="form">{props.map(p => <label key={p!.id}><span className="k">{p!.body.name}</span><ValueInput p={p!} value={vals[p!.id] ?? null} onChange={v => setVals(x => ({...x, [p!.id]: v}))} /></label>)}
      <div className="row"><button className="primary" onClick={async () => { const body = newItemBody(ws, form.dbs, form.title, today, {...form.values, ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== null))}); if (await save('item', body)) { toast('기록했어요'); closeForm(); } }}>저장</button><button className="ghost" onClick={closeForm}>나중에</button></div>
    </div>
  </Sheet>;
}
export {similarProperties};

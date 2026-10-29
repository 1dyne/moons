// Personal MOONS (records kept in the browser) on the real AI: structuring and the MOONS chat.
// The browser sends only what is needed for one request; nothing is stored on the server.
import {randomUUID} from 'node:crypto';
import {ai} from './ai/index.ts';
import {PROMPT_VERSION, structureSchema, structureSystem, structureUser} from './prompts.ts';
import {fragmentsFallback, verifyStructure, type RawStructure} from './verify.ts';
import {asFrame, asSolo, asTextKind, type Planet} from '../thought.ts';
import {isOutlineNote, OUTLINE_RULES, outlineSchema, verifyOutline, type RawOutline} from './outline.ts';

// Personal structures (lib/model.ts) and the engine's shapes name a few things differently.
const toPersonal: Record<string, string> = {'흐름': '인과구조', '비교': '비교구조', '파편': '지식나열'};
const toEngine: Record<string, string> = {'인과구조': '흐름', '비교구조': '비교'};
const personalStructures = ['개요', '지식나열', '인과구조', '비교구조', '주장-근거', '이항대립', '문학', 'IRAC', 'ANT'];

export async function analyzePersonal(input: {sentences: string[]; title?: string; mediaType?: string; structure?: string; planets: {id: string; name: string}[]; notation?: string; skip?: Set<number>}) {
  // Lines explaining the user's own symbols are notes to MOONS: never shown to the model, never drawn.
  const skip = input.skip ?? new Set<number>();
  const planets: Planet[] = input.planets.map(p => ({id: p.id, name: p.name, color: '#000', x: 0, y: 0}));
  const context = input.title ? `기록 종류: ${input.mediaType ?? '메모'} · 제목: ${input.title}\n\n` : '';
  const notation = input.notation ?? '';
  const force = input.structure && input.structure !== '개요' ? `\n\n사용자가 고른 모양: 반드시 "${toEngine[input.structure] ?? input.structure}"로 그린다.` : '';
  // Long outline notes need the stronger model to keep every line and its nesting.
  const long = input.sentences.length - skip.size > 15 || input.sentences.join('').length > 1500;
  if (input.structure === '개요' || (!input.structure && isOutlineNote(input.sentences, skip))) {
    const outlined = await analyzeOutline(input, planets, context, notation, skip, long);
    if (outlined) return outlined;
  }
  let title = '', framing: Pick<RawStructure, 'frame' | 'solo' | 'text_kind'> = {};
  let feedback: string | undefined, verified: ReturnType<typeof verifyStructure> | null = null, model = '', lastPlanets: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai().json<RawStructure>({name: 'moons_structure', tier: long ? 'deep' : 'fast', system: structureSystem(planets), user: context + structureUser(input.sentences, undefined, feedback, skip) + force + notation, schema: structureSchema(planets)});
    model = res.model; lastPlanets = res.data.planets ?? []; framing = res.data; title = (res.data.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    verified = verifyStructure(res.data, input.sentences, planets, skip);
    if (verified.ok) break;
    feedback = verified.issues.join('\n');
  }
  const v = verified?.ok ? verified.value : fragmentsFallback(input.sentences, lastPlanets.filter(p => planets.some(pl => pl.id === p)), skip);
  const ids = new Map(v.nodes.map(n => [n.id, randomUUID()]));
  const structure = toPersonal[v.structure] ?? v.structure;
  return {
    structure: personalStructures.includes(structure) ? structure : '지식나열',
    nodes: v.nodes.map(n => ({id: ids.get(n.id)!, text: n.text, role: n.role, source: n.source, empty: n.empty, hesitant: n.hesitant || undefined, updates: []})),
    edges: v.edges.flatMap(e => ids.has(e.from) && ids.has(e.to) ? [{from: ids.get(e.from)!, to: ids.get(e.to)!, rel: e.rel ?? null}] : []),
    signals: v.signals.flatMap(s => ids.has(s.node) ? [{id: randomUUID(), nodeId: ids.get(s.node)!, kind: s.kind, reason: s.reason, state: 'open' as const}] : []),
    suggestedPlanets: v.planetIds, model, promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), reason: v.structureReason, suggestedTitle: title || undefined,
    // A note drawn from its own sentences after two failures has no reading of its build.
    ...(verified?.ok ? {frame: asFrame(framing.frame) ?? 'list', solo: asSolo(framing.solo) ?? 'listed', textKind: asTextKind(framing.text_kind)} : {}),
  };
}

type Input = Parameters<typeof analyzePersonal>[0];
/** Outline notes: sections the user made, each a diagram, table or plain lines. Falls back to one map on failure. */
async function analyzeOutline(input: Input, planets: Planet[], context: string, notation: string, skip: Set<number>, long: boolean) {
  let feedback: string | undefined, model = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ai().json<RawOutline>({name: 'moons_outline', tier: long ? 'deep' : 'fast', system: structureSystem(planets) + OUTLINE_RULES,
      user: context + structureUser(input.sentences, undefined, feedback, skip) + notation, schema: outlineSchema(planets)});
    model = res.model;
    const v = verifyOutline(res.data, input.sentences, planets, skip);
    if (!v.ok) { feedback = v.issues.join('\n'); continue; }
    const ids = new Map(v.value.nodes.map(n => [n.id, randomUUID()]));
    const id = (x: string | null) => x ? ids.get(x) ?? null : null;
    return {
      structure: '개요',
      nodes: v.value.nodes.map(n => ({id: ids.get(n.id)!, text: n.text, role: n.role, source: n.source, empty: n.empty, hesitant: n.hesitant || undefined, updates: []})),
      edges: v.value.edges.flatMap(e => ids.has(e.from) && ids.has(e.to) ? [{from: ids.get(e.from)!, to: ids.get(e.to)!, label: e.label ?? undefined, rel: e.rel ?? null}] : []),
      signals: v.value.signals.flatMap(sg => ids.has(sg.node) ? [{id: randomUUID(), nodeId: ids.get(sg.node)!, kind: sg.kind, reason: sg.reason, state: 'open' as const}] : []),
      sections: v.value.sections.map(sec => ({...sec, nodeIds: sec.nodeIds.flatMap(n => ids.has(n) ? [ids.get(n)!] : []),
        table: sec.table && {columns: sec.table.columns, rows: sec.table.rows.map(r => ({item: id(r.item), cells: r.cells.map(id)}))}})),
      suggestedPlanets: v.value.planetIds, model, promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(), reason: v.value.structureReason,
      suggestedTitle: (res.data.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || undefined, textKind: asTextKind(res.data.text_kind),
    };
  }
  return null;
}

const chatSystem = `너는 MOONS의 달이다. MOONS는 메타인지 훈련장이다. 사용자가 무엇을 알고, 무엇을 섞어 쓰고, 무엇을 아직 설명하지 못하는지 스스로 보게 돕는다.
규칙
- 답을 대신 정해주지 않는다. 판단은 사용자가 한다. 갈 수 있는 길과, 고르려면 알아야 할 것을 보여준다.
- 사용자가 고정한 노드(그때 사용자가 쓴 생각)가 있으면 그것을 근거로 말하고, 어느 노드를 보고 하는 말인지 밝힌다.
- 확신이 없는 사실은 단정하지 않는다. 틀렸을 수 있는 곳은 "확인해 볼 곳"으로 짚는다.
- 짧게 답한다. 보통 3~6문장. 마지막에 사용자가 스스로 설명해 볼 질문 하나를 던질 수 있다.
- 사용자가 쓴 언어로 답한다. 기본은 한국어.`;

export async function chatPersonal(input: {messages: {role: 'user' | 'assistant'; text: string}[]; context: {title: string; body: string; structure?: string | null; signals?: string[]}[]}) {
  const pinned = input.context.length ? `\n\n사용자가 고정한 노드\n${input.context.map((c, i) =>
    `[노드 ${i + 1}] ${c.title || '제목 없음'}${c.structure ? ` (모양: ${c.structure})` : ''}\n${c.body}${c.signals?.length ? `\n열린 신호: ${c.signals.join(' / ')}` : ''}`).join('\n\n')}` : '';
  const res = await ai().text({name: 'moons_personal_chat', tier: 'fast', system: chatSystem + pinned, messages: input.messages.map(m => ({role: m.role, content: m.text}))});
  return res.text;
}

// Outline notes: drawn section by section, the way the user grouped them. Headings are lines the user
// wrote (picked by number, never written by the model); a group without one keeps an empty heading slot.
// Each section is a diagram, a table or plain lines, and every node is still a verbatim slice of the note.
import {asFrame, asSolo, type Frame, type Planet, type Solo} from '../thought.ts';
import {frameProperty, relProperty, soloProperty, textKindProperty} from './prompts.ts';
import {norm, trimEdges, verifyStructure, type RawStructure} from './verify.ts';

export type SectionForm = 'diagram' | 'table' | 'lines';
export type Section = {id: string; heading: number | null; headingText: string; form: SectionForm; nodeIds: string[];
  table: {columns: string[]; rows: {item: string | null; cells: (string | null)[]}[]} | null; frame: Frame; solo: Solo};
type RawNode = RawStructure['nodes'][number];
export type RawOutline = {
  title?: string; structure_reason: string; text_kind?: string | null;
  sections: {heading: number | null; form: SectionForm; frame?: string; solo?: string; lines: number[]; nodes: RawNode[]; edges: RawStructure['edges'];
    table: {columns: string[]; rows: {item: string | null; cells: (string | null)[]}[]} | null}[];
  signals: RawStructure['signals']; planets: string[];
};

const HEADING = /^\s*(?:<[^<>]+>|\[[^\]]+\]|#{1,4}\s|.{1,30}[:：]\s*$)/u;
const BULLET = /^\s*(?:[*•\-–]|\d+[.)])\s/u;
/** A note reads as an outline when it has several lines and either a heading-like line or a run of bullets. */
export function isOutlineNote(sentences: string[], skip: Set<number>) {
  const lines = sentences.filter((_, i) => !skip.has(i));
  return lines.length >= 6 && (lines.some(l => HEADING.test(l)) || lines.filter(l => BULLET.test(l)).length >= 3);
}

export const OUTLINE_RULES = `

이번 노트는 개요형이다. 모양 하나를 고르지 말고, 사용자가 묶은 대로 섹션으로 나눠 그린다. (위 규칙 중 "모양 고르기"는 섹션마다 form으로 대신한다.)
O1. 섹션 나누기: 사용자가 제목으로 생각한 줄을 맥락으로 찾는다. "<제작>", "[평가]", "# 개요", "재료:" 같은 표시뿐 아니라, 짧은 명사구 뒤에 하위 항목이 이어지는 줄도 제목일 수 있다. heading은 그 줄 번호다. 제목을 새로 짓지 않는다. 제목 줄이 없는 묶음은 heading=null.
O2. lines: 그 섹션에 속하는 줄 번호(제목 줄 제외). 원문 순서대로, 모든 줄은 정확히 한 섹션에 들어간다.
O3. form: 항목 사이에 관계(A <-> B, 원인-결과, 상위-하위)가 있으면 "diagram", 여러 대상을 같은 기준으로 비교하면(diff. 등) "table", 관계 없이 설명만 늘어놓으면 "lines".
O4. diagram: nodes와 edges(상위→하위, 관계는 label에 사용자의 표기 그대로, 예 "<->"). lines: 줄마다 노드 하나, edges 없음. table: columns는 비교 기준 이름(사용자의 말에서), rows는 대상마다 {item: 대상 노드 id, cells: 기준별 노드 id 또는 null}. 사용자가 말하지 않은 칸은 null로 비워 둔다. 표의 대상·칸 노드도 그 섹션 nodes에 넣는다. table이 아니면 table=null.
O5. 노드 id는 노트 전체에서 겹치지 않게 쓴다 (예: s1n1, s2n3).
O6. 흐리거나 빠진 곳은 채우지 않고 그대로 둔다: 망설임은 hesitant, 빈 자리는 empty 노드.
O7. 섹션마다 frame과 solo를 고르고, 섹션 안 edges마다 rel을 단다 (위 "짜임·관계·이해 단계" 기준). form은 그리는 방법이고 frame은 사용자가 짠 방식이다: 표로 그린 비교는 compare, 화살표로 이은 단계는 sequence.`;

const nodeSchema = {
  type: 'object', additionalProperties: false, required: ['id', 'text', 'role', 'group', 'source', 'empty', 'hesitant'],
  properties: {id: {type: 'string'}, text: {type: 'string'}, role: {type: 'string'}, group: {type: ['string', 'null']},
    source: {type: 'array', items: {type: 'integer'}}, empty: {type: 'boolean'}, hesitant: {type: 'boolean'}},
};
export function outlineSchema(planets: Planet[]) {
  return {
    type: 'object', additionalProperties: false, required: ['title', 'structure_reason', 'text_kind', 'sections', 'signals', 'planets'],
    properties: {
      title: {type: 'string'}, structure_reason: {type: 'string'}, text_kind: textKindProperty,
      sections: {type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['heading', 'form', 'frame', 'solo', 'lines', 'nodes', 'edges', 'table'],
        properties: {
          heading: {type: ['integer', 'null']}, form: {type: 'string', enum: ['diagram', 'table', 'lines']}, frame: frameProperty, solo: soloProperty,
          lines: {type: 'array', items: {type: 'integer'}}, nodes: {type: 'array', items: nodeSchema},
          edges: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['from', 'to', 'label', 'rel'],
            properties: {from: {type: 'string'}, to: {type: 'string'}, label: {type: ['string', 'null']}, rel: relProperty}}},
          table: {anyOf: [{type: 'null'}, {type: 'object', additionalProperties: false, required: ['columns', 'rows'], properties: {
            columns: {type: 'array', items: {type: 'string'}},
            rows: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['item', 'cells'],
              properties: {item: {type: ['string', 'null']}, cells: {type: 'array', items: {type: ['string', 'null']}}}}},
          }}]},
        },
      }},
      signals: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['node', 'kind', 'reason', 'basis'],
        properties: {node: {type: 'string'}, kind: {type: 'string', enum: ['misunderstanding', 'study']}, reason: {type: 'string'}, basis: {type: 'string'}}}},
      planets: {type: 'array', items: {type: 'string', enum: planets.map(p => p.id)}},
    },
  };
}

/** "<제작>", "[평가]", "# 개요", "재료:" read as the words inside the mark. */
const headingText = (line: string) => trimEdges(norm(line)).replace(/^#{1,4}\s*/u, '')
  .replace(/^<([^<>]+)>$|^\[([^\]]+)\]$/u, (_, a?: string, b?: string) => a ?? b ?? '').replace(/\s*[:：]$/u, '').trim();

/** Checks every node like any structure, then places each one in its section. Headings never become nodes. */
export function verifyOutline(raw: RawOutline, sentences: string[], planets: Planet[], skip: Set<number>) {
  const valid = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < sentences.length && !skip.has(i as number);
  const rawSections = (raw.sections ?? []).filter(s => s && (valid(s.heading) || s.nodes?.length || s.lines?.length));
  if (!rawSections.length) return {ok: false as const, issues: ['섹션이 하나도 없음']};
  const headings = new Set<number>();
  for (const s of rawSections) if (valid(s.heading)) { if (headings.has(s.heading)) s.heading = null; else headings.add(s.heading); } else s.heading = null;
  const flat: RawStructure = {structure: '지식나열', structure_reason: raw.structure_reason, title: raw.title,
    nodes: rawSections.flatMap(s => s.nodes ?? []), edges: rawSections.flatMap(s => s.edges ?? []), signals: raw.signals ?? [], planets: raw.planets ?? []};
  const v = verifyStructure(flat, sentences, planets, new Set([...skip, ...headings]), true);
  if (!v.ok) return v;
  const {aliases, nodes} = v.value;
  const real = (id: string | null) => { if (!id) return null; const r = aliases.get(id) ?? id; return nodes.some(n => n.id === r) ? r : null; };
  // Where each section starts in the note, in reading order.
  const order = rawSections.map((s, k) => ({k, start: s.heading ?? Math.min(...(s.lines ?? []).filter(valid), ...(s.nodes ?? []).flatMap(n => n.source ?? []).filter(valid), Infinity)}))
    .sort((a, b) => a.start - b.start);
  const declared = new Map<string, number>();
  rawSections.forEach((s, k) => (s.nodes ?? []).forEach(n => { const r = real(n.id); if (r && !declared.has(r)) declared.set(r, k); }));
  const sectionOfLine = (i: number) => {
    const owner = rawSections.findIndex(s => (s.lines ?? []).includes(i));
    if (owner >= 0) return owner;
    let k = order[0]!.k;
    for (const o of order) if (o.start <= i) k = o.k;
    return k;
  };
  const members = rawSections.map(() => [] as string[]);
  for (const n of nodes) {
    const k = declared.get(n.id) ?? (n.source.length ? sectionOfLine(Math.min(...n.source)) : order[0]!.k);
    members[k]!.push(n.id);
  }
  const firstLine = (id: string) => Math.min(...(nodes.find(n => n.id === id)?.source ?? []), Infinity);
  const sections: Section[] = order.map(({k}, idx) => {
    const s = rawSections[k]!, nodeIds = members[k]!.sort((a, b) => firstLine(a) - firstLine(b));
    let table: Section['table'] = null;
    if (s.form === 'table' && s.table?.columns?.length) {
      const columns = s.table.columns.slice(0, 8).map(c => String(c).trim().slice(0, 30));
      const rows = (s.table.rows ?? []).slice(0, 30).map(r => ({item: real(r.item), cells: columns.map((_, c) => real(r.cells?.[c] ?? null))}))
        .filter(r => r.item || r.cells.some(Boolean));
      if (rows.length) table = {columns, rows};
    }
    const hasEdges = v.value.edges.some(e => nodeIds.includes(e.from) && nodeIds.includes(e.to));
    // A diagram needs at least one relation inside the section; otherwise the lines are shown as written.
    const form: SectionForm = table ? 'table' : hasEdges ? 'diagram' : 'lines';
    return {id: `sec${idx + 1}`, heading: s.heading, headingText: s.heading === null ? '' : headingText(sentences[s.heading]!), form, nodeIds, table,
      frame: asFrame(s.frame) ?? (table ? 'compare' : 'list'), solo: asSolo(s.solo) ?? (hasEdges ? 'linked' : 'listed')};
  }).filter(s => s.heading !== null || s.nodeIds.length);
  return {ok: true as const, value: {...v.value, sections}};
}

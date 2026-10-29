import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOutline, type RawOutline} from '../lib/server/outline.ts';
import {partsOf, verifyStructureComparison} from '../lib/server/v5/structure-compare.ts';
import {carryUserChoices} from '../lib/server/v5/user-choices.ts';
import type {Entry} from '../lib/server/v5/types.ts';
import {verifyEntryQuotes} from '../lib/server/v5/analysis.ts';

type Analysis = NonNullable<Entry['analysis']>;
const node = (id: string, text: string) => ({id, text, role: 'concept', source: [0], empty: false, updates: []});
const analysis = (extra: Partial<Analysis> = {}): Analysis => ({structure: '개요', model: 'm', promptVersion: 'p', createdAt: 't', signals: [], suggestedPlanets: [],
  nodes: [node('a', '제작'), node('b', '평가'), node('c', '오목한 물체'), node('d', 'convex decomposition')],
  edges: [{from: 'a', to: 'b', rel: null}, {from: 'c', to: 'd', rel: 'cause'}],
  sections: [{id: 'sec1', heading: 0, headingText: '단계', form: 'diagram', nodeIds: ['a', 'b'], table: null, frame: 'list'},
    {id: 'sec2', heading: null, headingText: '', form: 'diagram', nodeIds: ['c', 'd'], table: null, frame: 'list'}], ...extra});

const original = ['먼저 모양을 만들고, 그다음 평가한다.', '문제는 오목한 물체다.', '그래서 convex decomposition으로 근사한다.', '측정값과 아닌 것을 나눈다.'];

test('outline sections carry the frame and SOLO level, and lines their relation', () => {
  const lines = ['<제작>', '점 -> 면', '면 -> 격자', '재구성', '생성', '평가 기준', '끝'];
  const n = (id: string, text: string, source: number[]) => ({id, text, role: 'concept', group: null, source, empty: false, hesitant: false});
  const raw: RawOutline = {structure_reason: '', signals: [], planets: [], sections: [
    {heading: 0, form: 'diagram', frame: 'sequence', solo: 'linked', lines: [1, 2], nodes: [n('a', '점', [1]), n('b', '면', [1, 2]), n('c', '격자', [2])],
      edges: [{from: 'a', to: 'b', label: '->', rel: 'sequence'}, {from: 'b', to: 'c', label: '->', rel: 'nonsense'}], table: null},
    {heading: null, form: 'lines', frame: 'made-up', solo: undefined, lines: [3, 4, 5, 6], nodes: [n('d', '재구성', [3]), n('e', '생성', [4])], edges: [], table: null},
  ]};
  const v = verifyOutline(raw, lines, [], new Set());
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.value.sections[0]!.frame, 'sequence');
  assert.equal(v.value.sections[0]!.solo, 'linked');
  assert.equal(v.value.sections[1]!.frame, 'list'); // an unknown frame falls back to a plain list
  assert.equal(v.value.sections[1]!.solo, 'listed');
  assert.deepEqual(v.value.edges.map(e => e.rel), ['sequence', null]); // an unknown relation is left unread
});

test('the original is read only from verbatim signals; without one there is no reading', () => {
  const a = analysis();
  const raw = {text_kind: 'descriptive', relations: [], missed: [{original: [3, 1], frame: 'compare', note: '원문은 측정값과 아닌 것을 나눠요.'}], sections: [
    {section: 'sec1', original: [0], orig_frame: 'sequence', signals: [{sentence: 0, words: '먼저'}, {sentence: 0, words: '그다음'}], note: '원문은 "먼저 … 그다음"으로 이어요.'},
    {section: 'sec2', original: [1, 2], orig_frame: 'problem', signals: [{sentence: 1, words: '문제가 된다'}], note: '문제→해결이에요.'},
  ]};
  const {issues, value} = verifyStructureComparison(raw, original, partsOf(a), a.edges, 'Korean');
  assert.deepEqual(issues, []);
  assert.equal(value.sections[0]!.origFrame, 'sequence');
  assert.deepEqual(value.sections[0]!.signals.map(s => s.words), ['먼저', '그다음']);
  assert.equal(value.sections[1]!.origFrame, null); // "문제가 된다" is not in sentence 1, so no signal and no reading
  assert.equal(value.sections[1]!.note, '');
  assert.deepEqual(value.missed.map(m => m.original), [[3]]); // sentence 1 already belongs to a section
  assert.equal(value.textKind, 'descriptive');
});

test('a section the model left out is marked skipped, and relations must be lines the user drew', () => {
  const a = analysis();
  const raw = {text_kind: null, missed: [], sections: [{section: 'sec1', original: [0], orig_frame: 'sequence', signals: [{sentence: 0, words: '먼저'}], note: 'Original goes first then.'}],
    relations: [{from: 'c', to: 'd', orig_rel: 'solution', original: [2], note: '원문은 해결로 이어요.'}, {from: 'a', to: 'd', orig_rel: 'cause', original: [0], note: '없는 선'}]};
  const {issues, value} = verifyStructureComparison(raw, original, partsOf(a), a.edges, 'Korean');
  assert.equal(issues.length, 1);
  assert.equal(value.sections[1]!.skipped, true);
  assert.equal(value.sections[0]!.note, ''); // a note in the wrong language is dropped, the reading stays
  assert.deepEqual(value.relations.map(r => [r.from, r.to, r.origRel]), [['c', 'd', 'solution']]);
});

test('a note without sections is compared as one part', () => {
  const a = analysis({sections: undefined, frame: 'cause'});
  assert.deepEqual(partsOf(a).map(p => [p.id, p.frame, p.nodes.length]), [['all', 'cause', 4]]);
});

test('restructuring keeps the frames, relations and text kind the user chose', () => {
  const old = analysis({textKind: 'normative', textKindBy: 'user'});
  old.sections![0]!.frame = 'sequence'; old.sections![0]!.frameBy = 'user';
  old.sections![1]!.frame = 'problem'; old.sections![1]!.frameBy = 'user';
  old.edges[1]!.rel = 'solution'; old.edges[1]!.relBy = 'user';
  const next = analysis({textKind: 'descriptive', nodes: [node('x', '제작'), node('y', '평가'), node('z', '오목한 물체'), node('w', 'convex decomposition')],
    edges: [{from: 'x', to: 'y', rel: 'kind'}, {from: 'z', to: 'w', rel: 'cause'}],
    sections: [{id: 'sec1', heading: 0, headingText: '단계', form: 'diagram', nodeIds: ['x', 'y'], table: null, frame: 'list'},
      {id: 'sec2', heading: null, headingText: '', form: 'diagram', nodeIds: ['z', 'w'], table: null, frame: 'cause'}]});
  const kept = carryUserChoices(old, next);
  assert.equal(kept.textKind, 'normative');
  assert.deepEqual(kept.sections!.map(s => [s.frame, s.frameBy]), [['sequence', 'user'], ['problem', 'user']]);
  assert.deepEqual(kept.edges.map(e => [e.rel, e.relBy]), [['kind', undefined], ['solution', 'user']]); // MOONS's own reading is not carried over
});

test('a renamed node keeps its quote: the wording is checked for size, and survives restructuring', () => {
  const old = analysis();
  old.nodes[0]!.edited = '제작 단계';
  const entry = (a: Analysis) => ({id: 'e', kind: 'dump' as const, body: '제작 평가 오목한 물체 convex decomposition', sentences: ['제작 평가 오목한 물체 convex decomposition'], planetIds: [], createdAt: '', locked: true, status: 'done', analysis: a});
  assert.doesNotThrow(() => verifyEntryQuotes(entry(old)));
  const tooLong = analysis(); tooLong.nodes[0]!.edited = 'x'.repeat(501);
  assert.throws(() => verifyEntryQuotes(entry(tooLong)));
  const next = carryUserChoices(old, analysis());
  assert.equal(next.nodes[0]!.edited, '제작 단계');
  assert.equal(next.nodes[0]!.text, '제작');
});

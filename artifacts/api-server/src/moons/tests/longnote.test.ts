import test from 'node:test';
import assert from 'node:assert/strict';
import {splitSentences} from '../lib/thought.ts';
import {verifyStructure, fragmentsFallback, type RawStructure} from '../lib/server/verify.ts';
import {nodeCap} from '../lib/server/prompts.ts';
import {canResplit, isResplit, validateStore} from '../lib/server/v5/workspace-store.ts';
import type {Entry, Store} from '../lib/server/v5/types.ts';

const outline = `<제작>
* 모양 무엇인가 - 점, 면, 격자 [ctrl.F]
* 시각 <-> 쪼개짐
diff. PhysXVerse 비교
이때 오목한 물체가 더 어렵다. 오목 물체는 convex hull 이라 말한다.
// 내 말로 다시
<평가>`;

test('outline notes keep every line, verbatim', () => {
  const s = splitSentences(outline);
  assert.deepEqual(s, ['<제작>', '* 모양 무엇인가 - 점, 면, 격자 [ctrl.F]', '* 시각 <-> 쪼개짐', 'diff. PhysXVerse 비교', '이때 오목한 물체가 더 어렵다.', '오목 물체는 convex hull 이라 말한다.', '// 내 말로 다시', '<평가>']);
  assert.ok(s.every(x => outline.includes(x)));
});

test('prose still splits at sentence ends, not inside numbers or markers', () => {
  assert.deepEqual(splitSentences('버전 3.5 기준! 정말? 네. 그래요'), ['버전 3.5 기준!', '정말?', '네.', '그래요']);
  assert.deepEqual(splitSentences('A vs. B is close. done'), ['A vs. B is close.', 'done']);
  assert.deepEqual(splitSentences('   '), []);
});

const lines = Array.from({length: 20}, (_, i) => `* 항목 ${i + 1} 설명`);
const raw = (nodes: RawStructure['nodes']): RawStructure => ({structure: '지식나열', structure_reason: '', nodes, edges: [{from: 'b', to: 'a', label: null}], signals: [{node: 'b', kind: 'study', reason: '확인', basis: 'gap'}], planets: []});
const node = (id: string, text: string, source: number[]) => ({id, text, role: 'concept', group: null, source, empty: false, hesitant: false});

test('long notes: duplicates merge, skipped lines come back as fragments', () => {
  const v = verifyStructure(raw([node('a', '항목 1 설명', [0]), node('b', '항목 1 설명', [0]), node('c', '항목 2 설명', [1])]), lines, []);
  assert.ok(v.ok);
  if (!v.ok) return;
  const texts = v.value.nodes.map(n => n.text);
  assert.equal(texts.filter(t => t === '항목 1 설명').length, 1);
  assert.equal(new Set(v.value.nodes.flatMap(n => n.source)).size, 20); // every line lands somewhere
  assert.equal(v.value.signals[0]!.node, 'a'); // signal on the duplicate moves to the kept node
  assert.deepEqual(v.value.edges, []); // b→a became a→a and is dropped
});

test('node cap grows with long notes, short speech stays at 12', () => {
  assert.equal(nodeCap(5), 12);
  assert.equal(nodeCap(27), 27);
  assert.equal(nodeCap(90), 40);
  assert.equal(fragmentsFallback(lines).nodes.length, 20);
});

const old = (extra: Partial<Entry> = {}): Entry => ({id: 'e1', kind: 'dump', body: outline, sentences: ['이때 오목한 물체가 더 어렵다.'], planetIds: [], createdAt: '2026-10-01T00:00:00Z', locked: true, status: 'done', ...extra});
const store = (e: Entry) => ({version: 1, entries: [e], planets: []}) as unknown as Store;

test('an older plain note may re-split from its unchanged body, nothing else', () => {
  const before = old();
  assert.ok(canResplit(before));
  const fixed = {...before, sentences: splitSentences(outline)};
  assert.ok(isResplit(fixed));
  assert.doesNotThrow(() => validateStore(store(fixed), store(before)));
  assert.throws(() => validateStore(store({...before, sentences: ['<제작>']}), store(before)), /locked/);
  const compared = old({comparison: {materialEntryId: 'm', materialTitle: 'x', summary: '', items: [], quotes: []}} as Partial<Entry>);
  assert.ok(!canResplit(compared));
  assert.throws(() => validateStore(store({...compared, sentences: splitSentences(outline)}), store(compared)), /locked/);
});

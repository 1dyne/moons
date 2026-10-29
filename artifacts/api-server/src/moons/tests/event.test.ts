import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyStructure, fragmentsFallback} from '../lib/server/verify.ts';
import {redact} from '../lib/server/redact.ts';
import {splitSentences} from '../lib/thought.ts';

const planets = [{id: 'payment', name: '결제', color: '#000', x: 0, y: 0}];
const sentences = splitSentences('토스 결제창 띄우고, 결제되면 성공 페이지로 넘어오니까 거기서 DB에 결제완료 저장했어요. 웹훅은 뭔지 잘 모르겠어요.');
const raw = (nodes: {id: string; text: string; source: number[]; empty?: boolean}[]) => ({
  structure: '흐름', structure_reason: 'r',
  nodes: nodes.map(n => ({role: 'step', group: null, hesitant: false, empty: false, ...n})),
  edges: [{from: 'n1', to: 'n2', label: null}, {from: 'n2', to: 'ghost', label: null}],
  signals: [{node: 'n2', kind: 'misunderstanding' as const, reason: '확인해 보세요', basis: 'made-up'}],
  planets: ['payment', 'nope'],
});

test('verbatim slices of the original pass', () => {
  const r = verifyStructure(raw([{id: 'n1', text: '토스 결제창 띄우고', source: [0]}, {id: 'n2', text: '거기서 DB에 결제완료 저장했어요', source: [0]}]), sentences, planets);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.edges.length, 1, 'edges to unknown nodes are dropped');
  assert.deepEqual(r.value.planetIds, ['payment'], 'unknown planets are dropped');
  assert.equal(r.value.signals[0].kind, 'study', 'misunderstanding without a valid basis is downgraded');
});

test('rewritten text is rejected', () => {
  const r = verifyStructure(raw([{id: 'n1', text: '토스 결제창을 띄운다', source: [0]}, {id: 'n2', text: '웹훅은 뭔지 잘 모르겠어요', source: [1]}]), sentences, planets);
  assert.equal(r.ok, false);
});

test('wrong source index is repaired when the text exists elsewhere', () => {
  const r = verifyStructure(raw([{id: 'n1', text: '웹훅은 뭔지 잘 모르겠어요', source: [0]}, {id: 'n2', text: '토스 결제창 띄우고', source: [1]}]), sentences, planets);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value.nodes[0].source, [1]);
});

test('empty nodes carry no text', () => {
  const r = verifyStructure(raw([{id: 'n1', text: '토스 결제창 띄우고', source: [0]}, {id: 'n2', text: '지어낸 웹훅 설명', source: [], empty: true}]), sentences, planets);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.nodes[1].text, '');
});

test('fallback keeps every sentence as written', () => {
  const f = fragmentsFallback(sentences);
  assert.deepEqual(f.nodes.map(n => n.text), sentences);
});

test('secrets and contacts are masked', () => {
  const r = redact('키는 sk-proj-abcdefghijklmnop1234 이고 토스는 test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R, 연락은 010-1234-5678 / me@example.com');
  assert.equal(r.count, 4);
  assert.ok(!/sk-proj|test_sk|010-1234|example\.com/.test(r.text));
});

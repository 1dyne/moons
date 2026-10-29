import test from 'node:test';
import assert from 'node:assert/strict';
import {contentLines, explanationOrder, verbatim, verifyClaims, type V3Edge} from '../lib/server/structure-v3.ts';

const sentences = ['collider의 역할', 'collider는 부딪힘을 계산한다.', '문제는 오목한 물체다.', '그래서 convex  decomposition으로 근사한다.'];
const raw = (claims: object[]) => ({title: '', text_kind: null, sections: [{heading: 0, lines: [1, 2, 3], frame: 'problem', signals: [], solo: null, table: null}], claims}) as Parameters<typeof verifyClaims>[0];

test('terms are cut from the sentence itself, spacing and case aside', () => {
  assert.equal(verbatim('Convex decomposition', [sentences[3]!]), 'convex  decomposition');
  assert.equal(verbatim('convex hull', [sentences[3]!]), null);
});

test('a claim needs sentences that hold both its terms; implied needs a marker', () => {
  const v = verifyClaims(raw([
    {subj: 'collider', pred: '계산', obj: '부딪힘', sentences: [1], kind: 'explicit', marker: null},
    {subj: '오목한 물체', pred: '해결', obj: 'convex decomposition', sentences: [2, 3], kind: 'implied', marker: '그래서'},
    {subj: '오목한 물체', pred: '해결', obj: 'convex decomposition', sentences: [2, 3], kind: 'implied', marker: null},
    {subj: 'collider', pred: 'x', obj: 'convex hull', sentences: [1], kind: 'explicit', marker: null},
    {subj: 'collider', pred: 'x', obj: '부딪힘', sentences: [], kind: 'explicit', marker: null},
  ]), sentences);
  assert.equal(v.claims.length, 2);
  assert.equal(v.claims[1]!.obj, 'convex  decomposition');
  assert.equal(v.issues.length, 3);
  assert.deepEqual(v.missing, []);
});

test('headings and very short lines are not content', () => {
  assert.deepEqual(contentLines(['제목', '짧다.', '이 문장은 내용이 있다.'], new Set([0])), [2]);
});

test('explanation order follows the spine and puts definitions first', () => {
  const e = (from: string, to: string, rel: V3Edge['rel'], role: V3Edge['role'], c: string): V3Edge => ({from, to, rel, role, claimIds: [c]});
  const edges = [e('b', 'c', 'sequence', 'spine', 'c3'), e('a', 'b', 'sequence', 'spine', 'c1'), e('b', 'x', 'property', 'cross', 'c4'), e('a', 'y', 'kind', 'cross', 'c2')];
  const claims = ['c1', 'c2', 'c3', 'c4'].map((id, i) => ({id, subj: '', pred: '', obj: '', sentences: [i], kind: 'explicit' as const}));
  const order = explanationOrder({nodes: ['a', 'b', 'c', 'x', 'y'].map(id => ({id})), edges, claims, sections: [{nodeIds: ['a', 'b', 'c', 'x', 'y']}]});
  assert.deepEqual(order.map(x => `${x.from}${x.to}`), ['ay', 'ab', 'bx', 'bc']);
});

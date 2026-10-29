import test from 'node:test';
import assert from 'node:assert/strict';
import {isOutlineNote, verifyOutline, type RawOutline} from '../lib/server/outline.ts';

const note = ['*[ctrl+F]는 찾아 채울 곳', '<제작>', '* 시각 <-> 쪼개짐', '* 모양 무엇인가 [ctrl+F]', '<평가>', 'diff. PhysX 비교', 'PhysX 빠름', 'Bullet 느림', '이건 그냥 메모', '마지막 줄'];
const n = (id: string, text: string, source: number[], extra: Partial<RawOutline['sections'][number]['nodes'][number]> = {}) =>
  ({id, text, role: 'concept', group: null, source, empty: false, hesitant: false, ...extra});
const skip = new Set([0]);

test('outline notes are recognised by headings or bullets', () => {
  assert.ok(isOutlineNote(note, skip));
  assert.ok(!isOutlineNote(['오늘은 산책을 했다.', '생각이 느슨해졌다.'], new Set()));
});

test('sections keep the user\'s headings, empty slots, tables with blanks, and every line', () => {
  const raw: RawOutline = {title: '시뮬레이션 에셋', structure_reason: '', signals: [], planets: [], sections: [
    {heading: 1, form: 'diagram', lines: [2, 3], nodes: [n('a', '시각', [2]), n('b', '쪼개짐', [2]), n('c', '모양 무엇인가 [ctrl+F]', [3], {hesitant: true})], edges: [{from: 'a', to: 'b', label: '<->'}], table: null},
    {heading: 4, form: 'table', lines: [5, 6, 7], nodes: [n('d', 'PhysX', [6]), n('e', '빠름', [6]), n('f', 'Bullet', [7])], edges: [],
      table: {columns: ['속도', '정확도'], rows: [{item: 'd', cells: ['e', null]}, {item: 'f', cells: [null, null]}]}},
    {heading: 99, form: 'lines', lines: [8], nodes: [n('g', '이건 그냥 메모', [8])], edges: [], table: null},
  ]};
  const v = verifyOutline(raw, note, [], skip);
  assert.ok(v.ok);
  if (!v.ok) return;
  const [s1, s2, s3] = v.value.sections;
  assert.equal(s1!.headingText, '제작');
  assert.equal(s1!.form, 'diagram');
  assert.equal(s2!.form, 'table');
  assert.deepEqual(s2!.table!.rows[0]!.cells, ['e', null]); // the blank the user left stays blank
  assert.equal(s3!.heading, null); // an invented heading number is not a heading
  assert.equal(s3!.headingText, '');
  const covered = new Set(v.value.nodes.flatMap(x => x.source));
  for (const i of [2, 3, 5, 6, 7, 8, 9]) assert.ok(covered.has(i), `line ${i} kept`);
  assert.ok(!covered.has(0) && !covered.has(1) && !covered.has(4)); // annotation and headings are not nodes
  assert.ok(v.value.sections.flatMap(s => s.nodeIds).length === v.value.nodes.length); // every node sits in a section
});

test('an outline with no sections is rejected so the single map is used instead', () => {
  assert.ok(!verifyOutline({structure_reason: '', sections: [], signals: [], planets: []}, note, [], skip).ok);
});

test('user marks keep their brackets; headings read as the words inside', async () => {
  const {trimEdges} = await import('../lib/server/verify.ts');
  assert.equal(trimEdges('Rigid, Deformadble, Articulated [ctrl+F]'), 'Rigid, Deformadble, Articulated [ctrl+F]');
  assert.equal(trimEdges('<평가> 무엇을 보고 잘 만들었다고 하나'), '<평가> 무엇을 보고 잘 만들었다고 하나');
  assert.equal(trimEdges('"(괄호 하나만'), '괄호 하나만');
  assert.equal(trimEdges('끝났다.'), '끝났다');
});

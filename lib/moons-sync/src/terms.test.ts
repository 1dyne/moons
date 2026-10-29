import test from 'node:test';
import assert from 'node:assert/strict';
import {alignSentences, examplesOf, findSpans, inflections, matcher, mergeTerm, wordDiff, type Linkable} from './terms.ts';

const T = (name: string, term: Linkable['term'] = {}, extra: Partial<Linkable> = {}): Linkable => ({id: name, name, aliases: [], kind: 'term', term, ...extra});
const day = [T('careen', {pos: 'v.'}), T('swerve', {pos: 'v.', collocations: ['swerve to avoid']}), T('veer', {pos: 'v.', collocations: ['veer off the road']}), T('jolt', {collocations: ['jolt to a stop']}),
  T('skid', {pos: 'v.', collocations: ['skid on ice']}), T('trudge', {pos: 'v.'}), T('trail', {collocations: ['trail behind']}), T('crooked', {pos: 'adj.'}),
  T('be backed up', {pos: 'phr.'}), T('pull over', {pos: 'phr.'}), T('run', {forms: ['ran']}, {autoLink: false}), T('reimburse', {pos: 'v.', collocations: ['reimburse A for B']})];
const hits = (text: string, cs = day) => findSpans(text, cs).map(s => `${s.concept.name}:${text.slice(s.start, s.end)}`);

test('regular forms, doubling and the spoken -in\'', () => {
  assert.ok(inflections('skid', 'v.').includes('skidded') && inflections('skid', 'v.').includes('skidding'));
  assert.ok(inflections('trudge', 'v.').includes('trudged') && inflections('trudge', 'v.').includes('trudging'));
  assert.ok(!inflections('careen', 'v.').includes('careenned'));
  assert.deepEqual(hits("Just swervin' (swerving) — the taxi careened, careening, and I trudged."), ['swerve:swervin', 'swerve:swerving', 'careen:careened', 'careen:careening', 'trudge:trudged']);
});

test('the scenario words link, phrases first, with one word slipped in', () => {
  assert.deepEqual(hits('Surely the taxi must jolted to a stop. That gave me a jolt.'), ['jolt:jolted to a stop', 'jolt:jolt']);
  assert.deepEqual(hits("So now he's trailing behind almost 20%. A trail of blood."), ['trail:trailing behind', 'trail:trail']);
  assert.deepEqual(hits('Traffic is badly backed up. The cop pulled me over. I veered off the road, then skidded on ice.'), ['be backed up:is badly backed up', 'pull over:pulled me over', 'veer:veered off the road', 'skid:skidded on ice']);
  assert.deepEqual(hits('They reimbursed him for the trip. A crooked politician.'), ['reimburse:reimbursed him for', 'crooked:crooked']);
});

test('no link across sentences, none for switched-off words, none inside other words', () => {
  assert.deepEqual(hits('He pulled. Over there.'), []);
  assert.deepEqual(hits('I ran and run.'), [], 'autoLink:false');
  assert.deepEqual(hits('the trailer, a skiddy floor'), []);
});

test('other concepts match as written, Korean included', () => {
  const cs = [{id: 'k', name: '인지 부하', aliases: [], kind: 'theory'}, {id: 'e', name: 'ELK', aliases: ['계층형 레이아웃'], kind: 'tool'}];
  assert.deepEqual(hits('인지 부하를 줄이는 ELK와 계층형 레이아웃, ELKS는 아니다', cs), ['인지 부하:인지 부하', 'ELK:ELK', 'ELK:계층형 레이아웃']);
});

test('merging a term joins lists and replaces given fields', () => {
  const {term, changed} = mergeTerm({pos: 'v.', forms: ['ran'], collocations: ['run out'], confirmed: true}, {pos: 'v.', meaningKo: '달리다', forms: ['Ran', 'runs'], collocations: ['run out']});
  assert.deepEqual(term, {pos: 'v.', meaningKo: '달리다', forms: ['ran', 'runs'], collocations: ['run out']});
  assert.deepEqual(changed, ['meaningKo', 'forms']);
});

test('sentences pair up, corrections find their sentence, and the diff marks what changed', () => {
  const rows = alignSentences(['Did you heard the news?', 'A trail of blood were detected.', 'Bye.'], ['Did you hear the news?', 'A trail of blood was detected.', 'Bye.'], [{from: 'were', to: 'was', reason: '단수'}]);
  assert.deepEqual(rows.map(r => [r.orig, r.rev]), [[0, 0], [1, 1], [2, 2]]);
  assert.deepEqual(rows[1].reasons, ['were → was · 단수']);
  assert.deepEqual(wordDiff('Did you heard it', 'Did you hear it').filter(p => p.op !== 'same').map(p => `${p.op}:${p.text}`), ['del:heard', 'add:hear']);
});

test('examples: approved versions first, each sentence with who wrote it', () => {
  const careen = day[0];
  const entries = [
    {id: 'n1', kind: 'dump', body: 'The taxi careened.', sentences: ['The taxi careened.'], createdAt: '2026-10-29T01:00:00Z', revision: {sentences: ['The taxi careened away.'], by: ['user_approved'], approvedAt: '2026-10-29T02:00:00Z'}},
    {id: 'n2', kind: 'media', body: 'Cars careen.', sentences: ['Cars careen.'], createdAt: '2026-10-29T03:00:00Z', meta: {source: 'Claude (AI material, not your words)'}},
    {id: 'n3', kind: 'record', body: 'I careened.\ncareen wrong', sentences: ['I careened.', 'careen wrong'], createdAt: '2026-10-29T04:00:00Z', meta: {lineBy: ['user', 'satellite']}},
  ];
  const ex = examplesOf(entries, careen, matcher(day));
  assert.deepEqual(ex.map(x => `${x.author}:${x.text}`), ['user_approved:The taxi careened away.', 'user:I careened.', 'user:The taxi careened.', 'material:careen wrong', 'ai:Cars careen.']);
});

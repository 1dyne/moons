import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {AnyRecord} from '@workspace/life-contract';
import {Flow, Logic, aggregate, checkTemplate, cleanCss, entriesOf, flowSentence, matches, periodRange, renderTemplate, runFlows, suggestLinks, type E} from './index.ts';

let n = 0;
const entry = (type: string, day: string, body: Record<string, unknown> = {}, revision = 1) => ({id: `E${++n}`, kind: 'entry', revision, logicalDay: day, deletedAt: null, createdAt: '', updatedAt: '', tz: 'Asia/Seoul', source: {type: 'planner', confirmed: true},
  body: {type, verb: 'did', at: `${day}T09:00:00.000Z`, end: null, value: null, fields: {}, links: [], ...body}}) as unknown as E;

test('conditions read fields, duration and verb', () => {
  const e = entry('sleep', '2026-11-11', {verb: 'ended', at: '2026-11-10T15:00:00.000Z', end: '2026-11-10T20:30:00.000Z', fields: {q: 3, tags: ['꿈']}}).body;
  assert.ok(matches(e, [{field: 'duration', op: 'lt', value: 360}, {field: 'verb', op: 'eq', value: 'ended'}, {field: 'q', op: 'lte', value: 3}, {field: 'tags', op: 'has', value: '꿈'}]));
  assert.ok(!matches(e, [{field: 'q', op: 'gt', value: 3}]));
});

test('aggregates: count, sum, avg, streak, days', () => {
  const list = [entry('w', '2026-11-09', {fields: {n: 2}}), entry('w', '2026-11-10', {fields: {n: 3}}), entry('w', '2026-11-11', {fields: {n: 1}}), entry('w', '2026-11-11', {fields: {n: 4}})];
  assert.equal(aggregate(list, 'count', '', '2026-11-11'), 4);
  assert.equal(aggregate(list, 'sum', 'n', '2026-11-11'), 10);
  assert.equal(aggregate(list, 'avg', 'n', '2026-11-11'), 2.5);
  assert.equal(aggregate(list, 'streak', '', '2026-11-11'), 3);
  assert.equal(aggregate(list, 'days', '', '2026-11-11'), 3);
  assert.deepEqual(periodRange('week', '2026-11-11', '2026-11-11'), ['2026-11-09', '2026-11-15']);
});

test('automations: when → if → do, with no loops', () => {
  const logic = Logic.parse({types: [{id: 'pomo', name: '뽀모도로'}, {id: 'wish', name: '소원', fields: [{id: 'st', name: '상태', kind: 'choice', options: ['잠김', '해금']}]}],
    flows: [Flow.parse({id: 'f1', on: {type: 'pomo'}, ifAgg: [{type: 'pomo', agg: 'count', period: 'today', op: 'gte', value: 2}], do: [{do: 'updateWhere', type: 'wish', conds: [{field: 'st', op: 'eq', value: '잠김'}], fields: {st: {set: '해금'}}}, {do: 'notify', text: '소원이 열렸어요'}]}),
      Flow.parse({id: 'f2', on: {type: 'pomo'}, do: [{do: 'create', type: 'pomo'}]})]});
  const wish = entry('wish', '2026-11-01', {fields: {st: '잠김'}}), p1 = entry('pomo', '2026-11-11');
  const one = runFlows(logic, [wish, p1] as unknown as AnyRecord[], p1 as unknown as AnyRecord, {day: '2026-11-11'});
  assert.equal(one.notices.length, 0, 'one pomodoro is not enough');
  const p2 = entry('pomo', '2026-11-11');
  const two = runFlows(logic, [wish, p1, p2] as unknown as AnyRecord[], p2 as unknown as AnyRecord, {day: '2026-11-11'});
  assert.deepEqual(two.notices, ['소원이 열렸어요']);
  assert.equal(two.writes.find(w => w.id === wish.id)?.body.fields.st, '해금');
  const again = runFlows(logic, [wish, p1, p2] as unknown as AnyRecord[], p2 as unknown as AnyRecord, {day: '2026-11-11', chain: ['f2']});
  assert.ok(!again.writes.some(w => w.flow === 'f2'), 'a flow never runs twice in one chain');
  assert.match(flowSentence(logic.flows[0]!, logic.types), /뽀모도로 기록이 생기면, 오늘 뽀모도로 개수 ≥ 2이면 → 소원의 상태 바꾸기/);
  assert.equal(entriesOf([wish, p1] as unknown as AnyRecord[], 'wish').length, 1);
});

test('templates fill data, escape it, and refuse raw HTML', () => {
  const html = renderTemplate('<h1>{{title}}</h1>{{#each list}}<li>{{name}} {{n}}</li>{{else}}<p>none</p>{{/each}}{{#if on}}ON{{else}}OFF{{/if}}{{icon "moon"}}', {title: '<b>수면</b>', list: [{name: 'a', n: 1}], on: false}, n => `[${n}]`);
  assert.equal(html, '<h1>&lt;b&gt;수면&lt;/b&gt;</h1><li>a 1</li>OFF[moon]');
  assert.match(checkTemplate('{{#each x}}'), /not closed/);
  assert.match(checkTemplate('{{{raw}}}'), /not allowed/);
  assert.equal(cleanCss('@import "x.css"; a{background:url(https://evil/x?d=1)}'), ' a{background:none}');
});

test('link suggestions learn from earlier choices', () => {
  const goals = [{id: 'g1', title: 'LEET 언어이해 고득점'}, {id: 'g2', title: '토익 900'}];
  assert.equal(suggestLinks('언어이해 1세트', goals, [])[0]?.id, 'g1');
  assert.equal(suggestLinks('단어 암기', goals, [{title: '단어 암기 100개', to: 'g2'}])[0]?.id, 'g2');
});

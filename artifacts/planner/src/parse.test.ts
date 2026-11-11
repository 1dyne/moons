import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEntry} from './parse.ts';

test('time is the estimate, other counts are the amount, ranges are fixed appointments', () => {
  const a = parseEntry('언어이해 1세트 60분', '2026-11-09');
  assert.equal(a.title, '언어이해 1세트'); assert.equal(a.estimateMin, 60); assert.deepEqual(a.target, {amount: 1, unit: '세트'});
  const b = parseEntry('보고서 1.5시간', '2026-11-09');
  assert.equal(b.title, '보고서'); assert.equal(b.estimateMin, 90); assert.equal(b.target, null);
  const c = parseEntry('수학 20문제', '2026-11-09');
  assert.equal(c.estimateMin, null); assert.deepEqual(c.target, {amount: 20, unit: '문제'});
  const d = parseEntry('14:00-15:30 팀 회의', '2026-11-09');
  assert.equal(d.title, '팀 회의'); assert.ok(d.fixed); assert.ok(d.time?.end);
  const e = parseEntry('9:00 수학 20문제', '2026-11-09');
  assert.equal(e.title, '수학 20문제'); assert.ok(e.time?.start); assert.equal(e.time?.end, null); assert.equal(e.fixed, null);
});

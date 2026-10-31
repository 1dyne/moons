import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEMPLATES, compose, propose, PlannerSpec, dayBoundary} from './index.ts';

test('templates are valid specs', () => {
  for (const t of TEMPLATES) assert.doesNotThrow(() => PlannerSpec.parse(t.spec), t.id);
  assert.equal(dayBoundary(TEMPLATES[0]!.spec), '04:00');
});

test('"루틴 트래커" narrows down: routine template, purpose/mode questions, suggestions with reasons', () => {
  const p = propose('루틴 트래커 만들고 싶어');
  assert.equal(p.template.id, 'routine');
  assert.deepEqual(p.requested, ['routine']);
  assert.deepEqual(p.questions.map(q => q.id), ['routine.purpose', 'routine.mode', 'routine.miss']);
  assert.ok(p.suggested.some(s => s.module === 'goals' && s.why.length > 0));
});

test('answers shape the spec: pick-daily counts only today\'s picks, condition purpose adds sleep', () => {
  const p = propose('루틴 트래커');
  const spec = compose(p, ['goals'], {'routine.purpose': 'condition', 'routine.mode': 'pick'}, '내 루틴');
  assert.equal(spec.name, '내 루틴');
  assert.equal(spec.modules.find(m => m.type === 'routine')!.options.mode, 'pick_daily');
  assert.ok(spec.modules.some(m => m.type === 'sleep') && spec.modules.some(m => m.type === 'goals'));
  assert.deepEqual(spec.rules.filter(r => r.kind === 'achievement_basis'), [{kind: 'achievement_basis', moduleId: 'routine', basis: 'committed_today'}]);
  const all = compose(p, [], {'routine.mode': 'all'});
  assert.deepEqual(all.rules.filter(r => r.kind === 'achievement_basis'), [{kind: 'achievement_basis', moduleId: 'routine', basis: 'all_defined'}]);
});

test('unknown words still give a usable daily planner', () => {
  const p = propose('그냥 좋은 거');
  assert.equal(p.requested.length, 0);
  assert.doesNotThrow(() => compose(p, [], {}));
});

test('a spec with a rule pointing to a missing module is refused', () => {
  const bad = structuredClone(TEMPLATES[0]!.spec);
  bad.rules.push({kind: 'carry_over', moduleId: 'nope', mode: 'ask'});
  assert.throws(() => PlannerSpec.parse(bad), /missing module/);
});

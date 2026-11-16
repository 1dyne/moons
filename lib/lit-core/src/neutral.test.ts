import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

// lit's product code knows no template (V2_DESIGN §4): routines, goals, personas, workouts, wishes, energy…
// are things users build with the grammar. If one of these words shows up in the engine or the v2 contract,
// a template has leaked into the product.
const WORDS = ['루틴', '목표', '페르소나', '운동', '소원', '에너지', '습관', '할 일', '하루 일과', '미션', '수면', '컨디션',
  'routine', 'goal', 'persona', 'workout', 'exercise', 'wish', 'energy', 'habit', 'mission', 'sleep', 'mood', 'task'];
const here = new URL('.', import.meta.url).pathname;
const files = [
  ...readdirSync(here).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => join(here, f)),
  join(here, '../../life-contract/src/v2.ts'),
];

test('no template word in product code', () => {
  for (const f of files) {
    const text = readFileSync(f, 'utf8').toLowerCase();
    const found = WORDS.filter(w => new RegExp(`(^|[^a-z])${w}`, 'u').test(text));
    assert.deepEqual(found, [], `${f} mentions ${found.join(', ')}`);
  }
});

test('the templates folder is not needed for the engine to run', () => {
  // Nothing in the engine imports a template. (Templates are data files that users install.)
  for (const f of files) assert.equal(/templates?\//.test(readFileSync(f, 'utf8')), false, f);
});

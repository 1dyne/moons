import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SKIN_PRESETS, isDark, modulesOf, placeNew, settle, starterCanvas, type Widget} from './canvas.ts';
import {PlannerSpec, TEMPLATES} from './index.ts';

test('starter canvases cover the modules and never overlap', () => {
  for (const layout of ['sheet', 'hourly', 'bullet', 'onepage'] as const) {
    const ws = starterCanvas(layout, ['tasks', 'timer', 'routine', 'goals', 'checkin', 'condition', 'review']);
    for (const a of ws) for (const b of ws) if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${layout}: ${a.id} overlaps ${b.id}`);
    assert.ok(modulesOf(ws).includes('timer'));
  }
  assert.deepEqual(starterCanvas('blank', ['tasks']), []);
});

test('moving a widget onto others pushes them down; new widgets go below', () => {
  const ws: Widget[] = [{id: 'a', type: 'tasks', x: 0, y: 0, w: 6, h: 4, options: {}}, {id: 'b', type: 'review', x: 0, y: 4, w: 6, h: 3, options: {}}, {id: 'c', type: 'text', x: 0, y: 7, w: 6, h: 2, options: {}}];
  const moved = settle(ws.map(w => w.id === 'c' ? {...w, y: 1} : w), 'c');
  const by = Object.fromEntries(moved.map(w => [w.id, w.y]));
  assert.equal(by.c, 1); assert.equal(by.a, 3); assert.equal(by.b, 7);
  assert.equal(placeNew(ws, 'dday', 'n').y, 9);
});

test('specs accept a canvas and a skin; dark skins are detected', () => {
  const spec = PlannerSpec.parse({...TEMPLATES[0]!.spec, canvas: {day: starterCanvas('sheet', ['tasks', 'timer'])}, skin: SKIN_PRESETS[5]!.skin});
  assert.ok(spec.canvas.day!.length > 2);
  assert.ok(isDark(SKIN_PRESETS[5]!.skin.background) && !isDark('#fbf6ea'));
});

test('a loose widget list from an AI becomes a valid spec; unknown widgets are reported, overlaps settle', async () => {
  const {buildSpec} = await import('./build.ts');
  const {spec, dropped} = buildSpec(null, {name: '수험 다꾸', widgets: [{type: 'focus'}, {type: 'tasks', x: 0, y: 0, w: 7}, {type: 'timetable', x: 7, y: 3, w: 5}, {type: 'sticker', options: {glyph: '🐰'}}, {type: 'calendar-of-doom'}], skin: {font: 'gaegu', accent: '#e07a7a'}});
  assert.deepEqual(dropped, ['calendar-of-doom']);
  const ws = spec.canvas.day!;
  assert.equal(ws.length, 4);
  const tasks = ws.find(w => w.type === 'tasks')!, focus = ws.find(w => w.type === 'focus')!;
  assert.equal(tasks.y, 0, 'a placed widget keeps its spot');
  assert.ok(focus.y >= tasks.y + tasks.h || focus.x >= tasks.x + tasks.w, 'unplaced widgets go where nothing is');
  assert.ok(spec.modules.some(m => m.type === 'timer'));
  assert.equal(spec.skin!.font, 'gaegu'); assert.equal(spec.name, '수험 다꾸');
});

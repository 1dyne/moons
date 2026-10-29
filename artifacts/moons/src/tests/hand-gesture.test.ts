import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureTracker, readHand, sides, type Point} from '../lib/hand-gesture.ts';

// A right hand facing the camera: wrist low, knuckles above. `curl` 0 is an open hand, 1 a fist.
function hand({x = 0.5, y = 0.6, curl = 0, pinch = false, poke = false}: {x?: number; y?: number; curl?: number; pinch?: boolean; poke?: boolean} = {}): Point[] {
  const p: Point[] = Array.from({length: 21}, () => ({x, y}));
  p[0] = {x, y: y + 0.2};                    // wrist
  p[9] = {x, y};                             // middle knuckle: palm length 0.2
  p[5] = {x: x - 0.04, y};                   // index knuckle
  const tip = (dx: number) => ({x: x + dx, y: y - 0.16 * (1 - curl) + 0.1 * curl});
  p[8] = tip(-0.04); p[12] = tip(0); p[16] = tip(0.04); p[20] = tip(0.08);
  if (poke) p[8] = {x: x - 0.04, y: y - 0.07}; // index dips toward its knuckle
  p[4] = pinch ? {x: p[8].x + 0.01, y: p[8].y + 0.01} : {x: x - 0.14, y: y + 0.06};
  return p;
}

test('open hand reads open, fist reads closed', () => {
  assert.ok(readHand(hand({curl: 0}), false).openness > 0.8);
  assert.ok(readHand(hand({curl: 1}), false).openness < 0.15);
});

test('cursor is mirrored like a mirror, not like the camera', () => {
  const left = readHand(hand({x: 0.2}), false).cursor.x;
  assert.ok(left > 0.6, `cursor x ${left}`);
});

test('quick pinch selects where the pinch started', () => {
  const g = new GestureTracker();
  g.update(hand(), 0);
  g.update(hand({pinch: true}), 100);
  const {events} = g.update(hand(), 300);
  const select = events.find(e => e.type === 'select');
  assert.ok(select && select.type === 'select');
});

test('pinch and move turns the universe instead of selecting', () => {
  const g = new GestureTracker();
  g.update(hand(), 0);
  g.update(hand({pinch: true}), 50);
  let orbit = 0;
  for (let i = 1; i <= 8; i++) orbit += g.update(hand({pinch: true, x: 0.5 - i * 0.02}), 50 + i * 40).events.filter(e => e.type === 'orbit').length;
  const after = g.update(hand({x: 0.34}), 500).events;
  assert.ok(orbit > 0);
  assert.equal(after.some(e => e.type === 'select'), false);
});

test('spread follows the hand and stops while pinching', () => {
  const g = new GestureTracker();
  const open = g.update(hand({curl: 0}), 0).events.find(e => e.type === 'spread');
  const fist = g.update(hand({curl: 1}), 40).events.find(e => e.type === 'spread');
  assert.ok(open?.type === 'spread' && fist?.type === 'spread' && open.value > fist.value);
  assert.equal(g.update(hand({pinch: true}), 80).events.some(e => e.type === 'spread'), false);
});

test('losing the hand is reported once', () => {
  const g = new GestureTracker();
  g.update(hand(), 0);
  assert.equal(g.update(null, 100).events.length, 0);
  assert.deepEqual(g.update(null, 600).events, [{type: 'lost', role: 'both'}]);
  assert.equal(g.update(null, 900).events.length, 0);
});

function run(g: GestureTracker, frames: Point[][], start = 0, step = 40) {
  return frames.flatMap((f, i) => g.update(f, start + i * step).events);
}

test('two quick index taps click where the finger pointed', () => {
  const g = new GestureTracker();
  const events = run(g, [hand(), hand(), hand(), hand({poke: true}), hand(), hand(), hand(), hand({poke: true}), hand(), hand()]);
  const taps = events.filter(e => e.type === 'doubleTap');
  assert.equal(taps.length, 1);
  assert.equal(events.some(e => e.type === 'select'), false);
});

test('one tap, a slow tap pair, or a fist is not a double tap', () => {
  assert.equal(run(new GestureTracker(), [hand(), hand(), hand({poke: true}), hand(), hand()]).some(e => e.type === 'doubleTap'), false);
  const slow = new GestureTracker();
  const first = run(slow, [hand(), hand(), hand({poke: true}), hand()]);
  const later = run(slow, [hand(), hand({poke: true}), hand()], 2000);
  assert.equal([...first, ...later].some(e => e.type === 'doubleTap'), false);
  const fist = run(new GestureTracker(), [hand(), hand(), hand({curl: 1}), hand(), hand({curl: 1}), hand()]);
  assert.equal(fist.some(e => e.type === 'doubleTap'), false);
});

test('a real pinch clicks where the index pointed before closing, not where it closed', () => {
  const open = hand();
  const meet = {x: (open[4].x + open[8].x) / 2, y: (open[4].y + open[8].y) / 2};
  const closed = hand(); closed[4] = {...meet}; closed[8] = {x: meet.x + 0.005, y: meet.y};
  const g = new GestureTracker();
  const events = run(g, [open, open, open, open, open, closed, closed, closed, open, open]);
  const click = events.find(e => e.type === 'select');
  assert.ok(click && click.type === 'select');
  assert.ok(Math.abs(click.x - (1 - open[8].x)) < 0.02 && Math.abs(click.y - open[8].y) < 0.02, JSON.stringify(click));
  assert.equal(events.some(e => e.type === 'orbit'), false);
  assert.deepEqual(events.filter(e => e.type === 'pinchStart' || e.type === 'pinchEnd').map(e => e.type), ['pinchStart', 'pinchEnd']);
});

test('with two hands, the pointing hand clicks and the other only spreads', () => {
  const pointer = new GestureTracker('pointer'), spreader = new GestureTracker('spread');
  const pointed = [hand(), hand({pinch: true}), hand(), hand({curl: 1})].flatMap((f, i) => pointer.update(f, i * 100).events);
  assert.ok(pointed.some(e => e.type === 'select'));
  assert.equal(pointed.some(e => e.type === 'spread'), false);
  const spread = [hand(), hand({pinch: true}), hand({curl: 1}), hand()].flatMap((f, i) => spreader.update(f, i * 100).events);
  assert.ok(spread.every(e => e.type === 'spread') && spread.length === 4, JSON.stringify(spread));
  assert.deepEqual(spreader.update(null, 2000).events, [{type: 'lost', role: 'spread'}]);
});

test('webcam frames are not mirrored, so MediaPipe "Left" is the person\'s right hand', () => {
  const one = sides({landmarks: [hand()], handedness: [[{categoryName: 'Left'}]]});
  assert.equal(one[0].side, 'right');
  const two = sides({landmarks: [hand({x: 0.3}), hand({x: 0.7})], handedness: [[{categoryName: 'Right'}], [{categoryName: 'Left'}]]});
  assert.deepEqual(two.map(h => h.side), ['left', 'right']);
});

test('two hands with the same label are told apart by where they are on screen', () => {
  // camera x 0.75 shows on the left of the mirrored screen
  const two = sides({landmarks: [hand({x: 0.25}), hand({x: 0.75})], handedness: [[{categoryName: 'Left'}], [{categoryName: 'Left'}]]});
  assert.deepEqual(two.map(h => h.side), ['right', 'left']);
});

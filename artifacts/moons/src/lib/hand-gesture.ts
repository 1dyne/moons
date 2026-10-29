// Hand gestures for the universe screen, read from MediaPipe's 21 hand landmarks
// (x and y are 0..1 of the camera frame; 0 wrist, 4 thumb tip, 5 index knuckle, 8 index tip, 9 middle knuckle, 12/16/20 other tips).
// The cursor is the index fingertip.
//   pinch thumb and index, release quickly  -> click what is under the cursor
//   pinch and move                           -> turn the universe, or carry the planet the pinch started on
//   close the hand / open it                 -> pull the stars in / spread them out
//   tap twice with the index finger          -> click what is under the cursor (open a link, close a card)
export type Point = {x: number; y: number};
export type HandFrame = {cursor: Point; pinching: boolean; openness: number; index: number; middle: number; thumbGap: number; points: Point[]};
export type GestureEvent =
  | {type: 'pinchStart'; x: number; y: number}            // where the finger pointed just before pinching
  | {type: 'select'; x: number; y: number}                // quick pinch and release: a click
  | {type: 'pinchEnd'; dragged: boolean}
  | {type: 'doubleTap'; x: number; y: number}
  | {type: 'orbit'; dx: number; dy: number; x: number; y: number} // drag step, and where the dragged point is now
  | {type: 'spread'; value: number}
  | {type: 'lost'; role: HandRole};
// With two hands, one points and grabs, the other pulls the stars in and spreads them out.
export type HandRole = 'both' | 'pointer' | 'spread';

const PINCH_ON = 0.3, PINCH_OFF = 0.45;   // thumb-index gap, in palm lengths (with hysteresis)
const FIST = 1.05, OPEN = 1.7;            // average fingertip reach from the wrist, in palm lengths
const MOVE = 0.04;                        // pinch travel that turns a pinch into a drag
const TAP_MS = 1000, LOST_MS = 400;
const AIM_MS = 220;                       // closing the pinch moves the index tip: aim from just before
const DIP = 0.72, BACK = 0.88;            // index length falls below / returns above this share of its usual length
const POKE_MS = 450, DOUBLE_MS = 800, NEAR = 0.08;

export type Side = 'left' | 'right';
type Category = {categoryName: string};
export type HandResult = {landmarks: Point[][]; handedness?: Category[][]; handednesses?: Category[][]};

// Which of the person's hands each detection is. MediaPipe labels hands as if the image were mirrored;
// webcam frames are not, so its "Left" is the person's right hand. If both come back the same,
// the hand further left on the (mirrored) screen is the left one.
export function sides(result: HandResult): {points: Point[]; side: Side}[] {
  const labels = result.handedness ?? result.handednesses ?? [];
  const found = result.landmarks.map((points, i) => {
    const label = labels[i]?.[0]?.categoryName;
    return {points, side: (label === 'Left' ? 'right' : label === 'Right' ? 'left' : null) as Side | null};
  });
  if (found.length === 2 && (found[0].side === found[1].side || !found[0].side || !found[1].side)) {
    const screenX = (points: Point[]) => 1 - points[0].x;
    const [a, b] = found;
    const aLeft = screenX(a.points) < screenX(b.points);
    a.side = aLeft ? 'left' : 'right'; b.side = aLeft ? 'right' : 'left';
  }
  return found.map(f => ({points: f.points, side: f.side ?? 'right'}));
}

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mirror = (p: Point): Point => ({x: 1 - p.x, y: p.y}); // the camera faces the person, the screen should not

export function readHand(landmarks: Point[], wasPinching: boolean): HandFrame {
  const points = landmarks.map(mirror);
  const palm = Math.max(1e-3, gap(points[0], points[9]));
  const pinch = gap(points[4], points[8]) / palm;
  const reach = [8, 12, 16, 20].reduce((sum, i) => sum + gap(points[i], points[0]), 0) / 4 / palm;
  return {
    cursor: {x: points[8].x, y: points[8].y},
    pinching: wasPinching ? pinch < PINCH_OFF : pinch < PINCH_ON,
    openness: Math.min(1, Math.max(0, (reach - FIST) / (OPEN - FIST))),
    index: gap(points[8], points[5]) / palm,
    middle: gap(points[12], points[9]) / palm,
    thumbGap: pinch,
    points,
  };
}

export class GestureTracker {
  private role: HandRole;
  constructor(role: HandRole = 'both') { this.role = role; }

  private pinching = false;
  private cursor: Point | null = null;
  private pinchStart: {at: Point; mid: Point; time: number} | null = null;
  private dragged = false;
  private mid: Point | null = null;         // thumb-index midpoint: steady while pinched
  private trail: {time: number; at: Point}[] = [];
  private seen = 0;
  private gone = true;
  // Index taps: the finger dips quickly while the middle finger stays where it was.
  private indexBase = 0;
  private middleBase = 0;
  private poke: {time: number; at: Point} | null = null;
  private lastTap: {time: number; at: Point} | null = null;
  private steady: Point | null = null;

  update(landmarks: Point[] | null, now: number): {frame: HandFrame | null; events: GestureEvent[]} {
    const events: GestureEvent[] = [];
    if (!landmarks || landmarks.length < 21) {
      if (!this.gone && now - this.seen > LOST_MS) {
        if (this.pinchStart) events.push({type: 'pinchEnd', dragged: this.dragged});
        this.gone = true; this.pinching = false; this.pinchStart = null; this.cursor = null; this.mid = null; this.trail = [];
        this.indexBase = 0; this.middleBase = 0; this.poke = null; this.lastTap = null; this.steady = null;
        events.push({type: 'lost', role: this.role});
      }
      return {frame: null, events};
    }
    this.seen = now; this.gone = false;
    const frame = readHand(landmarks, this.pinching);
    // Light smoothing: hands shake, the cursor should not.
    const previous = this.cursor;
    this.cursor = previous ? {x: previous.x + (frame.cursor.x - previous.x) * 0.5, y: previous.y + (frame.cursor.y - previous.y) * 0.5} : frame.cursor;
    frame.cursor = this.cursor;
    this.trail.push({time: now, at: this.cursor});
    while (this.trail.length > 1 && now - this.trail[0].time > AIM_MS) this.trail.shift();
    const rawMid = {x: (frame.points[4].x + frame.points[8].x) / 2, y: (frame.points[4].y + frame.points[8].y) / 2};
    const lastMid = this.mid;
    this.mid = lastMid ? {x: lastMid.x + (rawMid.x - lastMid.x) * 0.5, y: lastMid.y + (rawMid.y - lastMid.y) * 0.5} : rawMid;

    if (frame.pinching && !this.pinching) {
      const aim = this.trail[0].at;
      this.pinchStart = {at: aim, mid: this.mid, time: now}; this.dragged = false;
      events.push({type: 'pinchStart', ...aim});
    } else if (frame.pinching && this.pinchStart && lastMid) {
      const moved = {x: this.mid.x - this.pinchStart.mid.x, y: this.mid.y - this.pinchStart.mid.y};
      if (!this.dragged && Math.hypot(moved.x, moved.y) > MOVE) this.dragged = true;
      if (this.dragged) events.push({type: 'orbit', dx: this.mid.x - lastMid.x, dy: this.mid.y - lastMid.y, x: this.pinchStart.at.x + moved.x, y: this.pinchStart.at.y + moved.y});
    } else if (!frame.pinching && this.pinching && this.pinchStart) {
      if (!this.dragged && now - this.pinchStart.time < TAP_MS) events.push({type: 'select', ...this.pinchStart.at});
      events.push({type: 'pinchEnd', dragged: this.dragged});
      this.pinchStart = null;
    }
    // A closing fist can look like a pinch, so the spreading hand never waits for one to end.
    if (this.role === 'spread' || !frame.pinching) events.push({type: 'spread', value: frame.openness});
    this.tap(frame, now, events);
    this.pinching = frame.pinching;
    const keep = (e: GestureEvent) => this.role === 'both' || (this.role === 'pointer' ? e.type !== 'spread' : e.type === 'spread');
    return {frame, events: events.filter(keep)};
  }

  private tap(frame: HandFrame, now: number, events: GestureEvent[]) {
    if (!this.indexBase) { this.indexBase = frame.index; this.middleBase = frame.middle; }
    const free = !frame.pinching && frame.thumbGap > PINCH_OFF;
    if (!this.poke) {
      if (free && frame.index < this.indexBase * DIP && frame.middle > this.middleBase * 0.85 && this.steady) {
        this.poke = {time: now, at: this.steady}; // aim from before the dip: the fingertip moves while tapping
        return;
      }
      this.indexBase += (frame.index - this.indexBase) * 0.08;
      this.middleBase += (frame.middle - this.middleBase) * 0.08;
      this.steady = frame.cursor;
      return;
    }
    if (frame.index < this.indexBase * BACK) {
      if (now - this.poke.time > POKE_MS * 2) this.poke = null; // held down: not a tap
      return;
    }
    const tap = now - this.poke.time <= POKE_MS ? this.poke : null;
    this.poke = null;
    if (!tap) return;
    if (this.lastTap && tap.time - this.lastTap.time <= DOUBLE_MS && gap(tap.at, this.lastTap.at) < NEAR) {
      events.push({type: 'doubleTap', ...this.lastTap.at});
      this.lastTap = null;
    } else this.lastTap = tap;
  }
}

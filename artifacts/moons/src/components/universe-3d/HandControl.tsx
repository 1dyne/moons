// Camera hand control for the 3D universe. MediaPipe reads both hands in the browser; video never leaves the device.
// One hand points and grabs (click, carry a planet, turn), the other pulls the stars in and spreads them out.
// Right-handed by default: the right hand points. A button in the camera panel swaps it for left-handed people.
// Shows a mirrored webcam preview with each hand's role, draws a cursor over the universe, and turns gestures into scene actions.
import {useEffect, useRef, useState} from 'react';
import {GestureTracker, sides, type GestureEvent, type HandFrame, type HandResult, type Point, type Side} from '@/lib/hand-gesture';
import {tr} from '@/lib/i18n';

type Status = {kind: 'camera' | 'loading' | 'waiting' | 'tracking' | 'error'; message?: string};
type Drawn = {frame: HandFrame; role: 'pointer' | 'spread'};
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
// The hand rarely reaches the edge of the camera frame, so the middle of the frame covers the whole screen.
const fit = (v: number) => Math.min(1, Math.max(0, (v - 0.12) / 0.76));
export const toScreen = (p: Point): Point => ({x: fit(p.x), y: fit(p.y)});
const HANDED_KEY = 'moons.handed';

type Landmarker = {detectForVideo: (video: HTMLVideoElement, time: number) => HandResult; close: () => void};
type Delegate = 'GPU' | 'CPU';

async function loadLandmarker(delegate: Delegate): Promise<Landmarker> {
  const {FilesetResolver, HandLandmarker} = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: {modelAssetPath: `${import.meta.env.BASE_URL}api/assets/hand-landmarker`, delegate},
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
}

function cameraError(error: unknown) {
  const name = (error as {name?: string})?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return tr('Camera access is blocked. Allow it from the address bar, then turn hand control on again.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return tr('No camera was found.');
  if (name === 'NotReadableError') return tr('Another app is using the camera. Close it and try again.');
  return tr('The camera could not start. Try again.');
}

const COLORS = {pointer: {line: '150,210,255', glow: '120,180,255'}, spread: {line: '200,170,255', glow: '170,130,255'}};

function paint(canvas: HTMLCanvasElement | null, hands: Drawn[], map: (p: Point) => Point, onUniverse: boolean, flash = 0, target: Point | null = null) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const at = (p: Point) => { const s = map(p); return [s.x * w, s.y * h] as const; };
  for (const {frame, role} of hands) {
    const c = COLORS[role];
    ctx.save();
    ctx.lineWidth = onUniverse ? 1.2 : 2; ctx.strokeStyle = `rgba(${c.line},${onUniverse ? .22 : .95})`;
    ctx.shadowColor = `rgba(${c.glow},.9)`; ctx.shadowBlur = onUniverse ? 6 : 4;
    ctx.beginPath();
    for (const [a, b] of BONES) { const [x1, y1] = at(frame.points[a]), [x2, y2] = at(frame.points[b]); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    ctx.fillStyle = onUniverse ? `rgba(${c.line},.5)` : '#fff';
    for (const p of frame.points) { const [x, y] = at(p); ctx.beginPath(); ctx.arc(x, y, onUniverse ? 1.8 : 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (!onUniverse) { // the preview names each hand's job
      const [wx, wy] = at(frame.points[0]);
      ctx.shadowBlur = 0; ctx.font = '600 12px Pretendard, system-ui, sans-serif'; ctx.textAlign = 'center';
      const text = role === 'pointer' ? 'Grab' : 'Spread';
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = `rgba(${c.glow},.85)`; ctx.fillRect(wx - tw / 2, Math.min(h - 20, wy + 6), tw, 18);
      ctx.fillStyle = '#fff'; ctx.fillText(text, wx, Math.min(h - 20, wy + 6) + 13);
    }
    if (role === 'pointer') {
      const [cx, cy] = at(frame.cursor);
      if (target && onUniverse) { // what a pinch would hit right now
        ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.6; ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,214,140,.9)';
        ctx.strokeStyle = 'rgba(255,226,170,.95)';
        ctx.beginPath(); ctx.arc(target.x * w, target.y * h, 26, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      ctx.shadowBlur = frame.pinching ? 22 : 12;
      ctx.shadowColor = frame.pinching ? 'rgba(255,214,140,1)' : 'rgba(140,190,255,1)';
      ctx.strokeStyle = frame.pinching ? 'rgba(255,224,170,.95)' : 'rgba(190,220,255,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, onUniverse ? (frame.pinching ? 9 : 20) : (frame.pinching ? 5 : 9), 0, Math.PI * 2); ctx.stroke();
      if (frame.pinching) { ctx.fillStyle = 'rgba(255,230,180,.55)'; ctx.fill(); }
      if (flash > 0) { // a click answers with a ring that opens out
        ctx.strokeStyle = `rgba(255,236,200,${flash})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, (onUniverse ? 20 : 9) + (1 - flash) * (onUniverse ? 46 : 18), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

const label = (status: Status, handed: Side) => {
  if (status.kind === 'camera') return tr('Starting camera...');
  if (status.kind === 'loading') return tr('Preparing hand tracking. The first time can take about 20 seconds.');
  if (status.kind === 'error') return status.message ?? tr('Hand tracking could not start.');
  const [grab, open] = handed === 'right' ? [tr('Right hand'), tr('Left hand')] : [tr('Left hand'), tr('Right hand')];
  if (status.kind === 'waiting') return `Show both hands to the camera. ${grab} grabs, ${open} spreads.`;
  return `${grab}: pinch to click, pinch and move to carry. ${open}: close to gather, open to spread.`;
};

export default function HandControl({active, onEvents, probe, onClose}: {
  active: boolean;
  onEvents: (events: GestureEvent[]) => void;
  probe: (cursor: Point) => Point | null; // screen point (0..1 of the stage) of what the cursor would hit
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null), preview = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({kind: 'camera'});
  const [aspect, setAspect] = useState('4 / 3');
  const [handed, setHanded] = useState<Side>('right');
  useEffect(() => { try { if (localStorage.getItem(HANDED_KEY) === 'left') setHanded('left'); } catch {} }, []);
  const emit = useRef(onEvents), aim = useRef(probe), hand = useRef(handed);
  emit.current = onEvents; aim.current = probe; hand.current = handed;
  const switchHands = () => {
    const next: Side = handed === 'right' ? 'left' : 'right';
    setHanded(next);
    try { localStorage.setItem(HANDED_KEY, next); } catch {}
  };

  useEffect(() => {
    if (!active) return;
    let alive = true, frameId = 0, lastTime = -1, failures = 0, switching = false, seen = 0, shown = '', tapped = -1e9;
    let stream: MediaStream | null = null, landmarker: Landmarker | null = null;
    // Safari is steadier on the CPU path; everywhere else try the GPU first and fall back on any error.
    let delegate: Delegate = /^((?!chrome|chromium|crios|android|fxios|edg).)*safari/i.test(navigator.userAgent) ? 'CPU' : 'GPU';
    let pointer = new GestureTracker('pointer'), spreader = new GestureTracker('spread'), roles = hand.current;
    const show = (next: Status) => { const key = next.kind + (next.message ?? ''); if (key !== shown && alive) { shown = key; setStatus(next); } };
    const fail = (message: string, error?: unknown) => { if (error) console.warn('[moons] hand control', error); show({kind: 'error', message}); };

    const loop = () => {
      if (!alive) return;
      frameId = requestAnimationFrame(loop);
      const v = video.current;
      if (!v || !landmarker || switching || !v.videoWidth || v.readyState < 2 || v.currentTime === lastTime) return;
      lastTime = v.currentTime;
      const now = performance.now();
      let result: HandResult;
      try { result = landmarker.detectForVideo(v, now); failures = 0; }
      catch (error) {
        if (++failures < 3) return;
        if (delegate === 'CPU') { cancelAnimationFrame(frameId); fail(tr('Hand tracking stopped in this browser. Try Chrome.'), error); return; }
        // The GPU path broke on this machine: reload on the CPU and keep going.
        switching = true; delegate = 'CPU'; landmarker.close(); landmarker = null;
        loadLandmarker('CPU').then(next => { if (alive) { landmarker = next; failures = 0; } else next.close(); })
          .catch(e => fail(tr('Hand tracking could not load. Reload the page and try again.'), e))
          .finally(() => { switching = false; });
        return;
      }
      if (roles !== hand.current) { // handedness switched: let go of everything and start fresh
        emit.current([...pointer.update(null, now + 1e6).events, ...spreader.update(null, now + 1e6).events]);
        pointer = new GestureTracker('pointer'); spreader = new GestureTracker('spread'); roles = hand.current;
      }
      const found = sides(result);
      const pointing = found.find(f => f.side === roles)?.points ?? null;
      const spreading = found.find(f => f.side !== roles)?.points ?? null;
      const a = pointer.update(pointing, now), b = spreader.update(spreading, now);
      const events = [...a.events, ...b.events];
      if (found.length) seen = now;
      show({kind: now - seen < 600 ? 'tracking' : 'waiting'});
      if (events.some(e => e.type === 'doubleTap' || e.type === 'select')) tapped = now;
      const flash = Math.max(0, 1 - (now - tapped) / 400);
      const drawn: Drawn[] = [...(a.frame ? [{frame: a.frame, role: 'pointer' as const}] : []), ...(b.frame ? [{frame: b.frame, role: 'spread' as const}] : [])];
      paint(preview.current, drawn, p => p, false, flash);
      paint(overlay.current, drawn, toScreen, true, flash, a.frame ? aim.current(a.frame.cursor) : null);
      if (events.length) emit.current(events);
    };

    (async () => {
      show({kind: 'camera'});
      if (!navigator.mediaDevices?.getUserMedia) return fail(tr('This browser cannot use the camera.'));
      try { stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}}, audio: false}); }
      catch (error) { return fail(cameraError(error), error); }
      const v = video.current;
      if (!alive || !v) return;
      v.srcObject = stream;
      try { await v.play(); } catch {}
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.width && settings?.height) setAspect(`${settings.width} / ${settings.height}`);
      show({kind: 'loading'});
      try { landmarker = await loadLandmarker(delegate); }
      catch (first) {
        if (delegate === 'CPU') return fail(tr('Hand tracking could not load. Reload the page and try again.'), first);
        delegate = 'CPU';
        try { landmarker = await loadLandmarker('CPU'); }
        catch (error) { return fail(tr('Hand tracking could not load. Reload the page and try again.'), error); }
      }
      if (!alive) { landmarker.close(); return; }
      show({kind: 'waiting'});
      loop();
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach(t => t.stop());
      landmarker?.close();
      paint(overlay.current, [], toScreen, true);
      emit.current([{type: 'lost', role: 'pointer'}, {type: 'lost', role: 'spread'}]);
      setStatus({kind: 'camera'});
    };
  }, [active]);

  if (!active) return null;
  return <>
    <canvas ref={overlay} className="uv-hand" aria-hidden="true"/>
    <figure className="uv-cam" aria-label={tr('Hand control camera')}>
      <div className="uv-cam-view" style={{aspectRatio: aspect}}>
        <video ref={video} playsInline muted autoPlay/>
        <canvas ref={preview} aria-hidden="true"/>
      </div>
      <p className={status.kind === 'error' ? 'error' : undefined} role="status"><span>{label(status, handed)}</span></p>
      <div className="uv-cam-actions">
        <button type="button" className="uv-handed" onClick={switchHands} title={tr('Switch which hand grabs')}>
          {handed === 'right' ? 'Right-handed' : 'Left-handed'}</button>
        <button type="button" onClick={onClose}>{tr('Turn off')}</button>
      </div>
    </figure>
  </>;
}

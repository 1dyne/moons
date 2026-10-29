import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {selectionPosition, type Position3, type UniverseLayout3, type UniverseSelection} from '@/lib/live-universe';
import type {PlanetEdge} from '@/lib/mother-links';
import {createNebula} from './nebula';
import {createConnections, createPlanetLinks, createStarfield, createThoughts, disposeObject} from './particles';

type Callbacks = {
  select: (selection: UniverseSelection, compare?: boolean) => void;
  project: (id: string, x: number, y: number, visible: boolean) => void;
  fail: () => void;
};
export type UniverseEngine = ReturnType<typeof createUniverse>;

export function createUniverse(host: HTMLDivElement, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'high-performance'});
  const compact = host.clientWidth < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.25 : 1.6));
  renderer.setClearColor(0x05080e);
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(compact ? 58 : 49, 1, .1, 1500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .055;
  controls.rotateSpeed = .32;
  controls.zoomSpeed = .8;
  controls.minDistance = 23;
  controls.maxDistance = 300;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * .2;
  controls.maxPolarAngle = Math.PI * .8;
  controls.autoRotateSpeed = .055;
  const nebula = createNebula(renderer, camera);
  const background = createStarfield(renderer.getPixelRatio(), compact);
  scene.add(background);
  // Thoughts and their links live in one group, so a hand can pull them all in or spread them out.
  const content = new THREE.Group();
  scene.add(content);
  let spread = 1, spreadTarget = 1;
  let layout: UniverseLayout3 = {clusters: [], stars: [], links: []};
  let thoughts: ReturnType<typeof createThoughts> | null = null;
  let connections: THREE.Group | null = null;
  let selection: UniverseSelection = null;
  let paused = false, reduced = false, dirty = true, disposed = false, failed = false, dragging = false;
  let frame = 0, last = 0, elapsed = 0, userCamera = false;
  let flight: {start: number; from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3} | null = null;
  let qualitySamples = 0, qualityTotal = 0, lowQuality = false;
  const home = new THREE.Vector3();
  const homeTarget = new THREE.Vector3(0, -1, 0);
  const invalidate = () => { dirty = true; };
  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const distance = Math.max(98, 113 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    home.set(0, 7, Math.min(270, distance));
    if (!selection && !userCamera) {camera.position.copy(home); controls.target.copy(homeTarget);}
    renderer.setSize(width, height);
    nebula.resize(lowQuality ? width * .65 : width, lowQuality ? height * .65 : height);
    controls.update(); invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  controls.addEventListener('change', invalidate);

  const projection = new THREE.Vector3();
  function render(now: number) {
    if (disposed || failed) return;
    frame = requestAnimationFrame(render);
    if (document.hidden || now - last < 32) return;
    const dt = Math.min((now - last) / 1000, .1);
    last = now;
    const moving = !paused && !reduced;
    controls.autoRotate = moving && !selection && !flight && !dragging;
    controls.enableDamping = !reduced;
    if (moving) elapsed += dt;
    if (flight) {
      const t = Math.min(1, (now - flight.start) / 1550), ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(flight.from, flight.to, ease);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, ease);
      if (t === 1) flight = null;
      dirty = true;
    }
    if (Math.abs(spreadTarget - spread) > .002) {
      spread += (spreadTarget - spread) * (reduced ? 1 : .2);
      content.scale.setScalar(spread);
      dirty = true;
    }
    const changed = controls.update(dt);
    if (!dirty && !moving && !changed) return;
    dirty = false;
    camera.updateMatrixWorld();
    background.material.uniforms.uTime.value = elapsed;
    if (thoughts) thoughts.material.uniforms.uTime.value = elapsed;
    const start = performance.now();
    renderer.clear(); nebula.render(elapsed); renderer.render(scene, camera);
    // Lower only the expensive gas pass if sustained rendering is slow.
    if (!lowQuality && ++qualitySamples <= 50) {
      qualityTotal += performance.now() - start;
      if (qualitySamples === 50 && qualityTotal / qualitySamples > 24) {lowQuality = true; resize();}
    }
    for (const cluster of layout.clusters) {
      projection.set(...cluster.position).multiplyScalar(spread).project(camera);
      const visible = projection.z > -1 && projection.z < 1 && Math.abs(projection.x) < .9 && Math.abs(projection.y) < .78;
      callbacks.project(cluster.id, (projection.x * .5 + .5) * host.clientWidth, (-projection.y * .5 + .5) * host.clientHeight + 18, visible);
    }
  }
  frame = requestAnimationFrame(render);

  function focus(next: UniverseSelection) {
    selection = next;
    const position = selectionPosition(layout, next);
    const target = position ? new THREE.Vector3(...position).multiplyScalar(spread) : homeTarget.clone();
    const direction = camera.position.clone().sub(controls.target).normalize();
    const destination = position ? target.clone().add(direction.multiplyScalar(compact ? 76 : 48)) : home.clone();
    if (reduced) {camera.position.copy(destination); controls.target.copy(target); flight = null; controls.update();}
    else flight = {start: performance.now(), from: camera.position.clone(), to: destination, fromTarget: controls.target.clone(), toTarget: target};
    invalidate();
  }

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 1.1;
  let down: {x: number; y: number; id: number} | null = null;
  const pointers = new Set<number>();
  let gesture = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  const clearPress = () => {if (pressTimer) clearTimeout(pressTimer); pressTimer = null;};
  function pointerDown(event: PointerEvent) {
    pointers.add(event.pointerId);
    if (pointers.size > 1) gesture = true;
    if (event.button === 0 && pointers.size === 1) {
      down = {x: event.clientX, y: event.clientY, id: event.pointerId}; gesture = false; clearPress();
      if (event.pointerType !== 'mouse') {
        const x = event.clientX, y = event.clientY;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          if (gesture || !down) return;
          const rect = canvas.getBoundingClientRect();
          const near = nearest((x - rect.left) / rect.width, (y - rect.top) / rect.height, 28);
          if (near?.selection?.kind === 'thought') {gesture = true; callbacks.select(near.selection, true);}
        }, 550);
      }
    }
  }
  function pointerMove(event: PointerEvent) {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {gesture = true; clearPress();}
  }
  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId); clearPress();
    if (event.type === 'pointercancel' || gesture || !down || down.id !== event.pointerId || !thoughts) {down = null; return;}
    down = null;
    const rect = canvas.getBoundingClientRect();
    // Stars are a few pixels wide: take the nearest one within reach of the click instead of an exact hit.
    const near = nearest((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, 24);
    if (near?.selection) callbacks.select(near.selection, event.shiftKey && near.selection.kind === 'thought');
  }
  // The star or planet drawn closest to a screen point (x, y 0..1), within `radius` pixels. Mice and hands are not that precise.
  function nearest(x: number, y: number, radius: number, planetsOnly = false) {
    const width = host.clientWidth, height = host.clientHeight, point = new THREE.Vector3();
    let best: {selection: UniverseSelection; x: number; y: number; distance: number} | null = null;
    const consider = (selection: NonNullable<UniverseSelection>, position: Position3) => {
      point.set(...position).multiplyScalar(spread).project(camera);
      if (point.z < -1 || point.z > 1) return;
      const sx = (point.x * .5 + .5), sy = (-point.y * .5 + .5);
      const distance = Math.hypot((sx - x) * width, (sy - y) * height);
      if (distance <= radius && (!best || distance < best.distance)) best = {selection, x: sx, y: sy, distance};
    };
    for (const cluster of layout.clusters) consider({kind: 'planet', id: cluster.id}, cluster.position);
    if (!planetsOnly) for (const star of layout.stars) consider({kind: 'thought', id: star.id}, star.position);
    return best as {selection: UniverseSelection; x: number; y: number; distance: number} | null;
  }
  // x and y are 0..1 across the canvas. A hand is less exact than a mouse, so it gets a wider reach.
  function pick(x: number, y: number, reach: number): UniverseSelection {
    if (!thoughts) return null;
    raycaster.params.Points.threshold = reach * spread;
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -y * 2 + 1), camera);
    const hit = raycaster.intersectObject(thoughts)[0];
    if (hit?.index === undefined) return null;
    const star = layout.stars[hit.index];
    const cluster = layout.clusters[hit.index - layout.stars.length];
    return star ? {kind: 'thought', id: star.id} : cluster ? {kind: 'planet', id: cluster.id} : null;
  }
  const startDrag = () => {dragging = true; flight = null;};
  const endDrag = () => {dragging = false;};
  const lost = (event: Event) => {event.preventDefault(); failed = true; callbacks.fail();};
  controls.addEventListener('start', startDrag);controls.addEventListener('end', endDrag);
  canvas.addEventListener('pointerdown', pointerDown);canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', invalidate);

  let planetLinks: THREE.Group | null = null;
  /** One frame of planets, stars and links without the nebula or starfield, on a transparent canvas.
   *  Additive glow cannot write alpha, so it is drawn on black and brightness becomes opacity. */
  function capture(): HTMLCanvasElement {
    camera.updateMatrixWorld();
    const bgVisible = background.visible;
    background.visible = false;
    renderer.setClearColor(0x000000, 1);
    renderer.clear(); renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const g = out.getContext('2d')!;
    g.drawImage(canvas, 0, 0);
    renderer.setClearColor(0x05080e, 1);
    background.visible = bgVisible;
    invalidate();
    const img = g.getImageData(0, 0, out.width, out.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
      if (a === 0) {d[i + 3] = 0; continue;}
      d[i] = Math.min(255, d[i]! * 255 / a); d[i + 1] = Math.min(255, d[i + 1]! * 255 / a); d[i + 2] = Math.min(255, d[i + 2]! * 255 / a); d[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return out;
  }
  return {
    capture,
    update(next: UniverseLayout3, fresh: Set<string>, selected: UniverseSelection, showLinks: boolean, edges: PlanetEdge[] = []) {
      layout = next;
      if (thoughts) {content.remove(thoughts); disposeObject(thoughts);}
      thoughts = createThoughts(layout, fresh, renderer.getPixelRatio());content.add(thoughts);
      if (connections) {content.remove(connections); disposeObject(connections);}
      connections = createConnections(layout, selected, showLinks);content.add(connections);
      if (planetLinks) {content.remove(planetLinks); disposeObject(planetLinks);}
      planetLinks = createPlanetLinks(layout, edges);content.add(planetLinks);
      if (selection?.id !== selected?.id || selection?.kind !== selected?.kind) focus(selected);
      invalidate();
    },
    motion(isPaused: boolean, isReduced: boolean) {
      paused = isPaused; reduced = isReduced;
      if (reduced && flight) {camera.position.copy(flight.to); controls.target.copy(flight.toTarget); flight = null;}
      invalidate();
    },
    zoom(scale: number) {
      flight = null;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * scale, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);invalidate();
    },
    reset() {userCamera = false; focus(null);},
    getCamera() {return {position: camera.position.toArray() as Position3, target: controls.target.toArray() as Position3};},
    setCamera(value: {position: Position3; target: Position3}) {
      flight = null; userCamera = true;
      camera.position.set(...value.position); controls.target.set(...value.target); controls.update(); invalidate();
    },
    rotate(horizontal: number, vertical: number) {
      flight = null;controls.rotateLeft(horizontal);controls.rotateUp(vertical);invalidate();
    },
    nearest,
    // Where a planet lands if the hand holds it at screen point (x, y): same depth from the camera, under the hand.
    planetPoint(id: string, x: number, y: number): Position3 | null {
      const cluster = layout.clusters.find(c => c.id === id);
      if (!cluster) return null;
      const at = new THREE.Vector3(...cluster.position).multiplyScalar(spread);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), at);
      raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -y * 2 + 1), camera);
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      return hit ? hit.divideScalar(spread).toArray() as Position3 : null;
    },
    // 1 is the normal layout; below pulls every thought toward the center, above spreads them out.
    spread(value: number) {spreadTarget = THREE.MathUtils.clamp(value, .08, 1.6);invalidate();},
    pickAt(x: number, y: number) {return pick(x, y, 2.4);},
    dispose() {
      disposed = true;cancelAnimationFrame(frame);observer.disconnect();
      controls.removeEventListener('change', invalidate);controls.removeEventListener('start', startDrag);controls.removeEventListener('end', endDrag);
      controls.dispose();document.removeEventListener('visibilitychange', invalidate);
      canvas.removeEventListener('pointerdown', pointerDown);canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('webglcontextlost', lost);
      disposeObject(scene);nebula.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
    },
  };
}

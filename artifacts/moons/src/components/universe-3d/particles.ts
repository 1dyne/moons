import * as THREE from 'three';
import {seededRandom, type UniverseLayout3, type UniverseSelection} from '@/lib/live-universe';
import type {LinkKind} from '@/lib/thought';
import type {PlanetEdge} from '@/lib/mother-links';

const vertexShader = `
attribute float aSize; attribute float aPhase; attribute float aSignal;
varying vec3 vColor; varying float vPhase; varying float vSignal;
uniform float uDpr;
void main(){
  vColor=color; vPhase=aPhase; vSignal=aSignal;
  vec4 mv=modelViewMatrix*vec4(position,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*180./max(8.,-mv.z),.7,56.)*uDpr;
}`;
const fragmentShader = `
varying vec3 vColor; varying float vPhase; varying float vSignal; uniform float uTime;
void main(){
  vec2 p=gl_PointCoord*2.-1.;float r=length(p);if(r>1.)discard;
  float core=exp(-r*r*36.);float halo=exp(-r*5.)*.35;
  float cross=(exp(-abs(p.x)*95.)*exp(-abs(p.y)*7.)+exp(-abs(p.y)*95.)*exp(-abs(p.x)*7.))*.22;
  float pulse=.88+.12*sin(uTime*.7+vPhase);
  vec3 color=vColor*(core+halo+cross)*pulse;
  if(vSignal>.5)color+=vec3(1.,.32,.14)*exp(-pow((r-.72)*55.,2.))*.6;
  gl_FragColor=vec4(color,1.);
}`;

export function makeParticles(positions: number[], colors: number[], sizes: number[], signals: number[], dpr: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(sizes.map((_, index) => index * 2.39996), 1));
  geometry.setAttribute('aSignal', new THREE.Float32BufferAttribute(signals, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader, fragmentShader, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {uTime: {value: 0}, uDpr: {value: dpr}},
  }));
}

export function createStarfield(dpr: number, compact: boolean) {
  const random = seededRandom(43191);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(.00001, random()))) * Math.cos(Math.PI * 2 * random());
  const positions: number[] = [], colors: number[] = [], sizes: number[] = [];
  const palette = ['#cadff4', '#e2eaf1', '#b6d0f4', '#e6a293', '#db6271', '#f1d8bb'];
  const count = compact ? 12000 : 26000;
  for (let i = 0; i < count; i++) {
    if (i < 9500) {
      const x = gaussian() * 46;
      positions.push(x, gaussian() * 14 + Math.sin(x * .025) * 17, gaussian() * 33 - 39);
    } else {
      const radius = 100 + random() * 480, theta = random() * Math.PI * 2, cos = random() * 2 - 1;
      const sin = Math.sqrt(1 - cos * cos);
      positions.push(radius * sin * Math.cos(theta), radius * cos, radius * sin * Math.sin(theta));
    }
    const color = new THREE.Color(palette[Math.floor(random() * palette.length)]).multiplyScalar(.32 + Math.pow(random(), 2) * 1.15);
    colors.push(color.r, color.g, color.b);
    sizes.push(.45 + Math.pow(random(), 5) * 3.8);
  }
  for (let i = 0; i < 95; i++) {
    positions.push(gaussian() * 65, gaussian() * 35, gaussian() * 33 - 30);
    const color = new THREE.Color(i % 3 === 0 ? '#edb9a5' : '#c6e3ff').multiplyScalar(1.7);
    colors.push(color.r, color.g, color.b); sizes.push(5 + random() * 9);
  }
  return makeParticles(positions, colors, sizes, sizes.map(() => 0), dpr);
}

export function createThoughts(layout: UniverseLayout3, fresh: Set<string>, dpr: number) {
  const positions: number[] = [], colors: number[] = [], sizes: number[] = [], signals: number[] = [];
  for (const star of layout.stars) {
    positions.push(...star.position);
    const color = new THREE.Color(star.color).multiplyScalar(star.pending ? .7 : 1.8);
    colors.push(color.r, color.g, color.b);
    sizes.push(9 * (fresh.has(star.id) ? 1.7 : 1)); // node size is fixed
    signals.push(star.pending ? 0 : star.openSignals);
  }
  // Cluster beacons share a draw call but do not count as or pick like thoughts.
  for (const cluster of layout.clusters) {
    positions.push(...cluster.position);
    const color = new THREE.Color(cluster.color).lerp(new THREE.Color('#d6e7f5'), .5).multiplyScalar(1.7);
    colors.push(color.r, color.g, color.b);sizes.push(17 + Math.sqrt(cluster.count) * 6.5);signals.push(0); // planets grow with their notes
  }
  return makeParticles(positions, colors, sizes, signals, dpr);
}

const linkColors: Record<LinkKind, number> = {
  supports: 0xa1b6db, contradicts: 0xff8a6b, fills_gap: 0x8fb3ff, same_mistake: 0xf2c14e, decides: 0xc3a4ff,
};

export function createConnections(layout: UniverseLayout3, selection: UniverseSelection, showAll: boolean) {
  const group = new THREE.Group();
  const byId = new Map(layout.stars.map(star => [star.id, star]));
  const selected = new Set(layout.stars.filter(star => selection?.kind === 'thought' ? star.id === selection.id : selection?.kind === 'planet' && star.planetIds.includes(selection.id)).map(star => star.id));
  for (const kind of Object.keys(linkColors) as LinkKind[]) {
    const positions: number[] = [];
    for (const link of layout.links) {
      if (link.kind !== kind || (!showAll && !selected.has(link.a) && !selected.has(link.b))) continue;
      const a = byId.get(link.a)!, b = byId.get(link.b)!;
      const start = new THREE.Vector3(...a.position), end = new THREE.Vector3(...b.position);
      const middle = start.clone().lerp(end, .5).add(new THREE.Vector3(0, 2, -4));
      const points = new THREE.QuadraticBezierCurve3(start, middle, end).getPoints(18);
      for (let i = 0; i < points.length - 1; i++) {
        if ((kind === 'contradicts' || kind === 'same_mistake') && i % 3 === 0) continue;
        positions.push(...points[i].toArray(), ...points[i + 1].toArray());
      }
    }
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: linkColors[kind], transparent: true, opacity: kind === 'supports' ? .16 : .4, depthWrite: false,
    })));
  }
  return group;
}

export function createPlanetLinks(layout: UniverseLayout3, edges: PlanetEdge[]) {
  const group = new THREE.Group(), byId = new Map(layout.clusters.map(c => [c.id, c])), up = new THREE.Vector3(0, 1, 0);
  for (const edge of edges) {
    const a = byId.get(edge.a), b = byId.get(edge.b);
    if (!a || !b) continue;
    const start = new THREE.Vector3(...a.position), end = new THREE.Vector3(...b.position), length = start.distanceTo(end);
    if (!length) continue;
    const radius = .1 + .12 * Math.min(edge.weight, 14);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8, 1, true),
      new THREE.MeshBasicMaterial({color: 0xcfe0ff, transparent: true, opacity: .5, depthWrite: false}));
    mesh.position.copy(start).lerp(end, .5);
    mesh.quaternion.setFromUnitVectors(up, end.clone().sub(start).normalize());
    group.add(mesh);
  }
  return group;
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    }
  });
}

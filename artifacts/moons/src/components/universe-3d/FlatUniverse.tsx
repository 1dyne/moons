import {useMemo} from 'react';
import {hash} from '@/lib/client';
import type {SpaceInfo, UniverseDTO, UniverseThought} from '@/lib/thought';

const W = 1600, H = 900, GOLDEN = 2.39996;
type Placed = UniverseThought & {x: number; y: number; color: string; pending: boolean};

// Seeded randomness so the sky looks the same on every reload and every screen.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-6, r()), v = r();
  return [Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), Math.sqrt(-2 * Math.log(u)) * Math.sin(2 * Math.PI * v)];
}
const STAR_TINTS = ['#FFFFFF', '#FFFFFF', '#E4ECFF', '#AFC9FF', '#FFD9E6', '#FF9FB8', '#FFE3BC'];
const DUST = {blue: ['#3B5FCC', '#6E8FF2'], warm: ['#D9844A', '#8C4A2A', '#F2B27E'], haze: ['#FF6F91']};
const gid = (color: string) => `neb-${color.replace('#', '')}`;

// Static backdrop: gas and dust clouds plus a few thousand-light-year-away stars.
function Sky({planets}: {planets: SpaceInfo['planets']}) {
  const r = rng(20261014);
  const clouds: {x: number; y: number; rx: number; ry: number; rot: number; color: string; o: number}[] = [];
  for (let i = 0; i < 9; i++) clouds.push({x: r() * 0.32 * W, y: r() * 0.5 * H, rx: 180 + r() * 220, ry: 110 + r() * 150, rot: r() * 180, color: DUST.blue[i % 2], o: 0.1 + r() * 0.12});
  for (let i = 0; i < 12; i++) clouds.push({x: r() * 0.3 * W, y: (0.42 + r() * 0.62) * H, rx: 160 + r() * 240, ry: 90 + r() * 160, rot: r() * 180, color: DUST.warm[i % 3], o: 0.13 + r() * 0.2});
  for (let i = 0; i < 4; i++) clouds.push({x: (0.45 + r() * 0.35) * W, y: (0.3 + r() * 0.4) * H, rx: 260 + r() * 200, ry: 180 + r() * 120, rot: r() * 180, color: DUST.haze[0], o: 0.04 + r() * 0.04});
  const lanes = Array.from({length: 6}, () => ({x: r() * 0.26 * W, y: (0.35 + r() * 0.6) * H, rx: 120 + r() * 160, ry: 30 + r() * 50, rot: -30 + r() * 60}));
  const stars = Array.from({length: 620}, (_, i) => {
    let x: number, y: number;
    if (i < 230 && planets.length) { const p = planets[i % planets.length]; const [gx, gy] = gauss(r); x = p.x * W + gx * 120; y = p.y * H + gy * 85; }
    else { x = r() * W; y = r() * H; }
    return {x, y, s: 0.35 + Math.pow(r(), 3.2) * 1.6, c: STAR_TINTS[Math.floor(r() * STAR_TINTS.length)], tw: r() < 0.1, d: 2.5 + r() * 4, dl: r() * 5};
  });
  const bright = Array.from({length: 16}, () => ({x: r() * W, y: r() * H, s: 1.4 + r() * 1.2, len: 9 + r() * 14, c: r() < 0.6 ? '#9DBBFF' : '#FFFFFF'}));
  return <g className="lv-sky" aria-hidden="true">
    <rect width={W} height={H} fill="url(#lv-space)"/>
    {clouds.map((c, i) => <ellipse key={`c${i}`} cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} transform={`rotate(${c.rot} ${c.x} ${c.y})`} fill={`url(#${gid(c.color)})`} fillOpacity={c.o}/>)}
    {lanes.map((l, i) => <ellipse key={`l${i}`} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} transform={`rotate(${l.rot} ${l.x} ${l.y})`} fill="url(#lv-lane)"/>)}
    {stars.map((st, i) => <circle key={`s${i}`} cx={st.x} cy={st.y} r={st.s} fill={st.c} className={st.tw ? 'lv-tw' : undefined}
      style={st.tw ? {animationDuration: `${st.d}s`, animationDelay: `${st.dl}s`} : undefined}/>)}
    {bright.map((b, i) => <g key={`b${i}`} transform={`translate(${b.x} ${b.y})`}>
      <circle r={b.s * 3.4} fill={`url(#${gid(b.c)})`} fillOpacity={0.55}/>
      <rect x={-b.len} y={-0.45} width={b.len * 2} height={0.9} fill="url(#lv-spike-h)"/>
      <rect x={-0.45} y={-b.len} width={0.9} height={b.len * 2} fill="url(#lv-spike-v)"/>
      <circle r={b.s * 0.7} fill="#fff"/>
    </g>)}
  </g>;
}

function layout(data: UniverseDTO) {
  const planets = data.space.planets.map(p => {
    const count = data.thoughts.filter(t => t.status === 'done' && t.planetIds.includes(p.id)).length;
    return {...p, cx: p.x * W, cy: p.y * H, count, r: Math.min(96, 34 + 7 * Math.sqrt(count))};
  });
  const byId = new Map(planets.map(p => [p.id, p]));
  const groups = new Map<string, number>();
  let arriving = 0;
  const placed: Placed[] = data.thoughts.filter(t => t.status !== 'held').map(t => {
    const pending = t.status === 'saved' || t.status === 'analyzing';
    if (pending && !t.planetIds.length) {
      const k = arriving++;
      return {...t, pending, color: '#9AA3B5', x: W / 2 + ((k % 7) - 3) * 30, y: 168 + Math.floor(k / 7) * 26};
    }
    const ps = t.planetIds.map(id => byId.get(id)).filter((p): p is typeof planets[number] => !!p).slice(0, 2);
    const key = ps.map(p => p.id).sort().join('+') || 'none';
    const i = groups.get(key) ?? 0;
    groups.set(key, i + 1);
    const angle = i * GOLDEN + hash(key) * Math.PI * 2;
    let cx: number, cy: number, dist: number;
    if (ps.length === 1) { cx = ps[0].cx; cy = ps[0].cy; dist = ps[0].r + 18 + 12 * Math.sqrt(i); }
    else if (ps.length === 2) { cx = (ps[0].cx + ps[1].cx) / 2; cy = (ps[0].cy + ps[1].cy) / 2; dist = 6 + 12 * Math.sqrt(i); }
    else { cx = W * 0.07; cy = H * 0.5; dist = 8 + 11 * Math.sqrt(i); }
    const color = t.kind === 'decision' ? '#6D3FC0' : t.kind === 'media' ? '#FFE3A3' : ps[0]?.color ?? '#9AA3B5';
    return {...t, pending, color, x: Math.max(20, Math.min(W - 20, cx + Math.cos(angle) * dist)), y: Math.max(130, Math.min(H - 30, cy + Math.sin(angle) * dist))};
  });
  return {planets, placed};
}

// One thought = one star. More links, brighter star; open questions glow red like a young star still forming.
function Star({t, degree, fresh}: {t: Placed; degree: number; fresh: boolean}) {
  if (t.pending) return <g className="lv-star">
    <circle r={9} fill={`url(#${gid(t.color)})`} fillOpacity={0.7} className="lv-arriving"/>
    <circle r={2.4} fill="#FFFFFF" className="lv-arriving"/>
  </g>;
  const decision = t.kind === 'decision';
  if (t.kind === 'media') return <g className="lv-star lv-original-star">
    <circle r={30} fill={`url(#${gid('#FFFFFF')})`} fillOpacity={0.9} className="lv-halo"/>
    <rect x={-70} y={-0.8} width={140} height={1.6} fill="url(#lv-spike-h)"/>
    <rect x={-0.8} y={-70} width={1.6} height={140} fill="url(#lv-spike-v)"/>
    <circle r={5.5} fill="#FFF8E1" className="lv-core"/>
    <text y={-22} textAnchor="middle" className="lv-orig">{tr('Source')}</text>
  </g>;
  const color = decision ? '#B48CFF' : t.color;
  const s = 2.3 + Math.min(3.2, degree * 0.75) + (decision ? 1 : 0);
  const spike = decision ? s * 8 : degree >= 2 ? s * 5.5 : 0;
  return <g className="lv-star">
    {fresh && <circle r={s * 2} className="lv-nova" style={{stroke: color}}/>}
    {t.openSignals > 0 && <circle r={s * 4.4} className="lv-throb"/>}
    <circle r={s * 3.6} fill={`url(#${gid(color)})`} fillOpacity={0.85} className="lv-halo"/>
    {spike > 0 && <>
      <rect x={-spike} y={-0.5} width={spike * 2} height={1} fill="url(#lv-spike-h)"/>
      <rect x={-0.5} y={-spike} width={1} height={spike * 2} fill="url(#lv-spike-v)"/>
    </>}
    <circle r={s * 0.6} fill="#FFFFFF" className="lv-core"/>
  </g>;
}

import type {PlanetEdge} from '@/lib/mother-links';
import {tr} from '@/lib/i18n';
export default function FlatUniverse({data, fresh, cosmos, onSelect, edges = []}: {data: UniverseDTO; fresh: Set<string>; cosmos: boolean; onSelect: (id: string, compare?: boolean) => void; edges?: PlanetEdge[]}) {
  const space = data.space;
  const view = useMemo(() => layout(data), [data]);
  const pos = new Map(view.placed.map(p => [p.id, p]));
  const sky = useMemo(() => <Sky planets={space.planets}/>, [space]);
  const degree = new Map<string, number>();
  for (const l of data.links) { degree.set(l.a, (degree.get(l.a) ?? 0) + 1); degree.set(l.b, (degree.get(l.b) ?? 0) + 1); }
  const palette = [...new Set([...space.planets.map(p => p.color), ...DUST.blue, ...DUST.warm, ...DUST.haze, '#9DBBFF', '#FFFFFF', '#9AA3B5', '#6D3FC0', '#B48CFF'])];
  return (
      <svg className="lv-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr('Flat 2D map of your notes around their mother planets')}>
        <defs>
          {view?.planets.map(p => <radialGradient key={p.id} id={`glow-${p.id}`}><stop offset="0" stopColor={p.color} stopOpacity=".28"/><stop offset="1" stopColor={p.color} stopOpacity="0"/></radialGradient>)}
          {cosmos && <>
            <radialGradient id="lv-space" cx=".58" cy=".46" r=".75"><stop offset="0" stopColor="#120F26"/><stop offset=".55" stopColor="#060712"/><stop offset="1" stopColor="#020308"/></radialGradient>
            <radialGradient id="lv-lane"><stop offset="0" stopColor="#020308" stopOpacity=".7"/><stop offset="1" stopColor="#020308" stopOpacity="0"/></radialGradient>
            {palette.map(c => <radialGradient key={c} id={gid(c)}><stop offset="0" stopColor={c} stopOpacity="1"/><stop offset=".35" stopColor={c} stopOpacity=".45"/><stop offset="1" stopColor={c} stopOpacity="0"/></radialGradient>)}
            {view?.planets.map(p => <radialGradient key={`core${p.id}`} id={`core-${p.id}`}><stop offset="0" stopColor="#FFFFFF" stopOpacity=".95"/><stop offset=".12" stopColor={p.color} stopOpacity=".75"/><stop offset=".45" stopColor={p.color} stopOpacity=".18"/><stop offset="1" stopColor={p.color} stopOpacity="0"/></radialGradient>)}
            <linearGradient id="lv-spike-h"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".5" stopColor="#fff" stopOpacity=".95"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
            <linearGradient id="lv-spike-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0"/><stop offset=".5" stopColor="#fff" stopOpacity=".95"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient>
          </>}
        </defs>
        {cosmos && sky}
        {cosmos && view?.planets.map(p => {
          const k = hash(p.id), glow = Math.min(0.34, 0.1 + p.count * 0.012);
          return <g key={`n${p.id}`} className="lv-nebula" aria-hidden="true">
            {[0, 1, 2, 3].map(i => {
              const a = k * 6.283 + i * 1.7, d = p.r * (0.3 + 0.35 * i);
              const x = p.cx + Math.cos(a) * d, y = p.cy + Math.sin(a) * d * 0.7;
              return <ellipse key={i} cx={x} cy={y} rx={p.r * (2.6 - i * 0.35)} ry={p.r * (1.7 - i * 0.2)} transform={`rotate(${(k * 360 + i * 47) % 180} ${x} ${y})`} fill={`url(#${gid(p.color)})`} fillOpacity={glow * (1 - i * 0.15)}/>;
            })}
          </g>;
        })}
        {!cosmos && view?.planets.map(p => <circle key={`g${p.id}`} cx={p.cx} cy={p.cy} r={p.r * 2.1} fill={`url(#glow-${p.id})`} className="lv-glow"/>)}
        <g className="lv-planet-links">
          {edges.map(edge => {
            const a = view?.planets.find(p => p.id === edge.a), b = view?.planets.find(p => p.id === edge.b);
            if (!a || !b) return null;
            const text = `${a.name} and ${b.name}: ${edge.shared} shared nodes, ${edge.links} links, width ${edge.weight}`;
            return <line key={`${edge.a}-${edge.b}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="#cfe0ff" strokeOpacity={.5} strokeLinecap="round" strokeWidth={1.5 + 2 * Math.min(edge.weight, 14)} data-weight={edge.weight} tabIndex={0} aria-label={text}><title>{text}</title></line>;
          })}
        </g>
        <g className="lv-links">
          {data?.links.map(l => {
            const a = pos.get(l.a), b = pos.get(l.b);
            if (!a || !b || a.pending || b.pending) return null;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
            const d = `M${a.x} ${a.y} Q${mx - dy * 0.15} ${my + dx * 0.15} ${b.x} ${b.y}`;
            const isFresh = fresh.has(l.a) || fresh.has(l.b);
            return <path key={`${l.a}-${l.b}`} d={d} className={`lv-link ${l.kind} ${isFresh ? 'fresh' : ''}`} pathLength={1}/>;
          })}
        </g>
        {view?.planets.map(p => cosmos
          ? <g key={p.id} className="lv-planet" data-planet={p.id} style={{transform: `translate(${p.cx}px, ${p.cy}px)`}}>
            <circle r={p.r * 1.25} fill={`url(#core-${p.id})`} className="lv-cluster"/>
            <rect x={-p.r * 0.9} y={-0.6} width={p.r * 1.8} height={1.2} fill="url(#lv-spike-h)" opacity={0.7}/>
            <rect x={-0.6} y={-p.r * 0.9} width={1.2} height={p.r * 1.8} fill="url(#lv-spike-v)" opacity={0.7}/>
            <text y={p.r * 0.55 + 26} textAnchor="middle" className="lv-pname">{p.name}</text>
            <text y={p.r * 0.55 + 48} textAnchor="middle" className="lv-pcount">{p.count}</text>
          </g>
          : <g key={p.id} className="lv-planet" data-planet={p.id} style={{transform: `translate(${p.cx}px, ${p.cy}px)`}}>
            <circle r={p.r + 10} className="lv-orbit"/>
            <circle r={p.r} fill={p.color} className="lv-body"/>
            <text y={-2} textAnchor="middle" className="lv-pname">{p.name}</text>
            <text y={22} textAnchor="middle" className="lv-pcount">{p.count}</text>
          </g>)}
        {view && view.placed.some(p => !p.pending && !p.planetIds.length) && <text x={W * 0.07} y={H * 0.5 + 4} textAnchor="middle" className="lv-zone">{tr('Dwarf Planet')}</text>}
        {view && view.placed.some(p => p.pending && !p.planetIds.length) && <text x={W / 2} y={140} textAnchor="middle" className="lv-zone">{tr('Arriving')}</text>}
        {view?.placed.map(t => <g key={t.id} className={`lv-thought ${t.pending ? 'pending' : ''} ${fresh.has(t.id) ? 'fresh' : ''} ${t.kind}`} style={{transform: `translate(${t.x}px, ${t.y}px)`}}
          onClick={event => onSelect(t.id, event.shiftKey)} onPointerDown={event => {if (event.pointerType === 'mouse') return; const id = t.id; const timer = setTimeout(() => {onSelect(id, true); (event.currentTarget as SVGGElement | null)?.setAttribute('data-pressed', '1');}, 550); const stop = () => {clearTimeout(timer); window.removeEventListener('pointerup', stop); window.removeEventListener('pointermove', stop);}; window.addEventListener('pointerup', stop); window.addEventListener('pointermove', stop);}} role="button" tabIndex={0} aria-label={t.preview || 'Note'} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(t.id, event.shiftKey); } }}>
          {cosmos ? <Star t={t} degree={degree.get(t.id) ?? 0} fresh={fresh.has(t.id)}/> : <>
            {t.openSignals > 0 && !t.pending && <circle r={11} className="lv-ring"/>}
            {t.kind === 'decision' ? <g><rect x={-7} y={-7} width={14} height={14} transform="rotate(45)" fill={t.color} className="lv-dot"/></g> : <circle r={t.pending ? 6 : 7} fill={t.pending ? 'none' : t.color} className="lv-dot"/>}
          </>}
          <circle r={18} fill="transparent"/>
        </g>)}
      </svg>

  );
}

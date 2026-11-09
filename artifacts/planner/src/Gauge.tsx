import {createContext, useContext} from 'react';
import {GAUGES, type GaugeKind} from '@workspace/planner-spec';

// Progress (0–100%) drawn one way across the whole diary; the skin picks the way.
// Monochrome: filled = ink, track = faint ink, the live edge = accent (signal yellow by default).
// No progress yet (null) shows a dashed track and "–", never a zero that reads as a score.
const GaugeCtx = createContext<GaugeKind>('segment');
export const GaugeProvider = GaugeCtx.Provider;
export const useGauge = () => useContext(GaugeCtx);

type Size = 'sm' | 'md' | 'lg';
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function Gauge({pct, size = 'md', kind, label}: {pct: number | null; size?: Size; kind?: GaugeKind; label?: string}) {
  const ctx = useGauge(), k = kind ?? ctx;
  const v = pct === null || Number.isNaN(pct) ? null : clamp(pct);
  const text = v === null ? '–' : `${v}%`;
  return <span className={`gauge g-${k} g-${size} ${v === null ? 'empty' : ''} ${v === 100 ? 'full' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined} aria-label={label ? `${label} ${text}` : text}>
    {k === 'segment' && <Segments v={v} n={10} />}
    {k === 'pips' && <Pips v={v} />}
    {k === 'bar' && <span className="g-bar"><i style={{width: `${v ?? 0}%`}} /></span>}
    {k === 'ring' && <Ring v={v} size={size} text={text} />}
    {k === 'arc' && <Arc v={v} size={size} />}
    {k === 'number' && <span className="g-ruler"><b style={{left: `${v ?? 0}%`}} /></span>}
    {k !== 'ring' && <em className="g-val">{text}</em>}
  </span>;
}

function Segments({v, n}: {v: number | null; n: number}) {
  const step = 100 / n, full = v === null ? 0 : Math.floor(v / step), live = v !== null && v % step > 0 ? full : -1;
  return <span className="g-seg">{Array.from({length: n}, (_, i) => <i key={i} className={i < full ? 'f' : i === live ? 'y' : ''} />)}</span>;
}

function Pips({v}: {v: number | null}) {
  const on = v === null ? 0 : Math.round(v / 10);
  return <span className="g-pips">{Array.from({length: 10}, (_, i) => <i key={i} className={i < on ? (i === on - 1 && v !== 100 ? 'y' : 'f') : ''} />)}</span>;
}

const RING = {sm: 30, md: 52, lg: 96};
function Ring({v, size, text}: {v: number | null; size: Size; text: string}) {
  const d = RING[size], sw = size === 'lg' ? 5 : 3, r = (d - sw) / 2, c = 2 * Math.PI * r;
  return <span className="g-ring" style={{width: d, height: d}}>
    <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true">
      <circle cx={d / 2} cy={d / 2} r={r} fill="none" className="g-track" strokeWidth={sw} strokeDasharray={v === null ? '2 3' : undefined} />
      {v !== null && v > 0 && <circle cx={d / 2} cy={d / 2} r={r} fill="none" className="g-fill" strokeWidth={sw} strokeDasharray={`${c * v / 100} ${c}`} transform={`rotate(-90 ${d / 2} ${d / 2})`} />}
    </svg>
    <em className="g-val">{size === 'sm' && v !== null ? v : text}</em>
  </span>;
}

const ARC = {sm: 44, md: 76, lg: 150};
function Arc({v, size}: {v: number | null; size: Size}) {
  const w = ARC[size], r = w / 2 - 4, cx = w / 2, cy = w / 2, h = w / 2 + 3;
  const at = (p: number, rr: number) => { const a = Math.PI * (1 - p / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)] as const; };
  const ticks = Array.from({length: 11}, (_, i) => i * 10);
  const [nx, ny] = at(v ?? 0, r - (size === 'sm' ? 3 : 6));
  return <svg className="g-arc" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
    {ticks.map(t => { const [x1, y1] = at(t, r), [x2, y2] = at(t, r - (t % 50 === 0 ? (size === 'sm' ? 5 : 9) : (size === 'sm' ? 3 : 5))); return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} className={v !== null && t <= v ? 'g-tick on' : 'g-tick'} />; })}
    {v !== null && <line x1={cx} y1={cy} x2={nx} y2={ny} className="g-needle" strokeWidth={size === 'lg' ? 2.5 : 1.5} />}
    <circle cx={cx} cy={cy} r={size === 'lg' ? 4 : 2.5} className="g-hub" />
  </svg>;
}

/** All six shapes side by side, for the skin panel. */
export function GaugePicker({value, onChange}: {value: GaugeKind; onChange: (k: GaugeKind) => void}) {
  return <div className="gauge-pick" role="radiogroup" aria-label="진행률 모양">
    {GAUGES.map(g => <button key={g.id} type="button" role="radio" aria-checked={value === g.id} className={value === g.id ? 'on' : ''} onClick={() => onChange(g.id)} title={g.hint}>
      <Gauge pct={64} kind={g.id} size="md" />
      <span>{g.name}</span>
    </button>)}
  </div>;
}

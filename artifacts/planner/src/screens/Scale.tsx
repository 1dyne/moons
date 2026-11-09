// 1–10 score picker used for waking energy, check-ins and the condition asked when a timer stops.
export const Scale = ({value, onPick, label}: {value: number | null | undefined; onPick: (n: number) => void; label: string}) =>
  <div className="scale" role="group" aria-label={label}>{Array.from({length: 10}, (_, i) => i + 1).map(n =>
    <button key={n} className={value === n ? 'on' : ''} aria-pressed={value === n} onClick={() => onPick(n)} style={{'--lv': n} as React.CSSProperties}>{n}</button>)}</div>;


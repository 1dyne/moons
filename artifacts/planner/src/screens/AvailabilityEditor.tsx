import {useState} from 'react';
import type {Availability} from '@workspace/life-contract';
import {api} from '../data.ts';

// 설정 → 집중 가능 시간: hours by weekday and dated exceptions (데이트, 발표…). Goal plans and bottlenecks use it.
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const h = (m: number) => String(Math.round(m / 6) / 10);

export function AvailabilityEditor({value, saved}: {value: Availability | null; saved: () => Promise<void>}) {
  const [week, setWeek] = useState<string[]>(() => (value?.weekday ?? [360, 360, 360, 360, 360, 360, 360]).map(h));
  const [ex, setEx] = useState(value?.exceptions ?? []), [date, setDate] = useState(''), [hours, setHours] = useState('0'), [note, setNote] = useState(''), [msg, setMsg] = useState('');
  const save = async (next = ex) => {
    try {
      const weekday = week.map(x => Math.max(0, Math.min(1440, Math.round((Number(x) || 0) * 60))));
      await api.putAvailability({weekday, exceptions: next}); setMsg('저장했어요.'); await saved();
    } catch (e) { setMsg((e as Error).message); }
  };
  return <section className="module avail"><h3>집중 가능 시간</h3>
    <div className="avail-week">{DAYS.map((d, i) => <label key={d}><span className="k">{d}</span>
      <input className="num" inputMode="decimal" value={week[i]} onChange={e => setWeek(week.map((x, j) => j === i ? e.target.value : x))} aria-label={`${d}요일 시간`} /></label>)}<span className="muted small">시간</span></div>
    <div className="avail-ex">
      {ex.map(e => <span key={e.date} className="tag">{e.date} · {h(e.minutes)}h{e.note ? ` · ${e.note}` : ''}<button className="link" onClick={() => { const n = ex.filter(x => x.date !== e.date); setEx(n); void save(n); }} aria-label={`${e.date} 예외 지우기`}> ×</button></span>)}
    </div>
    <form className="inline" onSubmit={e => { e.preventDefault(); if (!date) return; const n = [...ex.filter(x => x.date !== date), {date, minutes: Math.round((Number(hours) || 0) * 60), note: note.trim() || null}].sort((a, b) => a.date.localeCompare(b.date)); setEx(n); setDate(''); setNote(''); void save(n); }}>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="예외 날짜" />
      <input className="num" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} aria-label="그날 시간" />시간
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="메모" aria-label="예외 메모" maxLength={80} />
      <button className="small">예외 추가</button>
    </form>
    <div className="inline"><button onClick={() => void save()}>저장</button>{value && <button className="ghost small" onClick={async () => { await api.putAvailability(null); setMsg('지웠어요. 최근 실제 집중 시간으로 계산해요.'); await saved(); }}>지우기</button>}{msg && <span className="muted small">{msg}</span>}</div>
  </section>;
}

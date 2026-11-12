import {useBack} from '../back.ts';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {addDays, routineRate, type Settings} from '@workspace/life-contract';
import {Logic, runMoment, type PlannerSpec} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import {Receipt} from '../screens/Focus.tsx';
import {WakeAsk} from '../screens/CheckIn.tsx';

// Moments on the screen (docs/lit/BLOCKS.md §4): automations started by a time of day, the first opening of a day,
// or 일어났어요 run here, in the planner that is open; anything that opens a popup (a receipt, the morning check) opens here too.
// Record-started automations run on the server, and their 'open' actions arrive through the same 'lit:open' event.
export type OpenWhat = 'receipt-today' | 'receipt-yesterday' | 'receipt' | 'checkin';
export const openPopup = (what: OpenWhat, day?: string) => dispatchEvent(new CustomEvent('lit:open', {detail: {what, day}}));
const firedKey = (id: string) => `lit.flow.${id}`;
const fired = (id: string) => { try { return localStorage.getItem(firedKey(id)); } catch { return null; } };
const mark = (id: string, day: string) => { try { localStorage.setItem(firedKey(id), day); } catch { /* */ } };

export function MomentHost({spec, p, today, settings}: {spec: PlannerSpec; p: Planner; today: string; settings: Settings}) {
  const [pop, setPop] = useState<{what: OpenWhat; day: string} | null>(null), [notes, setNotes] = useState<string[]>([]);
  const live = useRef({spec, p, today}); live.current = {spec, p, today};
  useBack(!!pop, () => setPop(null));
  useEffect(() => {
    const open = (e: Event) => { const d = (e as CustomEvent<{what: OpenWhat; day?: string}>).detail, t = live.current.today; setPop({what: d.what, day: d.day ?? (d.what === 'receipt-yesterday' ? addDays(t, -1) : t)}); };
    addEventListener('lit:open', open); return () => removeEventListener('lit:open', open);
  }, []);
  useEffect(() => {
    const run = (kind: 'time' | 'dayStart' | 'wake') => {
      const {spec: sp, p: pl, today: day} = live.current, logic = Logic.safeParse(sp.logic ?? {}).data;
      if (!logic) return;
      const now = new Date(), hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const f of logic.flows) {
        if (!f.enabled || f.on.kind !== kind) continue;
        // Once a day each (a time flow also runs when the planner is first opened after its time).
        if (kind !== 'wake' && fired(f.id) === day) continue;
        if (kind === 'time' && hhmm < f.on.at) continue;
        if (kind !== 'wake') mark(f.id, day);
        const out = runMoment(f, logic, pl.records, day, now);
        for (const w of out.writes) void pl.write(w.id, {kind: 'entry', logicalDay: w.logicalDay, body: w.body, ...(w.baseRevision !== undefined ? {baseRevision: w.baseRevision} : {})});
        if (out.notices.length) { setNotes(n => [...n, ...out.notices]); setTimeout(() => setNotes(n => n.slice(out.notices.length)), 6000); }
        const o = out.opens.at(-1) as OpenWhat | undefined;
        if (o) setPop({what: o, day: o === 'receipt-yesterday' ? addDays(day, -1) : day});
      }
    };
    run('dayStart'); run('time');
    const t = setInterval(() => run('time'), 30_000);
    const vis = () => { if (document.visibilityState === 'visible') { run('dayStart'); run('time'); } };
    const wake = () => run('wake');
    document.addEventListener('visibilitychange', vis); addEventListener('lit:wake', wake);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('lit:wake', wake); };
  }, [today]);
  return createPortal(<>
    {notes.length > 0 && <div className="moment-notes" role="status">{notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
    {pop && (pop.what === 'checkin'
      ? <Modal close={() => setPop(null)} label="아침 상태"><WakeAsk p={p} day={pop.day} now={() => new Date().toISOString()} /><button className="primary" onClick={() => setPop(null)}>닫기</button></Modal>
      : <ReceiptArchive p={p} spec={spec} day={pop.day} today={today} close={() => setPop(null)} title={pop.what === 'receipt-yesterday' ? '어제의 영수증' : pop.what === 'receipt-today' ? '오늘의 영수증' : '영수증'} />)}
  </>, document.body);
  void settings;
}

function Modal({children, close, label}: {children: React.ReactNode; close: () => void; label: string}) {
  return <div className="rc-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
    <div className="rc-modal" role="dialog" aria-label={label}>{children}</div></div>;
}

/** Receipts, one per day, flipped through with ‹ › or a swipe. */
export function ReceiptArchive({p, spec, day, today, close, title}: {p: Planner; spec: PlannerSpec; day: string; today: string; close: () => void; title: string}) {
  const [d, setD] = useState(day), x0 = useRef<number | null>(null);
  const first = p.records.filter(r => !r.deletedAt && r.logicalDay && ['session', 'task', 'condition', 'entry'].includes(r.kind)).map(r => r.logicalDay!).sort()[0] ?? today;
  const logic = Logic.safeParse(spec.logic ?? {}).data;
  const go = (n: number) => setD(x => { const y = addDays(x, n); return y < first || y > today ? x : y; });
  return <Modal close={close} label={title}>
    <div className="rc-head"><b>{d === day ? title : '영수증'}</b><button className="ghost small" onClick={close} aria-label="닫기">✕</button></div>
    <div className="rc-paper" onPointerDown={e => { x0.current = e.clientX; }} onPointerUp={e => { if (x0.current !== null && Math.abs(e.clientX - x0.current) > 50) go(e.clientX < x0.current ? 1 : -1); x0.current = null; }}>
      <Receipt p={p} day={d} routineRate={ofKind(p.records, 'routine').length ? routineRate(p.records, d) : null} logic={logic} />
    </div>
    <div className="rc-nav">
      <button className="small" disabled={d <= first} onClick={() => go(-1)} aria-label="전날 영수증">‹ 전날</button>
      <span className="mono small">{d.slice(5).replace('-', '/')}</span>
      <button className="small" disabled={d >= today} onClick={() => go(1)} aria-label="다음 날 영수증">다음 날 ›</button>
      {d !== today && <button className="ghost small" onClick={() => setD(today)}>오늘</button>}
    </div>
  </Modal>;
}

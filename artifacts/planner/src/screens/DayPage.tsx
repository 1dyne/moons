import {addDays, type Settings} from '@workspace/life-contract';
import type {PlannerSpec, Widget} from '@workspace/planner-spec';
import type {Planner} from '../data.ts';
import type {Ctx, Nav} from './day.ts';
import {label} from './Today.tsx';
import {DayCanvas} from './Canvas.tsx';

// A day: the date line, then the user's own widget page (the day page, or a page tab's widgets).
// Widgets that show one day; a page without any of them (views, tables of all days, decorations) needs no date line.
const DAILY = new Set(['tasks', 'focus', 'timetable', 'receipt', 'hourly', 'bullet', 'page', 'checkin', 'carry', 'routine', 'condition', 'sleep', 'review', 'personas', 'energy', 'mission', 'goals']);
export function DayPage({spec, settings, p, nav, today, saveSpec, page}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string; saveSpec?: Ctx['saveSpec']; page?: Widget[]}) {
  const dated = !page || page.some(w => DAILY.has(w.type) || (w.type === 'table' && w.options.scope !== 'all') || (w.type === 'list' && w.options.period === 'today'));
  return <div className="sheet">
    {dated && <div className="day-nav">
      <button onClick={() => nav.setDay(addDays(nav.day, -1))} aria-label="전날">‹</button>
      <h2>{label(nav.day)}</h2>
      <button onClick={() => nav.setDay(addDays(nav.day, 1))} aria-label="다음 날">›</button>
      {nav.day !== today && <button className="ghost small" onClick={() => nav.setDay(today)}>오늘로</button>}
    </div>}
    {page && page.length === 0 && <p className="muted page-empty">빈 페이지</p>}
    <DayCanvas spec={spec} settings={settings} p={p} today={today} day={nav.day} nav={nav} saveSpec={saveSpec} page={page} />
  </div>;
}

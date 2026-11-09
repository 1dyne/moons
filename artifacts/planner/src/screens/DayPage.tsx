import {addDays, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import type {Planner} from '../data.ts';
import type {Nav} from './day.ts';
import {label} from './Today.tsx';
import {DayCanvas} from './Canvas.tsx';

// A day: the date line, then the user's own widget page.
export function DayPage({spec, settings, p, nav, today}: {spec: PlannerSpec; settings: Settings; p: Planner; nav: Nav; today: string}) {
  return <div className="sheet">
    <div className="day-nav">
      <button onClick={() => nav.setDay(addDays(nav.day, -1))} aria-label="전날">‹</button>
      <h2>{label(nav.day)}</h2>
      <button onClick={() => nav.setDay(addDays(nav.day, 1))} aria-label="다음 날">›</button>
      {nav.day !== today && <button className="ghost small" onClick={() => nav.setDay(today)}>오늘로</button>}
    </div>
    <DayCanvas spec={spec} settings={settings} p={p} today={today} day={nav.day} nav={nav} />
  </div>;
}

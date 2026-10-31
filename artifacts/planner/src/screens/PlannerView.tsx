import {useState} from 'react';
import {logicalDay, type Settings} from '@workspace/life-contract';
import type {PlannerSpec} from '@workspace/planner-spec';
import type {Planner} from '../data.ts';
import {Today, type Nav} from './Today.tsx';
import {Goals} from './Goals.tsx';
import {Month} from './Month.tsx';

export type Tab = 'today' | 'goals' | 'month';
const TABS: [Tab, string][] = [['today', '오늘'], ['goals', '목표'], ['month', '달력']];

/** One renderer for both the mockup and the real planner: only the data source differs. */
export function PlannerView({spec, settings, p, extraTabs}: {spec: PlannerSpec; settings: Settings; p: Planner; extraTabs?: React.ReactNode}) {
  const today = logicalDay(new Date(), settings);
  const [tab, setTab] = useState<Tab>('today'), [day, setDay] = useState(today), [goalId, setGoalId] = useState<string | null>(null), [month, setMonth] = useState(today.slice(0, 7));
  const nav: Nav = {day, setDay: d => { setDay(d); setTab('today'); }, openGoal: id => { setGoalId(id); setTab('goals'); }};
  return <div className="planner-view">
    <nav className="tabs" role="tablist">
      {TABS.map(([id, name]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); if (id === 'goals') setGoalId(null); }}>{name}</button>)}
      {extraTabs}
    </nav>
    {p.error && <p className="error" role="alert">{p.error}</p>}
    {tab === 'today' && <Today spec={spec} p={p} nav={nav} today={today} />}
    {tab === 'goals' && <Goals spec={spec} p={p} nav={nav} today={today} goalId={goalId} setGoalId={setGoalId} />}
    {tab === 'month' && <Month p={p} nav={nav} month={month} setMonth={setMonth} today={today} />}
  </div>;
}

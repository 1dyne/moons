import {useState} from 'react';
import {logicalDay, type Settings} from '@workspace/life-contract';
import {BUILTIN_TABS, tabsOf, type PlannerSpec, type TabSpec} from '@workspace/planner-spec';
import type {Planner} from '../data.ts';
import {DayPage} from './DayPage.tsx';
import type {Nav} from './day.ts';
import {Goals} from './Goals.tsx';
import {Month} from './Month.tsx';
import {Insights} from './Insights.tsx';
import {Week} from './Week.tsx';
import {GaugeProvider} from '../Gauge.tsx';

// Where the user is survives a save (the page remounts with the new version).
const memory: {tab?: string; day?: string} = {};
export const currentTab = () => memory.tab;

/** One renderer for both the mockup and the real planner: only the data source differs.
 *  Tabs work like Notion pages: add (a built-in view or a blank page), rename, reorder, delete. */
export function PlannerView({spec, settings, p, saveSpec}: {spec: PlannerSpec; settings: Settings; p: Planner; saveSpec?: (change: (s: PlannerSpec) => PlannerSpec) => Promise<void>}) {
  const today = logicalDay(new Date(), settings);
  const tabs = tabsOf(spec);
  const [tabId, setTabIdState] = useState(() => memory.tab && tabs.some(t => t.id === memory.tab) ? memory.tab : tabs[0]!.id);
  const [day, setDayState] = useState(memory.day ?? today), [goalId, setGoalId] = useState<string | null>(null), [month, setMonth] = useState(today.slice(0, 7));
  const setTab = (id: string) => { memory.tab = id; setTabIdState(id); };
  const setDay = (d: string) => { memory.day = d; setDayState(d); };
  const tab = tabs.find(t => t.id === tabId) ?? tabs[0]!;
  const firstOf = (kind: TabSpec['kind']) => tabs.find(t => t.kind === kind);
  const nav: Nav = {day, setDay: d => { setDay(d); const t = firstOf('today'); if (t) setTab(t.id); }, openGoal: id => { setGoalId(id); const t = firstOf('goals'); if (t) setTab(t.id); }};
  return <GaugeProvider value={spec.skin?.gauge ?? 'segment'}><div className="planner-view">
    <TabBar tabs={tabs} active={tab.id} pick={id => { setTab(id); if (tabs.find(t => t.id === id)?.kind === 'goals') setGoalId(null); }} save={saveSpec ? next => saveSpec(s => ({...s, tabs: next})) : undefined} />
    {p.error && <p className="error" role="alert">{p.error}</p>}
    {tab.kind === 'today' && <DayPage spec={spec} settings={settings} p={p} nav={nav} today={today} saveSpec={saveSpec} />}
    {tab.kind === 'page' && <DayPage spec={spec} settings={settings} p={p} nav={nav} today={today} saveSpec={saveSpec} page={tab.widgets ?? []} />}
    {tab.kind === 'week' && <Week spec={spec} settings={settings} p={p} nav={nav} today={today} />}
    {tab.kind === 'goals' && <Goals spec={spec} p={p} nav={nav} today={today} goalId={goalId} setGoalId={setGoalId} />}
    {tab.kind === 'month' && <Month p={p} nav={nav} month={month} setMonth={setMonth} today={today} />}
    {tab.kind === 'insights' && <Insights p={p} settings={settings} today={today} />}
  </div></GaugeProvider>;
}

const slug = () => `p-${Date.now().toString(36)}`;

function TabBar({tabs, active, pick, save}: {tabs: TabSpec[]; active: string; pick: (id: string) => void; save?: (tabs: TabSpec[]) => Promise<void>}) {
  const [renaming, setRenaming] = useState<string | null>(null), [menu, setMenu] = useState<string | null>(null), [adding, setAdding] = useState(false), [dragId, setDragId] = useState<string | null>(null);
  const put = (next: TabSpec[]) => { setMenu(null); return save?.(next); };
  const move = (id: string, to: number) => { const from = tabs.findIndex(t => t.id === id); if (from < 0 || to < 0 || to >= tabs.length || from === to) return; const next = [...tabs]; const [t] = next.splice(from, 1); next.splice(to, 0, t!); void put(next); };
  const add = (t: TabSpec) => { setAdding(false); void put([...tabs, t])?.then(() => pick(t.id)); };
  const missing = BUILTIN_TABS.filter(b => !tabs.some(t => t.kind === b.kind));
  return <nav className="tabs" role="tablist">
    {tabs.map((t, i) => <span key={t.id} className={`tab ${t.id === active ? 'on' : ''}`} draggable={!!save && renaming !== t.id}
      onDragStart={() => setDragId(t.id)} onDragOver={e => { if (dragId) e.preventDefault(); }} onDrop={() => { if (dragId) move(dragId, i); setDragId(null); }}>
      {renaming === t.id
        ? <form onSubmit={e => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('n') ?? '').trim().slice(0, 20); setRenaming(null); if (v && v !== t.name) void put(tabs.map(x => x.id === t.id ? {...x, name: v} : x)); }}>
            <input name="n" defaultValue={t.name} autoFocus maxLength={20} aria-label="탭 이름" onBlur={e => e.currentTarget.form?.requestSubmit()} /></form>
        : <button role="tab" aria-selected={t.id === active} onClick={() => pick(t.id)} onDoubleClick={() => save && setRenaming(t.id)}>{t.name}</button>}
      {save && t.id === active && renaming !== t.id && <button className="tab-more" onClick={() => setMenu(menu === t.id ? null : t.id)} aria-label={`${t.name} 탭 메뉴`} aria-expanded={menu === t.id}>⋯</button>}
      {menu === t.id && <span className="tab-menu" role="menu">
        <button role="menuitem" onClick={() => { setMenu(null); setRenaming(t.id); }}>이름 바꾸기</button>
        <button role="menuitem" disabled={i === 0} onClick={() => move(t.id, i - 1)}>← 앞으로</button>
        <button role="menuitem" disabled={i === tabs.length - 1} onClick={() => move(t.id, i + 1)}>뒤로 →</button>
        <button role="menuitem" onClick={() => add({...t, id: slug(), name: `${t.name} 사본`.slice(0, 20)})}>복제</button>
        <button role="menuitem" className="danger" disabled={tabs.length === 1} onClick={() => { const next = tabs.filter(x => x.id !== t.id); void put(next)?.then(() => pick(next[Math.max(0, i - 1)]!.id)); }}>삭제</button>
      </span>}
    </span>)}
    {save && <span className="tab tab-add">
      <button onClick={() => setAdding(!adding)} aria-label="탭 추가" aria-expanded={adding}>＋</button>
      {adding && <span className="tab-menu" role="menu">
        <button role="menuitem" onClick={() => add({id: slug(), name: '새 페이지', kind: 'page', widgets: []})}>빈 페이지</button>
        {missing.map(b => <button key={b.kind} role="menuitem" onClick={() => add({...b, id: b.kind === b.id && !tabs.some(t => t.id === b.id) ? b.id : slug()})}>{b.name}</button>)}
      </span>}
    </span>}
  </nav>;
}

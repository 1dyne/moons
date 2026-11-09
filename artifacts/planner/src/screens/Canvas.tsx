import {useRef, useState} from 'react';
import {goalPercent, routineRate, type Settings} from '@workspace/life-contract';
import {COLS, isDark, settle, starterCanvas, widgetInfo, type ModuleSpec, type PlannerSpec, type Skin, type Widget} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import type {Ctx} from './day.ts';
import {CarryOver, DayGoals, PersonaToday, ReviewBox, Routines, SleepBox, Tasks} from './Today.tsx';
import {FocusBar, Receipt, Timetable, colors, useTimer} from './Focus.tsx';
import {CheckIn, ConditionDay} from './CheckIn.tsx';
import {BulletDay, HourlyDay, OnePageDay} from './DayLayouts.tsx';
import {HabitGrid} from './Habits.tsx';

// The DIY day page: widgets on a 12-column grid. Same component for using the planner and for editing it.
export const ROW = 30, GAP = 10;
export const canvasOf = (spec: PlannerSpec) => spec.canvas?.day ?? starterCanvas(spec.layout?.day ?? 'sheet', spec.modules.map(m => m.type));

/** Skin → CSS variables and classes for the planner root. */
export function skinProps(skin: Skin | undefined) {
  if (!skin) return {className: '', style: {}};
  const font = {sans: "Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo',sans-serif", serif: "'Gowun Batang',serif", hand: "'Gaegu',cursive", mono: "'SF Mono',ui-monospace,Menlo,monospace"}[skin.font];
  return {
    className: `skin paper-${skin.paper} heading-${skin.heading} font-${skin.font} ${isDark(skin.background) ? 'mood-night skin-dark' : ''}`,
    style: {'--accent': skin.accent, '--bg': skin.background, '--surface': skin.surface, '--ink': skin.ink, '--radius': `${skin.radius}px`, '--font': font, background: skin.background, color: skin.ink} as React.CSSProperties,
  };
}

const asModule = (w: Widget, type: ModuleSpec['type']) => ({id: w.id, type, label: '', period: 'day', order: 0, view: 'list', options: w.options, fields: []}) as ModuleSpec;
const OWN_TITLE: Widget['type'][] = ['carry', 'habits', 'focus'];

export type EditApi = {widgets: Widget[]; selected: string | null; select: (id: string | null) => void; change: (ws: Widget[], movedId?: string) => void};

export function DayCanvas({spec, settings, p, today, day, nav, edit}: {spec: PlannerSpec; settings: Settings; p: Planner; today: string; day: string; nav: Ctx['nav']; edit?: EditApi}) {
  const widgets = edit?.widgets ?? canvasOf(spec);
  const timer = useTimer(p, settings), color = colors(p, day);
  const timed = widgets.some(w => ['focus', 'timetable', 'receipt', 'hourly'].includes(w.type));
  const ctx: Ctx = {p, day, nav, now: () => new Date().toISOString(), timer: timed ? timer : null, color};
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{id: string; mode: 'move' | 'size'; x0: number; y0: number; w: Widget; preview: Widget} | null>(null);
  const endHour = Number(settings.dayBoundary.slice(0, 2)) + 24;

  const begin = (e: React.PointerEvent, w: Widget, mode: 'move' | 'size') => {
    if (!edit) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    edit.select(w.id);
    setDrag({id: w.id, mode, x0: e.clientX, y0: e.clientY, w, preview: w});
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !grid.current) return;
    const colW = (grid.current.clientWidth + GAP) / COLS, dx = Math.round((e.clientX - drag.x0) / colW), dy = Math.round((e.clientY - drag.y0) / (ROW + GAP));
    const info = widgetInfo(drag.w.type);
    const preview = drag.mode === 'move'
      ? {...drag.w, x: Math.max(0, Math.min(COLS - drag.w.w, drag.w.x + dx)), y: Math.max(0, drag.w.y + dy)}
      : {...drag.w, w: Math.max(info.minW, Math.min(COLS - drag.w.x, drag.w.w + dx)), h: Math.max(info.minH, drag.w.h + dy)};
    if (preview.x !== drag.preview.x || preview.y !== drag.preview.y || preview.w !== drag.preview.w || preview.h !== drag.preview.h) setDrag({...drag, preview});
  };
  const end = () => {
    if (!drag || !edit) return;
    edit.change(settle(widgets.map(w => w.id === drag.id ? drag.preview : w), drag.id), drag.id);
    setDrag(null);
  };
  const shown = drag ? widgets.map(w => w.id === drag.id ? drag.preview : w) : widgets;
  const rows = shown.reduce((m, w) => Math.max(m, w.y + w.h), 0) + (edit ? 6 : 0);

  return <div ref={grid} className={`canvas ${edit ? 'editing' : ''}`} style={{gridTemplateRows: `repeat(${Math.max(rows, edit ? 12 : 1)}, ${ROW}px)`}}
    onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={e => { if (edit && e.target === e.currentTarget) edit.select(null); }}>
    {shown.length === 0 && edit && <p className="canvas-empty">빈 화면이에요. 왼쪽에서 위젯을 골라 넣고, 끌어서 배치하세요.</p>}
    {shown.map(w => {
      const title = w.title ?? widgetInfo(w.type).label, sel = edit?.selected === w.id;
      return <section key={w.id} className={`wg wg-${w.style ?? spec.skin?.card ?? 'line'} wg-type-${w.type} ${sel ? 'selected' : ''} ${drag?.id === w.id ? 'dragging' : ''}`}
        style={{gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}`, order: w.y * COLS + w.x, ...(w.color ? {'--accent': w.color} : {})} as React.CSSProperties}
        onClick={edit ? e => { e.stopPropagation(); edit.select(w.id); } : undefined}>
        {edit && <div className="wg-handle" onPointerDown={e => begin(e, w, 'move')} title="끌어서 옮기기">⠿ {widgetInfo(w.type).label}</div>}
        {title && !OWN_TITLE.includes(w.type) && <h3 className="wg-title">{title}</h3>}
        <div className="wg-body" inert={edit ? true : undefined}>
          <WidgetBody w={w} ctx={ctx} spec={spec} settings={settings} today={today} endHour={endHour} />
        </div>
        {edit && <span className="wg-resize" onPointerDown={e => begin(e, w, 'size')} title="끌어서 크기 바꾸기" />}
      </section>;
    })}
  </div>;
}

function WidgetBody({w, ctx, spec, settings, today, endHour}: {w: Widget; ctx: Ctx; spec: PlannerSpec; settings: Settings; today: string; endHour: number}) {
  const {p, day} = ctx, start = Number(w.options.startHour ?? 6);
  switch (w.type) {
    case 'focus': return ctx.timer ? <FocusBar p={p} day={today} timer={ctx.timer} color={colors(p, today)} /> : null;
    case 'tasks': return <Tasks m={asModule(w, 'tasks')} ctx={ctx} />;
    case 'timetable': return <Timetable key={day} m={asModule(w, 'timer')} p={p} day={day} settings={settings} color={ctx.color} />;
    case 'receipt': return <Receipt p={p} day={day} routineRate={ofKind(p.records, 'routine').length ? routineRate(p.records, day) : null} />;
    case 'hourly': return <HourlyDay ctx={ctx} startHour={start} endHour={endHour} />;
    case 'bullet': return <BulletDay ctx={ctx} />;
    case 'page': return <OnePageDay key={day} ctx={ctx} startHour={start} endHour={endHour} />;
    case 'checkin': return <CheckIn m={asModule(w, 'checkin')} p={p} day={day} now={ctx.now} />;
    case 'carry': return (day === today ? <CarryOver ctx={ctx} /> : null) ?? <p className="muted small">어제 못 끝낸 일이 없어요.</p>;
    case 'routine': return <Routines m={asModule(w, 'routine')} ctx={ctx} />;
    case 'habits': return ofKind(p.records, 'routine').some(r => r.body.active) ? <HabitGrid p={p} month={day.slice(0, 7)} today={today} /> : <p className="muted small">습관 격자 — 루틴을 추가하면 한 달 칸이 그려져요. (오늘의 루틴 위젯에서 추가)</p>;
    case 'goals': return <DayGoals ctx={ctx} />;
    case 'condition': return <ConditionDay key={day} p={p} day={day} now={ctx.now} />;
    case 'sleep': return <SleepBox key={day} ctx={ctx} />;
    case 'review': return <ReviewBox key={day} ctx={ctx} />;
    case 'personas': return <PersonaToday ctx={ctx} />;
    case 'progress': {
      const goals = ofKind(p.records, 'goal'), g = goals.find(x => x.id === w.options.goalId) ?? goals.find(x => !x.body.parentGoalId && x.body.status === 'active');
      if (!g) return <p className="muted small">목표를 세우면 여기 크게 보여요. (편집에서 목표 고르기)</p>;
      const pct = goalPercent(g.id, p.records).pct;
      return <button className="wg-progress link" onClick={() => ctx.nav.openGoal(g.id)}><span>{g.body.title}</span><strong>{pct}%</strong><i style={{width: `${pct}%`}} /></button>;
    }
    case 'dday': {
      const goals = ofKind(p.records, 'goal'), g = goals.find(x => x.id === w.options.goalId) ?? goals.find(x => x.body.deadline && x.body.status === 'active');
      const date = String(w.options.date ?? '') || g?.body.deadline || '';
      if (!date) return <p className="muted small">편집에서 날짜나 목표를 고르세요.</p>;
      const target = date.length === 7 ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)) : new Date(`${date}T00:00:00Z`);
      const left = Math.ceil((target.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      return <div className="wg-dday"><strong>{left > 0 ? `D-${left}` : left === 0 ? 'D-day' : `D+${-left}`}</strong><span>{String(w.options.label ?? '') || g?.body.title || date}</span></div>;
    }
    case 'text': return <p className={`wg-text size-${String(w.options.size ?? 'm')}`}>{String(w.options.text ?? '오늘의 다짐을 적어 보세요')}</p>;
  }
}

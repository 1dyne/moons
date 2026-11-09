import {useRef, useState} from 'react';
import {goalPercent, routineRate, type Settings} from '@workspace/life-contract';
import {METRICS, isDark, isDecor, minSize, settle, starterCanvas, toFree, widgetInfo, type CanvasMode, type ModuleSpec, type PlannerSpec, type Skin, type Widget} from '@workspace/planner-spec';
import {ofKind, type Planner} from '../data.ts';
import type {Ctx} from './day.ts';
import {CarryOver, DayGoals, PersonaToday, ReviewBox, Routines, SleepBox, Tasks} from './Today.tsx';
import {FocusBar, Receipt, Timetable, colors, useTimer} from './Focus.tsx';
import {CheckIn, ConditionDay} from './CheckIn.tsx';
import {BulletDay, HourlyDay, OnePageDay} from './DayLayouts.tsx';
import {HabitGrid} from './Habits.tsx';
import {useFontFamily} from '../fonts.ts';
import {Gauge} from '../Gauge.tsx';
import {LabelProvider} from '../labels.tsx';
import {TableWidget} from './Table.tsx';
import {Tip} from '../Tip.tsx';

// The DIY day page: widgets on a 12-column grid. Same component for using the planner and for editing it.
/** A saved page keeps its placement; a page never arranged starts as 다꾸형 from the layout's starter. */
export const canvasOf = (spec: PlannerSpec) => spec.canvas?.day ?? toFree(starterCanvas(spec.layout?.day ?? 'sheet', spec.modules.map(m => m.type)));
export const modeOf = (spec: PlannerSpec): CanvasMode => spec.canvas?.day ? spec.canvas.mode ?? 'grid' : 'free';

/** Skin → CSS variables and classes for the planner root. */
export function skinProps(skin: Skin | undefined) {
  if (!skin) return {className: '', style: {}};
  const font = useFontFamily(skin.font);
  return {
    className: `skin paper-${skin.paper} heading-${skin.heading} font-${skin.font} check-${skin.check ?? 'box'} done-${skin.done ?? 'red-strike'} ${isDark(skin.background) ? 'mood-night skin-dark' : ''}`,
    style: {'--accent': skin.accent, '--bg': skin.background, '--surface': skin.surface, '--ink': skin.ink, '--radius': `${skin.radius}px`, '--font': font, background: skin.background, color: skin.ink} as React.CSSProperties,
  };
}

const asModule = (w: Widget, type: ModuleSpec['type']) => ({id: w.id, type, label: '', period: 'day', order: 0, view: 'list', options: w.options, fields: []}) as ModuleSpec;
const OWN_TITLE: Widget['type'][] = ['carry', 'habits', 'focus'];
/** Per-widget font: loads the face and exposes it as a CSS variable on the page. */
function FontVar({id, font}: {id: string; font: string}) {
  const family = useFontFamily(font);
  return <style>{`.canvas{--wfont-${id}:${family}}`}</style>;
}
const TAPE: Record<string, (c: string) => string> = {
  plain: c => c,
  stripe: c => `repeating-linear-gradient(45deg, ${c} 0 8px, color-mix(in srgb, ${c} 55%, #fff) 8px 16px)`,
  dot: c => `radial-gradient(color-mix(in srgb, ${c} 40%, #fff) 2px, ${c} 2.5px) 0 0/12px 12px`,
  check: c => `conic-gradient(${c} 25%, color-mix(in srgb, ${c} 50%, #fff) 0 50%, ${c} 0 75%, color-mix(in srgb, ${c} 50%, #fff) 0) 0 0/14px 14px`,
  grid: c => `linear-gradient(#fff8 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, #fff8 1px, transparent 1px) 0 0/10px 10px, ${c}`,
};
const SHAPES: Record<string, string> = {
  heart: 'M50 88 C20 66 4 48 10 28 C16 10 40 8 50 26 C60 8 84 10 90 28 C96 48 80 66 50 88Z',
  star: 'M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38Z',
  cloud: 'M25 78 C8 78 6 56 22 52 C20 34 44 28 52 42 C58 26 86 30 82 52 C98 54 96 78 78 78Z',
  circle: 'M50 6 A44 44 0 1 1 49.9 6Z',
  label: 'M6 22 H82 L96 50 L82 78 H6Z',
  flower: 'M50 10 C62 10 66 30 50 40 C66 30 86 38 80 52 C86 66 66 72 50 60 C66 72 62 90 50 90 C38 90 34 72 50 60 C34 72 14 66 20 52 C14 38 34 30 50 40 C34 30 38 10 50 10Z',
};

export type EditApi = {widgets: Widget[]; mode: CanvasMode; selected: string | null; select: (id: string | null) => void; change: (ws: Widget[], movedId?: string) => void};

export function DayCanvas({spec, settings, p, today, day, nav, edit, page, saveSpec}: {spec: PlannerSpec; settings: Settings; p: Planner; today: string; day: string; nav: Ctx['nav']; edit?: EditApi; page?: Widget[]; saveSpec?: Ctx['saveSpec']}) {
  const widgets = edit?.widgets ?? page ?? canvasOf(spec), mode = edit?.mode ?? (page ? 'free' : modeOf(spec)), M = METRICS[mode];
  const timer = useTimer(p, settings), color = colors(p, day);
  const timed = widgets.some(w => ['focus', 'timetable', 'receipt', 'hourly'].includes(w.type));
  const ctx: Ctx = {p, day, nav, now: () => new Date().toISOString(), timer: timed ? timer : null, color, settings, spec, saveSpec: edit ? undefined : saveSpec, preview: !!edit};
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
    const colW = (grid.current.clientWidth + M.gap) / M.cols, dx = Math.round((e.clientX - drag.x0) / colW), dy = Math.round((e.clientY - drag.y0) / (M.row + M.gap));
    const min = minSize(drag.w.type, mode);
    const preview = drag.mode === 'move'
      ? {...drag.w, x: Math.max(0, Math.min(M.cols - drag.w.w, drag.w.x + dx)), y: Math.max(0, drag.w.y + dy)}
      : {...drag.w, w: Math.max(min.w, Math.min(M.cols - drag.w.x, drag.w.w + dx)), h: Math.max(min.h, drag.w.h + dy)};
    if (preview.x !== drag.preview.x || preview.y !== drag.preview.y || preview.w !== drag.preview.w || preview.h !== drag.preview.h) setDrag({...drag, preview});
  };
  const end = () => {
    if (!drag || !edit) return;
    edit.change(settle(widgets.map(w => w.id === drag.id ? drag.preview : w), drag.id, mode), drag.id);
    setDrag(null);
  };
  const shown = drag ? widgets.map(w => w.id === drag.id ? drag.preview : w) : widgets;
  const rows = shown.reduce((m, w) => Math.max(m, w.y + w.h), 0) + (edit ? 6 * M.ky : 0);

  return <div ref={grid} className={`canvas mode-${mode} ${edit ? 'editing' : ''}`} style={{gridTemplateColumns: `repeat(${M.cols}, minmax(0, 1fr))`, gap: `${M.gap}px`, gridTemplateRows: `repeat(${Math.max(rows, edit ? 12 * M.ky : 1)}, ${M.row}px)`}}
    onPointerMove={move} onPointerUp={end} onPointerCancel={end} onClick={e => { if (edit && e.target === e.currentTarget) edit.select(null); }}>
    {shown.length === 0 && edit && <p className="canvas-empty">빈 화면이에요. 왼쪽에서 위젯을 골라 넣고, 끌어서 배치하세요.</p>}
    {shown.map(w => {
      const title = w.title ?? widgetInfo(w.type).label, sel = edit?.selected === w.id;
      const decor = isDecor(w.type), rot = Number(w.options.rotate ?? 0), dx = Number(w.options.dx ?? 0), dy = Number(w.options.dy ?? 0);
      return <section key={w.id} className={`wg ${decor ? 'wg-decor' : `wg-${w.style ?? spec.skin?.card ?? 'line'}`} wg-type-${w.type} ${sel ? 'selected' : ''} ${drag?.id === w.id ? 'dragging' : ''}`}
        style={{gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}`, order: w.y * M.cols + w.x, ...(w.color ? {'--accent': w.color} : {}),
          ...(w.font ? {fontFamily: `var(--wfont-${w.id})`} : {}), ...(w.background ? {background: w.background, '--wg-bg': w.background} : {}), ...(w.ink ? {color: w.ink, '--ink': w.ink, '--wg-ink': w.ink} : {}),
          ...(decor || rot ? {transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`} : {}), ...(decor || mode === 'free' ? {zIndex: (decor ? 20 : 1) + Number(w.options.layer ?? 0)} : {})} as React.CSSProperties}
        onClick={edit ? e => { e.stopPropagation(); edit.select(w.id); } : undefined}>
        {edit && <div className="wg-handle" onPointerDown={e => begin(e, w, 'move')} title="끌어서 옮기기">⠿ {widgetInfo(w.type).label}</div>}
        {w.font && <FontVar id={w.id} font={w.font} />}
        {title && !OWN_TITLE.includes(w.type) && !decor && <h3 className="wg-title">{title}</h3>}
        <div className="wg-body" inert={edit ? true : undefined}>
          <LabelProvider value={(w.options.labels as Record<string, unknown> | undefined) ?? {}}><WidgetBody w={w} ctx={ctx} spec={spec} settings={settings} today={today} endHour={endHour} /></LabelProvider>
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
    case 'table': return <TableWidget w={w} ctx={ctx} />;
    case 'timetable': return <Timetable key={day} m={asModule(w, 'timer')} p={p} day={day} settings={settings} color={ctx.color} />;
    case 'receipt': return <Receipt p={p} day={day} routineRate={ofKind(p.records, 'routine').length ? routineRate(p.records, day) : null} />;
    case 'hourly': return <HourlyDay ctx={ctx} startHour={start} endHour={endHour} />;
    case 'bullet': return <BulletDay ctx={ctx} />;
    case 'page': return <OnePageDay key={day} ctx={ctx} startHour={start} endHour={endHour} />;
    case 'checkin': return <CheckIn m={asModule(w, 'checkin')} p={p} day={day} now={ctx.now} />;
    case 'carry': return (day === today ? <CarryOver ctx={ctx} /> : null) ?? <Tip id="carry-empty" block>어제 못 끝낸 일이 없어요.</Tip>;
    case 'routine': return <Routines m={asModule(w, 'routine')} ctx={ctx} />;
    case 'habits': return ofKind(p.records, 'routine').some(r => r.body.active) ? <HabitGrid p={p} month={day.slice(0, 7)} today={today} /> : <Tip id="habits-empty" block>루틴을 추가하면 한 달 칸이 그려져요.</Tip>;
    case 'goals': return <DayGoals ctx={ctx} />;
    case 'condition': return <ConditionDay key={day} p={p} day={day} now={ctx.now} />;
    case 'sleep': return <SleepBox key={day} ctx={ctx} />;
    case 'review': return <ReviewBox key={day} ctx={ctx} />;
    case 'personas': return <PersonaToday ctx={ctx} />;
    case 'progress': {
      const goals = ofKind(p.records, 'goal'), g = goals.find(x => x.id === w.options.goalId) ?? goals.find(x => !x.body.parentGoalId && x.body.status === 'active');
      if (!g) return ctx.preview ? <div className="wg-progress"><span>예시 목표</span><Gauge pct={64} size="lg" /></div> : <Tip id="progress-empty" block>목표를 세우면 여기 크게 보여요.</Tip>;
      const gp = goalPercent(g.id, p.records);
      return <button className="wg-progress link" onClick={() => ctx.nav.openGoal(g.id)}><span>{g.body.title}</span><Gauge pct={gp.basis === 'none' ? null : gp.pct} size="lg" label={g.body.title} /></button>;
    }
    case 'dday': {
      const goals = ofKind(p.records, 'goal'), g = goals.find(x => x.id === w.options.goalId) ?? goals.find(x => x.body.deadline && x.body.status === 'active');
      const date = String(w.options.date ?? '') || g?.body.deadline || '';
      if (!date) return <p className="muted small">편집에서 날짜나 목표를 고르세요.</p>;
      const target = date.length === 7 ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)) : new Date(`${date}T00:00:00Z`);
      const left = Math.ceil((target.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      return <div className="wg-dday"><strong>{left > 0 ? `D-${left}` : left === 0 ? 'D-day' : `D+${-left}`}</strong><span>{String(w.options.label ?? '') || g?.body.title || date}</span></div>;
    }
    case 'text': return <p className={`wg-text size-${String(w.options.size ?? 'm')} align-${String(w.options.align ?? 'left')}`}>{String(w.options.text ?? '')}</p>;
    case 'sticker': return <span className="wg-sticker" style={{fontSize: `${Number(w.options.size ?? 56)}px`}}>{String(w.options.glyph ?? '🌙')}</span>;
    case 'tape': { const c = String(w.options.color ?? '#f3cfe3'); return <span className="wg-tape" style={{background: (TAPE[String(w.options.pattern ?? 'stripe')] ?? TAPE.plain!)(c), opacity: Number(w.options.opacity ?? 0.85)}} />; }
    case 'image': return w.options.src ? <figure className={`wg-image frame-${String(w.options.frame ?? 'polaroid')}`}><img src={String(w.options.src)} alt={String(w.options.caption ?? '')} />{w.options.caption ? <figcaption>{String(w.options.caption)}</figcaption> : null}</figure>
      : <p className="muted small">편집에서 사진을 고르세요.</p>;
    case 'shape': return <svg className="wg-shape" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden={!w.options.text}>
      <path d={SHAPES[String(w.options.shape ?? 'heart')] ?? SHAPES.heart} fill={String(w.options.color ?? '#f8c8c8')} />
      {w.options.text ? <text x="50" y="56" textAnchor="middle" fontSize={String(w.options.textSize ?? 14)} fill={w.ink ?? '#2d2f2a'}>{String(w.options.text)}</text> : null}
    </svg>;
  }
}

import {PlannerSpec} from './spec.ts';
import {defaultModule, TEMPLATES} from './catalog.ts';
import {COLS, Skin, Widget, WIDGET_TYPES, isDecor, modulesOf, settle, toFree, widgetInfo, type CanvasMode, type WidgetType} from './canvas.ts';

// Building a planner from outside the editor (an AI connector, an import): loose widget lists in, a valid spec out.

/** The spec after editing: canvas and skin saved, modules kept in step with the widgets used. */
export function applyCanvas(spec: PlannerSpec, widgets: Widget[], skin: Skin, mode: CanvasMode = spec.canvas?.mode ?? 'grid'): PlannerSpec {
  const used = modulesOf(widgets), modules = [...spec.modules];
  for (const m of used) if (!modules.some(x => x.type === m)) modules.push(defaultModule(m, modules.length));
  return PlannerSpec.parse({...spec, canvas: {...spec.canvas, day: widgets, mode}, skin, modules: modules.length ? modules : [defaultModule('tasks', 0)]});
}

export type LooseWidget = {type: string; x?: number; y?: number; w?: number; h?: number; title?: string; font?: string; color?: string; background?: string; ink?: string; style?: string; options?: Record<string, unknown>};
/** Fill sizes from the catalog, place widgets without a position below the others, clamp to the grid and settle overlaps. */
export function normalizeWidgets(input: LooseWidget[], idPrefix = ''): {widgets: Widget[]; dropped: string[]} {
  const dropped: string[] = [];
  let out: Widget[] = [], n = 0;
  // Widgets the caller placed keep their spot; the ones without a position are stacked below them.
  const placed = (r: LooseWidget) => r.x !== undefined || r.y !== undefined;
  const ordered = [...input.slice(0, 80).filter(placed), ...input.slice(0, 80).filter(r => !placed(r))];
  for (const raw of ordered) {
    if (!(WIDGET_TYPES as readonly string[]).includes(raw.type)) { dropped.push(raw.type); continue; }
    const type = raw.type as WidgetType, info = widgetInfo(type);
    const w = Math.min(COLS, Math.max(info.minW, Math.round(raw.w ?? info.w))), h = Math.min(60, Math.max(info.minH, Math.round(raw.h ?? info.h)));
    const bottom = out.filter(x => !isDecor(x.type)).reduce((m, x) => Math.max(m, x.y + x.h), 0);
    const candidate = {id: `${idPrefix}${type}-${++n}`, type, w, h, x: Math.max(0, Math.min(COLS - w, Math.round(raw.x ?? 0))), y: Math.max(0, Math.round(raw.y ?? (isDecor(type) ? 0 : bottom))),
      ...(raw.title !== undefined ? {title: raw.title} : {}), ...(raw.font ? {font: raw.font} : {}), ...(raw.color ? {color: raw.color} : {}),
      ...(raw.background ? {background: raw.background} : {}), ...(raw.ink ? {ink: raw.ink} : {}), ...(raw.style ? {style: raw.style} : {}), options: raw.options ?? {}};
    const parsed = Widget.safeParse(candidate);
    if (!parsed.success) { dropped.push(`${raw.type}: ${parsed.error.issues[0]?.message ?? 'invalid'}`); continue; }
    out = settle([...out, parsed.data], parsed.data.id);
  }
  return {widgets: out, dropped};
}

/** A whole planner from a name, widgets and a skin; starts from the current spec when there is one. */
/** Widgets come in 12-column units (easy to describe in chat); a 다꾸형 page (the default) stores them on the fine lattice. */
export function buildSpec(current: PlannerSpec | null, input: {name?: string; widgets: LooseWidget[]; skin?: Partial<Skin>; weekLayout?: 'horizontal' | 'vertical'; mode?: CanvasMode}) {
  const base = current ?? TEMPLATES[0]!.spec;
  const {widgets, dropped} = normalizeWidgets(input.widgets);
  const skin = Skin.parse({...(current?.skin ?? {}), ...(input.skin ?? {})});
  const mode = input.mode ?? 'free';
  const spec = applyCanvas({...base, ...(input.name ? {name: input.name.slice(0, 40)} : {}), layout: {...base.layout, ...(input.weekLayout ? {week: input.weekLayout} : {})}, source: {kind: 'chat'}}, mode === 'free' ? toFree(widgets) : widgets, skin, mode);
  return {spec, dropped};
}

/** Every widget id must be unique across the day page and all page tabs (a table's rows are keyed by its widget id).
 *  Returns the spec with later duplicates renamed, and what was renamed where. */
export function dedupeWidgetIds(spec: PlannerSpec): {spec: PlannerSpec; renamed: {from: string; to: string; tabId: string; widget: Widget}[]} {
  const seen = new Set<string>(), renamed: {from: string; to: string; tabId: string; widget: Widget}[] = [];
  const fix = (ws: Widget[] | undefined, tabId: string) => ws?.map(w => {
    if (!seen.has(w.id)) { seen.add(w.id); return w; }
    let id = `${w.id}-${tabId}`.slice(0, 40), k = 1;
    while (seen.has(id)) id = `${w.id}-${tabId}-${++k}`.slice(0, 40);
    seen.add(id);
    const next = {...w, id};
    renamed.push({from: w.id, to: id, tabId, widget: next});
    return next;
  });
  const day = fix(spec.canvas?.day, 'day');
  const tabs = spec.tabs?.map(t => ({...t, widgets: fix(t.widgets, t.id)}));
  return {spec: renamed.length ? {...spec, canvas: {...spec.canvas, day}, ...(tabs ? {tabs} : {})} : spec, renamed};
}

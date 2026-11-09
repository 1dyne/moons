import {z} from 'zod';
import type {ModuleType} from './spec.ts';

// The DIY page: widgets on a 12-column grid that the user places, sizes and styles, plus a skin.
// Widgets only decide how records are shown; every widget reads and writes the same life records.
export const COLS = 12;
export const WIDGET_TYPES = ['focus', 'tasks', 'timetable', 'receipt', 'hourly', 'bullet', 'page', 'checkin', 'carry', 'routine', 'habits',
  'goals', 'progress', 'dday', 'condition', 'sleep', 'review', 'personas', 'text'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export type WidgetInfo = {type: WidgetType; label: string; desc: string; group: '기록' | '시간' | '목표' | '나' | '꾸미기'; w: number; h: number; minW: number; minH: number; module?: ModuleType};
export const WIDGETS: WidgetInfo[] = [
  {type: 'tasks', label: '할 일', desc: '○△× 체크, 분량·예상 시간, 목표 연결', group: '기록', w: 7, h: 12, minW: 3, minH: 5, module: 'tasks'},
  {type: 'bullet', label: '빠른 기록', desc: '불렛저널처럼 • 할 일 ○ 일정 – 메모', group: '기록', w: 7, h: 12, minW: 3, minH: 5, module: 'memo'},
  {type: 'page', label: '자유 페이지', desc: '모눈 위에 자유롭게 쓰는 칸', group: '기록', w: 6, h: 10, minW: 3, minH: 4, module: 'memo'},
  {type: 'carry', label: '어제 못 끝낸 일', desc: '오늘로 옮기기', group: '기록', w: 6, h: 4, minW: 3, minH: 3, module: 'tasks'},
  {type: 'review', label: '하루 돌아보기', desc: '한 줄 회고, 나만 보기', group: '기록', w: 6, h: 5, minW: 3, minH: 4, module: 'review'},
  {type: 'focus', label: '집중 타이머', desc: '지금 하는 일과 흐르는 시간, 오늘 순집중', group: '시간', w: 12, h: 3, minW: 4, minH: 3, module: 'timer'},
  {type: 'timetable', label: '10분 타임테이블', desc: '집중한 시간이 칸으로 칠해짐', group: '시간', w: 5, h: 16, minW: 3, minH: 6, module: 'timer'},
  {type: 'hourly', label: '시간대별 타임라인', desc: '계획 블록 vs 실제 집중', group: '시간', w: 6, h: 16, minW: 4, minH: 8, module: 'timeblock'},
  {type: 'receipt', label: '하루 영수증', desc: '할 일별 시간, 합계, 컨디션', group: '시간', w: 4, h: 10, minW: 3, minH: 6, module: 'timer'},
  {type: 'checkin', label: '아침 점검', desc: '기상 에너지·고정 일정·현실 가용 시간', group: '나', w: 7, h: 9, minW: 4, minH: 6, module: 'checkin'},
  {type: 'condition', label: '컨디션', desc: '1~10점, 오늘 점수', group: '나', w: 6, h: 6, minW: 4, minH: 4, module: 'condition'},
  {type: 'sleep', label: '수면', desc: '잠든·일어난 시각', group: '나', w: 4, h: 4, minW: 3, minH: 3, module: 'sleep'},
  {type: 'personas', label: '페르소나', desc: '오늘 어떤 나로 시간을 썼나', group: '나', w: 6, h: 3, minW: 3, minH: 2, module: 'personas'},
  {type: 'routine', label: '오늘의 루틴', desc: '그날 할 루틴을 골라 체크', group: '목표', w: 5, h: 8, minW: 3, minH: 4, module: 'routine'},
  {type: 'habits', label: '습관 격자', desc: '한 달 루틴 × 날짜', group: '목표', w: 12, h: 6, minW: 6, minH: 4, module: 'routine'},
  {type: 'goals', label: '이어진 목표', desc: '오늘 걸린 주간·월간·연간 목표와 %', group: '목표', w: 5, h: 6, minW: 3, minH: 3, module: 'goals'},
  {type: 'progress', label: '목표 진행률', desc: '고른 목표 하나를 크게', group: '목표', w: 4, h: 4, minW: 3, minH: 3, module: 'goals'},
  {type: 'dday', label: 'D-day', desc: '목표 마감까지 남은 날', group: '목표', w: 3, h: 3, minW: 2, minH: 2, module: 'goals'},
  {type: 'text', label: '문구', desc: '좌우명, 오늘의 다짐, 제목', group: '꾸미기', w: 6, h: 3, minW: 2, minH: 1},
];
export const widgetInfo = (t: WidgetType) => WIDGETS.find(w => w.type === t)!;

export const Widget = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(WIDGET_TYPES),
  x: z.number().int().min(0).max(COLS - 1), y: z.number().int().min(0).max(400),
  w: z.number().int().min(1).max(COLS), h: z.number().int().min(1).max(60),
  title: z.string().max(40).optional(),          // empty string hides the title
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  style: z.enum(['card', 'line', 'plain', 'filled']).optional(),
  options: z.record(z.unknown()).default({}),
});
export type Widget = z.infer<typeof Widget>;

export const Skin = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a66b8'),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#252720'),
  paper: z.enum(['plain', 'grid', 'dot', 'lined']).default('plain'),
  font: z.enum(['sans', 'serif', 'hand', 'mono']).default('sans'),
  radius: z.number().int().min(0).max(28).default(14),
  card: z.enum(['card', 'line', 'plain', 'filled']).default('line'),
  heading: z.enum(['rule', 'pill', 'plain']).default('rule'),
});
export type Skin = z.infer<typeof Skin>;
export const SKIN_PRESETS: {id: string; name: string; skin: Skin}[] = [
  {id: 'calm', name: '차분한 미니멀', skin: Skin.parse({})},
  {id: 'ivory', name: '아이보리 종이', skin: Skin.parse({accent: '#a0784a', background: '#fbf6ea', surface: '#fffcf4', ink: '#3b342a', font: 'serif', radius: 6, card: 'line'})},
  {id: 'study', name: '스터디 모눈', skin: Skin.parse({accent: '#00838f', paper: 'grid', radius: 4, card: 'card', heading: 'rule'})},
  {id: 'deco', name: '다꾸 감성', skin: Skin.parse({accent: '#d98a8a', background: '#fff8f6', paper: 'dot', font: 'hand', radius: 22, card: 'filled', heading: 'pill'})},
  {id: 'mint', name: '민트 노트', skin: Skin.parse({accent: '#2f9585', background: '#f3faf8', surface: '#ffffff', radius: 18, card: 'card', heading: 'pill'})},
  {id: 'night', name: '다크', skin: Skin.parse({accent: '#8aaaf8', background: '#1d2025', surface: '#24282e', ink: '#e7e8e2', radius: 14, card: 'card'})},
];
/** Dark backgrounds get the night rules (inputs, borders) automatically. */
export function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 110;
}

const W = (id: string, type: WidgetType, x: number, y: number, w?: number, h?: number, extra: Partial<Widget> = {}): Widget =>
  ({id, type, x, y, w: w ?? widgetInfo(type).w, h: h ?? widgetInfo(type).h, options: {}, ...extra});
/** Starting pages per layout, so a sample planner opens in the editor already arranged. */
export function starterCanvas(layout: 'sheet' | 'hourly' | 'bullet' | 'onepage' | 'blank', modules: ModuleType[]): Widget[] {
  if (layout === 'blank') return [];
  const has = (m: ModuleType) => modules.includes(m);
  const out: Widget[] = [];
  let y = 0;
  const timer = has('timer') || layout === 'sheet';
  if (timer) { out.push(W('focus', 'focus', 0, 0)); y = 3; }
  if (has('checkin')) { out.push(W('checkin', 'checkin', 0, y, 7, 9)); y += 9; }
  const main = layout === 'hourly' ? 'hourly' : layout === 'bullet' ? 'bullet' : layout === 'onepage' ? 'page' : 'tasks';
  out.push(W('main', main, 0, y, 7, layout === 'hourly' ? 16 : 12));
  let side = 0;
  const right = (type: WidgetType, h?: number) => { out.push(W(type, type, 7, side + (has('checkin') ? 3 : timer ? 3 : 0), 5, h)); side += h ?? widgetInfo(type).h; };
  if (layout === 'onepage' || layout === 'bullet') out.push(W('tasks', 'tasks', 0, y + 12, 7, 8));
  if (timer && layout !== 'hourly') right('timetable', 16);
  if (timer) right('receipt', 10);
  let below = y + (layout === 'onepage' || layout === 'bullet' ? 20 : layout === 'hourly' ? 16 : 12);
  const left = (type: WidgetType, h?: number) => { out.push(W(type, type, 0, below, 7, h)); below += h ?? widgetInfo(type).h; };
  if (has('routine')) left('routine', 8);
  if (has('goals')) left('goals', 6);
  if (has('personas')) left('personas', 3);
  if (has('condition')) left('condition', 7);
  if (has('sleep')) left('sleep', 4);
  if (has('review')) left('review', 5);
  return out;
}

/** Modules a canvas uses (consumers read e.g. whether sleep or the timer is in use). */
export function modulesOf(widgets: Widget[]): ModuleType[] {
  return [...new Set(widgets.map(w => widgetInfo(w.type).module).filter((m): m is ModuleType => !!m))];
}

const overlaps = (a: Widget, b: Widget) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** After a move or resize, widgets the moved one now covers are pushed down (cascading), so nothing overlaps. */
export function settle(widgets: Widget[], movedId: string): Widget[] {
  const out = widgets.map(w => ({...w, x: Math.max(0, Math.min(COLS - Math.min(w.w, COLS), w.x)), w: Math.min(COLS, w.w)}));
  const queue = [out.find(w => w.id === movedId)!];
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const a = queue.shift()!;
    for (const b of out) if (b.id !== a.id && overlaps(a, b)) { b.y = a.y + a.h; queue.push(b); }
  }
  return out;
}
/** Where a new widget fits: the first row below everything in the columns it needs. */
export function placeNew(widgets: Widget[], type: WidgetType, id: string): Widget {
  const info = widgetInfo(type), bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  // A quote reads better without a heading; the user can add one.
  return {id, type, x: 0, y: bottom, w: info.w, h: info.h, options: {}, ...(type === 'text' ? {title: ''} : {})};
}

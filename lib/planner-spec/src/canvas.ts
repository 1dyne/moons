import {z} from 'zod';
import type {ModuleType} from './spec.ts';

// The DIY page: widgets on a 12-column grid that the user places, sizes and styles, plus a skin.
// Widgets only decide how records are shown; every widget reads and writes the same life records.
export const COLS = 12;
// Two placements. 정리형(grid): 12 columns × 30px rows, widgets never overlap. 다꾸형(free, the default for new pages):
// a fine 48 × 10px lattice where anything can overlap, layer and sit exactly where the user drops it.
export type CanvasMode = 'free' | 'grid';
export const METRICS: Record<CanvasMode, {cols: number; row: number; gap: number; kx: number; ky: number}> = {
  grid: {cols: 12, row: 30, gap: 10, kx: 1, ky: 1},
  free: {cols: 48, row: 10, gap: 0, kx: 4, ky: 3},
};
export const WIDGET_TYPES = ['focus', 'tasks', 'timetable', 'receipt', 'hourly', 'bullet', 'page', 'checkin', 'carry', 'routine', 'habits',
  'goals', 'progress', 'dday', 'condition', 'sleep', 'review', 'personas', 'table', 'custom', 'energy', 'mission', 'persona-board', 'wishes', 'pagebox', 'list', 'week-view', 'month-view', 'goals-view', 'insights-view', 'text', 'sticker', 'tape', 'image', 'shape'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export type WidgetInfo = {type: WidgetType; label: string; desc: string; group: '기록' | '시간' | '목표' | '나' | '꾸미기' | '내 위젯' | '보기'; w: number; h: number; minW: number; minH: number; module?: ModuleType};
export const WIDGETS: WidgetInfo[] = [
  {type: 'tasks', label: '할 일', desc: '○△× 체크, 분량·예상 시간, 목표 연결', group: '기록', w: 7, h: 12, minW: 3, minH: 5, module: 'tasks'},
  {type: 'bullet', label: '빠른 기록', desc: '불렛저널처럼 • 할 일 ○ 일정 – 메모', group: '기록', w: 7, h: 12, minW: 3, minH: 5, module: 'memo'},
  {type: 'page', label: '자유 페이지', desc: '모눈 위에 자유롭게 쓰는 칸', group: '기록', w: 6, h: 10, minW: 3, minH: 4, module: 'memo'},
  {type: 'table', label: '표 (내가 만드는 DB)', desc: '열 이름·종류를 직접 정하는 표. 공부 기록, 지출, 독서…', group: '기록', w: 8, h: 8, minW: 3, minH: 4},
  {type: 'custom', label: '내 위젯', desc: '내 라이브러리의 위젯(블록·코드)', group: '내 위젯', w: 6, h: 8, minW: 2, minH: 2},
  {type: 'carry', label: '어제 못 끝낸 일', desc: '오늘로 옮기기', group: '기록', w: 6, h: 4, minW: 3, minH: 3, module: 'tasks'},
  {type: 'review', label: '하루 돌아보기', desc: '한 줄 회고, 나만 보기', group: '기록', w: 6, h: 5, minW: 3, minH: 4, module: 'review'},
  {type: 'focus', label: '집중 타이머', desc: '지금 하는 일과 흐르는 시간, 오늘 순집중', group: '시간', w: 12, h: 3, minW: 4, minH: 3, module: 'timer'},
  {type: 'timetable', label: '10분 타임테이블', desc: '집중한 시간이 칸으로 칠해짐', group: '시간', w: 5, h: 16, minW: 3, minH: 6, module: 'timer'},
  {type: 'hourly', label: '시간대별 타임라인', desc: '계획 블록 vs 실제 집중', group: '시간', w: 6, h: 16, minW: 4, minH: 8, module: 'timeblock'},
  {type: 'receipt', label: '하루 영수증', desc: '할 일별 시간, 합계, 컨디션', group: '시간', w: 4, h: 10, minW: 3, minH: 6, module: 'timer'},
  {type: 'checkin', label: '아침 점검', desc: '기상 에너지·고정 일정·현실 가용 시간', group: '나', w: 7, h: 9, minW: 4, minH: 6, module: 'checkin'},
  {type: 'condition', label: '컨디션', desc: '1~10점, 오늘 점수', group: '나', w: 6, h: 6, minW: 4, minH: 4, module: 'condition'},
  {type: 'sleep', label: '수면', desc: '잠든·일어난 시각', group: '나', w: 4, h: 4, minW: 3, minH: 3, module: 'sleep'},
  {type: 'energy', label: '에너지 신호등', desc: '시간대별 컨디션 점(7↑ 파랑·4~6 호박·3↓ 빨강), 낮으면 경고', group: '나', w: 6, h: 4, minW: 3, minH: 3, module: 'condition'},
  {type: 'persona-board', label: '페르소나 현황', desc: '이번 달 배치(Deployed·Attached·Standby), 한도 경고, 획득한 능력', group: '나', w: 6, h: 8, minW: 4, minH: 4, module: 'personas'},
  {type: 'mission', label: '오늘의 미션', desc: '순집중 목표 vs 일정 전부 완료, 먼저 찬 쪽부터 자유시간, 해금할 소원', group: '목표', w: 6, h: 6, minW: 4, minH: 4, module: 'timer'},
  {type: 'personas', label: '페르소나', desc: '오늘 어떤 나로 시간을 썼나', group: '나', w: 6, h: 3, minW: 3, minH: 2, module: 'personas'},
  {type: 'routine', label: '오늘의 루틴', desc: '그날 할 루틴을 골라 체크', group: '목표', w: 5, h: 8, minW: 3, minH: 4, module: 'routine'},
  {type: 'habits', label: '습관 격자', desc: '한 달 루틴 × 날짜', group: '목표', w: 12, h: 6, minW: 6, minH: 4, module: 'routine'},
  {type: 'goals', label: '이어진 목표', desc: '오늘 걸린 주간·월간·연간 목표와 %', group: '목표', w: 5, h: 6, minW: 3, minH: 3, module: 'goals'},
  {type: 'progress', label: '목표 진행률', desc: '고른 목표 하나를 크게', group: '목표', w: 4, h: 4, minW: 3, minH: 3, module: 'goals'},
  {type: 'dday', label: 'D-day', desc: '목표 마감까지 남은 날', group: '목표', w: 3, h: 3, minW: 2, minH: 2, module: 'goals'},
  {type: 'wishes', label: '소원 상자', desc: '이루면 열리는 소원: 잠김 → 해금 → 사용함', group: '목표', w: 6, h: 6, minW: 3, minH: 3},
  {type: 'pagebox', label: '메모·소원 상자', desc: '아이콘을 누르면 새 페이지가 열려요. 페이지마다 자유롭게 꾸며요', group: '기록', w: 6, h: 8, minW: 3, minH: 3},
  {type: 'list', label: '목록 보기', desc: '할 일·목표를 조건(기간·상태·분류·속성)으로 걸러 보는 칸', group: '기록', w: 8, h: 10, minW: 3, minH: 4},
  {type: 'week-view', label: '주간 계획표', desc: '이번 주 7일', group: '보기', w: 12, h: 20, minW: 6, minH: 8},
  {type: 'month-view', label: '월·년 보기', desc: '이달 한눈에와 달력', group: '보기', w: 12, h: 24, minW: 6, minH: 8},
  {type: 'goals-view', label: '목표 보기', desc: '목표와 진행률', group: '보기', w: 12, h: 20, minW: 6, minH: 8},
  {type: 'insights-view', label: '분석 보기', desc: '집중·컨디션·예상 대비 실제', group: '보기', w: 12, h: 20, minW: 6, minH: 8},
  {type: 'text', label: '문구', desc: '좌우명, 오늘의 다짐, 제목', group: '꾸미기', w: 6, h: 3, minW: 2, minH: 1},
  {type: 'sticker', label: '스티커', desc: '이모지·글자 스티커, 돌리고 겹치기', group: '꾸미기', w: 2, h: 3, minW: 1, minH: 1},
  {type: 'tape', label: '마스킹테이프', desc: '무늬·색·기울기를 고르는 테이프', group: '꾸미기', w: 4, h: 1, minW: 1, minH: 1},
  {type: 'image', label: '사진', desc: '사진을 붙이고 폴라로이드 틀', group: '꾸미기', w: 3, h: 6, minW: 1, minH: 1},
  {type: 'shape', label: '도형·라벨', desc: '하트·별·구름·라벨 위에 글자', group: '꾸미기', w: 3, h: 3, minW: 1, minH: 1},
];
export const widgetInfo = (t: WidgetType) => WIDGETS.find(w => w.type === t)!;
/** A user-made property (Notion-style): a column in a table widget or an extra field on tasks. */
export const PROP_TYPES = [{id: 'text', name: '글'}, {id: 'number', name: '숫자'}, {id: 'select', name: '선택'}, {id: 'check', name: '체크'}, {id: 'date', name: '날짜'}, {id: 'role', name: '역할 (페르소나별)'}] as const;
export type PropType = typeof PROP_TYPES[number]['id'];
export const PropDef = z.object({
  id: z.string().regex(/^[a-z0-9]{1,24}$/),
  name: z.string().trim().min(1).max(30),
  type: z.enum(PROP_TYPES.map(t => t.id) as [PropType, ...PropType[]]),
  options: z.array(z.string().trim().min(1).max(30)).max(100).default([]),
});
export type PropDef = z.infer<typeof PropDef>;
export const newPropId = () => Math.random().toString(36).slice(2, 10);

/** Words on a widget's buttons and boxes the user may rename. key → default text. */
export const WIDGET_LABELS: Partial<Record<WidgetType, {key: string; def: string; name?: string}[]>> = {
  focus: [{key: 'ask', def: '지금 무엇에 집중하나요?'}, {key: 'other', def: '다른 일'}, {key: 'running', def: '지금 집중 중'}, {key: 'total', def: '오늘 순집중'}],
  tasks: [{key: 'placeholder', def: '할 일 · 예) 수학 20문제, 보고서 90분, 14:00-15:00 회의'}, {key: 'add', def: '추가'}, {key: 'cat.must', def: '꼭'}, {key: 'cat.want', def: '하고 싶은'}, {key: 'cat.leisure', def: '여가'}],
  routine: [{key: 'placeholder', def: '루틴 추가 (매일)'}, {key: 'add', def: '추가'}, {key: 'missed', def: '× 못 했어요'}],
  sleep: [{key: 'sleep', def: '☾ 잘게요'}, {key: 'wake', def: '일어났어요'}],
  review: [{key: 'placeholder', def: '오늘은 어땠나요? 한 줄이면 충분해요.'}],
  table: [{key: 'add', def: '+ 새 줄'}],
  energy: [{key: 'msg.blue', def: '', name: '파랑일 때 문구'}, {key: 'msg.amber', def: '', name: '호박일 때 문구'}, {key: 'msg.red', def: '', name: '빨강일 때 문구'}],
  pagebox: [{key: 'ask', def: '새 페이지를 만들까요?', name: '카드 문구'}, {key: 'go', def: '이동'}, {key: 'cancel', def: '취소'}],
  mission: [{key: 'focus', def: '순집중'}, {key: 'plan', def: '일정 전부 완료'}, {key: 'free', def: '자유시간'}, {key: 'unlock', def: '해금'}],
};

/** Decorations float: they may overlap anything, rotate, and never push other widgets. */
export const DECOR: WidgetType[] = ['sticker', 'tape', 'image', 'shape'];
export const isDecor = (t: WidgetType) => DECOR.includes(t);

// Korean web fonts (Google Fonts, OFL). Loaded only when a skin or widget uses them.
export type FontInfo = {id: string; name: string; family: string; css: string; kind: '고딕' | '명조' | '손글씨' | '디스플레이' | '고정폭'};
const F = (id: string, name: string, family: string, kind: FontInfo['kind'], css?: string): FontInfo => ({id, name, family, kind, css: css ?? family.replace(/ /g, '+')});
export const FONTS: FontInfo[] = [
  F('pretendard', '기본 고딕', 'Pretendard', '고딕', ''),
  F('noto-sans', '본고딕 (Noto Sans KR)', 'Noto Sans KR', '고딕', 'Noto+Sans+KR:wght@400;700'),
  F('gothic-a1', '고딕 A1', 'Gothic A1', '고딕', 'Gothic+A1:wght@400;700'),
  F('ibm-plex', 'IBM Plex Sans KR', 'IBM Plex Sans KR', '고딕', 'IBM+Plex+Sans+KR:wght@400;700'),
  F('nanum-gothic', '나눔고딕', 'Nanum Gothic', '고딕', 'Nanum+Gothic:wght@400;700'),
  F('gowun-dodum', '고운돋움', 'Gowun Dodum', '고딕'),
  F('orbit', '오르빗', 'Orbit', '고딕'),
  F('noto-serif', '본명조 (Noto Serif KR)', 'Noto Serif KR', '명조', 'Noto+Serif+KR:wght@400;700'),
  F('nanum-myeongjo', '나눔명조', 'Nanum Myeongjo', '명조', 'Nanum+Myeongjo:wght@400;700'),
  F('gowun-batang', '고운바탕', 'Gowun Batang', '명조', 'Gowun+Batang:wght@400;700'),
  F('hahmlet', '함렛', 'Hahmlet', '명조', 'Hahmlet:wght@400;700'),
  F('song-myung', '송명', 'Song Myung', '명조'),
  F('diphylleia', '디필레이아', 'Diphylleia', '명조'),
  F('nanum-pen', '나눔손글씨 펜', 'Nanum Pen Script', '손글씨'),
  F('nanum-brush', '나눔손글씨 붓', 'Nanum Brush Script', '손글씨'),
  F('gaegu', '개구', 'Gaegu', '손글씨', 'Gaegu:wght@400;700'),
  F('hi-melody', '하이멜로디', 'Hi Melody', '손글씨'),
  F('gamja-flower', '감자꽃', 'Gamja Flower', '손글씨'),
  F('poor-story', '푸어스토리', 'Poor Story', '손글씨'),
  F('single-day', '싱글데이', 'Single Day', '손글씨'),
  F('cute-font', '귀여운 글씨', 'Cute Font', '손글씨'),
  F('east-sea-dokdo', '동해 독도', 'East Sea Dokdo', '손글씨'),
  F('dokdo', '독도', 'Dokdo', '손글씨'),
  F('kirang', '기랑해랑', 'Kirang Haerang', '손글씨'),
  F('yeon-sung', '연성', 'Yeon Sung', '손글씨'),
  F('jua', '주아', 'Jua', '디스플레이'),
  F('do-hyeon', '도현', 'Do Hyeon', '디스플레이'),
  F('dongle', '동글', 'Dongle', '디스플레이', 'Dongle:wght@400;700'),
  F('sunflower', '해바라기', 'Sunflower', '디스플레이', 'Sunflower:wght@300;500;700'),
  F('black-han-sans', '검은고딕', 'Black Han Sans', '디스플레이'),
  F('stylish', '스타일리시', 'Stylish', '디스플레이'),
  F('gugi', '구기', 'Gugi', '디스플레이'),
  F('nanum-coding', '나눔고딕코딩', 'Nanum Gothic Coding', '고정폭', 'Nanum+Gothic+Coding:wght@400;700'),
];
const LEGACY_FONT: Record<string, string> = {sans: 'pretendard', serif: 'gowun-batang', hand: 'gaegu', mono: 'nanum-coding'};
export const fontInfo = (id: string | undefined) => FONTS.find(f => f.id === (id && LEGACY_FONT[id] ? LEGACY_FONT[id] : id)) ?? FONTS[0]!;
/** Palettes: pastels for 다꾸, deep tones for 정리형, and neutrals. */
export const PALETTE = ['#f8c8c8', '#fbd9b4', '#fbe4b0', '#d7ecc4', '#c7e6e0', '#c9dcf6', '#d9cff2', '#f3cfe3',
  '#e07a7a', '#e9a25c', '#e9b949', '#7cb26a', '#2f9585', '#3a66b8', '#7b6bc4', '#c4689a',
  '#8b3a3a', '#a0784a', '#5b6b2e', '#00838f', '#1f3d73', '#3d2c6b', '#2d2f2a', '#ffffff'];

export const Widget = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(WIDGET_TYPES),
  x: z.number().int().min(0).max(47), y: z.number().int().min(0).max(2000),
  w: z.number().int().min(1).max(48), h: z.number().int().min(1).max(240),
  title: z.string().max(40).optional(),          // empty string hides the title
  font: z.string().max(40).optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  style: z.enum(['card', 'line', 'plain', 'filled']).optional(),
  options: z.record(z.unknown()).default({}),
});
export type Widget = z.infer<typeof Widget>;

/** How progress (%) is drawn everywhere: goal bars, month summary, progress widgets. All monochrome; the accent marks the live edge. */
export const GAUGES = [
  {id: 'segment', name: '칸 막대', hint: '10칸을 채워 가요. 지금 채우는 칸만 강조색.'},
  {id: 'bar', name: '눈금 막대', hint: '얇은 막대에 25·50·75 눈금.'},
  {id: 'ring', name: '링', hint: '숫자를 가는 링이 감싸요. 좁은 칸에 좋아요.'},
  {id: 'arc', name: '바늘 계기', hint: '반원 눈금과 바늘. 큰 목표 하나에 어울려요.'},
  {id: 'pips', name: '점 10개', hint: '점 하나가 10%. 여러 목표를 나란히 볼 때.'},
  {id: 'number', name: '숫자 + 자', hint: '큰 숫자 아래 자 눈금에 위치 표시.'},
] as const;
export type GaugeKind = typeof GAUGES[number]['id'];
const GAUGE_IDS = GAUGES.map(g => g.id) as [GaugeKind, ...GaugeKind[]];

export const Skin = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f2c230'),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#e6e6e1'),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f5f5f1'),
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#151515'),
  paper: z.enum(['plain', 'grid', 'dot', 'lined']).default('plain'),
  font: z.string().max(40).default('ibm-plex'),
  radius: z.number().int().min(0).max(28).default(0),
  card: z.enum(['card', 'line', 'plain', 'filled']).default('line'),
  heading: z.enum(['rule', 'pill', 'plain']).default('rule'),
  gauge: z.enum(GAUGE_IDS).default('segment'),
  check: z.enum(['box', 'circle']).default('box'),
  done: z.enum(['red-strike', 'strike', 'fade', 'highlight']).default('red-strike'),
});
/** Checkbox shape: A안 square box with a red pen tick, or the ○△× circle. */
export const CHECKS = [{id: 'box', name: '네모 상자 (빨간 펜 체크)'}, {id: 'circle', name: '동그라미 ○△×'}] as const;
/** How a finished item's words look. */
export const DONE_STYLES = [{id: 'red-strike', name: '빨간 취소선'}, {id: 'strike', name: '회색 취소선'}, {id: 'fade', name: '흐리게'}, {id: 'highlight', name: '형광펜'}] as const;
export const HIGHLIGHTS = [{id: 'yellow', name: '노랑', color: '#ffe066'}, {id: 'pink', name: '분홍', color: '#ffb3c7'}, {id: 'green', name: '연두', color: '#b8e994'}, {id: 'blue', name: '하늘', color: '#a8d8ff'}] as const;
export type Skin = z.infer<typeof Skin>;
export const SKIN_PRESETS: {id: string; name: string; skin: Skin}[] = [
  {id: 'panel', name: '계기판', skin: Skin.parse({})},
  {id: 'panel-dark', name: '계기판 다크', skin: Skin.parse({background: '#151515', surface: '#1f1f1d', ink: '#ecece7'})},
  {id: 'calm', name: '차분한 미니멀', skin: Skin.parse({accent: '#3a66b8', background: '#ffffff', surface: '#ffffff', ink: '#252720', font: 'pretendard', radius: 14, check: 'circle', done: 'strike'})},
  {id: 'ivory', name: '아이보리 종이', skin: Skin.parse({accent: '#a0784a', background: '#fbf6ea', surface: '#fffcf4', ink: '#3b342a', font: 'gowun-batang', radius: 6, card: 'line', gauge: 'bar', check: 'circle', done: 'strike'})},
  {id: 'study', name: '스터디 모눈', skin: Skin.parse({accent: '#00838f', background: '#ffffff', surface: '#ffffff', ink: '#252720', font: 'pretendard', paper: 'grid', radius: 4, card: 'card', heading: 'rule', check: 'circle', done: 'strike'})},
  {id: 'deco', name: '다꾸 감성', skin: Skin.parse({accent: '#d98a8a', background: '#fff8f6', surface: '#ffffff', ink: '#252720', gauge: 'pips', paper: 'dot', font: 'gaegu', radius: 22, card: 'filled', heading: 'pill', check: 'circle', done: 'strike'})},
  {id: 'mint', name: '민트 노트', skin: Skin.parse({accent: '#2f9585', background: '#f3faf8', surface: '#ffffff', ink: '#252720', font: 'pretendard', gauge: 'ring', radius: 18, card: 'card', heading: 'pill', check: 'circle', done: 'strike'})},
  {id: 'night', name: '다크', skin: Skin.parse({accent: '#8aaaf8', background: '#1d2025', surface: '#24282e', ink: '#e7e8e2', font: 'pretendard', radius: 14, card: 'card', check: 'circle', done: 'strike'})},
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

const overlaps = (a: Widget, b: Widget) => !isDecor(a.type) && !isDecor(b.type) && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** After a move or resize, widgets the moved one now covers are pushed down (cascading), so nothing overlaps. */
export function settle(widgets: Widget[], movedId: string, mode: CanvasMode = 'grid'): Widget[] {
  const cols = METRICS[mode].cols;
  const out = widgets.map(w => ({...w, x: Math.max(0, Math.min(cols - Math.min(w.w, cols), w.x)), w: Math.min(cols, w.w)}));
  const moved = out.find(w => w.id === movedId)!;
  // In 다꾸형 everything may overlap; layers decide what is on top.
  if (!moved || isDecor(moved.type) || mode === 'free') return out;
  const queue = [moved];
  for (let guard = 0; queue.length && guard < 500; guard++) {
    const a = queue.shift()!;
    for (const b of out) if (b.id !== a.id && overlaps(a, b)) { b.y = a.y + a.h; queue.push(b); }
  }
  return out;
}
/** Where a new widget fits: the first row below everything in the columns it needs. */
export function placeNew(widgets: Widget[], type: WidgetType, id: string, mode: CanvasMode = 'grid'): Widget {
  if (mode === 'free') return toFree([placeNew(toGridUnits(widgets), type, id, 'grid')])[0]!;
  const info = widgetInfo(type), bottom = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
  // Decorations start near the top so they can be dropped onto the page.
  if (isDecor(type)) {
    // Each new one steps down and left of the last, so a pile of stickers never hides itself.
    const n = widgets.filter(w => isDecor(w.type)).length;
    return {id, type, x: Math.max(0, COLS - info.w - 1 - (n % 4) * 2), y: (n * 3) % 18, w: info.w, h: info.h, options: {}};
  }
  // A quote reads better without a heading; the user can add one.
  return {id, type, x: 0, y: bottom, w: info.w, h: info.h, options: {}, ...(type === 'text' ? {title: ''} : {})};
}

/** 정리형 → 다꾸형: the same page on the fine lattice. */
export const toFree = (ws: Widget[]): Widget[] => ws.map(w => ({...w, x: w.x * 4, y: w.y * 3, w: w.w * 4, h: w.h * 3}));
const toGridUnits = (ws: Widget[]): Widget[] => ws.map(w => ({...w, x: Math.min(COLS - 1, Math.round(w.x / 4)), y: Math.round(w.y / 3), w: Math.max(1, Math.min(COLS, Math.round(w.w / 4))), h: Math.max(1, Math.round(w.h / 3))}));
/** 다꾸형 → 정리형: snap to the 12-column grid, then settle overlaps top to bottom (decorations stay free). */
export function toGrid(ws: Widget[]): Widget[] {
  let out = toGridUnits(ws);
  for (const w of [...out].filter(x => !isDecor(x.type)).sort((a, b) => a.y - b.y || a.x - b.x)) out = settle(out, w.id, 'grid');
  return out;
}
/** Smallest size a widget can take in a mode. */
export const minSize = (t: WidgetType, mode: CanvasMode) => ({w: widgetInfo(t).minW * METRICS[mode].kx, h: widgetInfo(t).minH * METRICS[mode].ky});

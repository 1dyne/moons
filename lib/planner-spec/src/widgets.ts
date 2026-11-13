import {z} from 'zod';
import {PROP_TYPES, Skin, Widget, type PropType} from './canvas.ts';
import {MadePack} from './pack.ts';

// lit widget platform (docs/lit/WIDGET_PLATFORM.md).
// One package format for everyone: a manifest (JSON). Non-developers (and AI) compose built-in blocks;
// developers add code that runs in a sandboxed frame and talks to lit only through the widget API.

/** What a widget may touch. Asked once at install; code widgets get nothing else. */
export const PERMISSIONS = [
  {id: 'table:read', name: '이 위젯의 표 읽기'},
  {id: 'table:write', name: '이 위젯의 표 쓰기'},
  {id: 'tasks:read', name: '할 일 읽기'},
  {id: 'goals:read', name: '목표와 진행률 읽기'},
  {id: 'condition:read', name: '컨디션·수면 읽기'},
] as const;
export type Permission = typeof PERMISSIONS[number]['id'];

const Column = z.object({
  // Cells are stored under key; it defaults to the name, so authors can rename a column without losing data by keeping the key.
  key: z.string().trim().min(1).max(30).optional(),
  name: z.string().trim().min(1).max(30),
  type: z.enum(PROP_TYPES.map(t => t.id) as [PropType, ...PropType[]]).default('text'),
  options: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
});
export type Column = z.infer<typeof Column>;
export const colKey = (c: Column) => c.key ?? c.name;

const agg = z.enum(['sum', 'avg', 'last', 'count', 'max']).default('sum');
/** Built-in blocks. Columns are named by key (or name). */
export const Block = z.discriminatedUnion('block', [
  z.object({block: z.literal('text'), text: z.string().max(500)}),
  z.object({block: z.literal('form'), fields: z.array(z.string()).max(20).optional(), button: z.string().max(20).optional()}),
  z.object({block: z.literal('table')}),
  z.object({block: z.literal('list'), title: z.string(), check: z.string().optional()}),
  z.object({block: z.literal('chart'), x: z.string(), y: z.string(), kind: z.enum(['bar', 'line']).default('bar'), last: z.number().int().min(2).max(60).default(14)}),
  z.object({block: z.literal('gauge'), value: z.string(), target: z.number().positive(), agg, label: z.string().max(30).optional()}),
  z.object({block: z.literal('stat'), value: z.string(), agg, label: z.string().max(30).optional(), unit: z.string().max(10).optional()}),
]);
export type Block = z.infer<typeof Block>;
export const BLOCKS: {id: Block['block']; name: string; desc: string}[] = [
  {id: 'text', name: '글', desc: '설명이나 제목 한 줄'},
  {id: 'form', name: '입력 칸', desc: '열마다 칸을 두고 버튼으로 한 줄 추가'},
  {id: 'table', name: '표', desc: '줄을 보고 고치기'},
  {id: 'list', name: '체크리스트', desc: '한 열을 목록으로, 체크 열로 완료 표시'},
  {id: 'chart', name: '그래프', desc: '숫자 열을 막대·선으로'},
  {id: 'gauge', name: '계기판', desc: '합계·평균을 목표 대비 %로 (스킨의 진행률 모양)'},
  {id: 'stat', name: '숫자', desc: '합계·평균·마지막 값 하나'},
];

export const WidgetManifest = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'id는 영문 소문자·숫자·- (2~40자)'),
  name: z.string().trim().min(1).max(40),
  description: z.string().max(300).default(''),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  author: z.string().max(60).optional(),
  permissions: z.array(z.enum(PERMISSIONS.map(p => p.id) as [Permission, ...Permission[]])).max(10).default([]),
  // Rows: where the widget keeps its own data ("day": rows of the day shown, "all": every day together).
  data: z.object({columns: z.array(Column).max(20).default([]), scope: z.enum(['day', 'all']).default('all')}).default({}),
  view: z.array(Block).max(20).default([]),
  // Code widget: html + css + js run in a sandboxed frame (no network, no access to lit except the widget API).
  html: z.string().max(100_000).optional(),
  css: z.string().max(100_000).optional(),
  code: z.string().max(300_000).optional(),
  size: z.object({w: z.number().int().min(1).max(12), h: z.number().int().min(1).max(40)}).default({w: 6, h: 8}),
}).refine(m => m.view.length > 0 || !!m.code || !!m.html, {message: '블록(view)이나 코드(code/html) 중 하나는 있어야 해요.'});
export type WidgetManifest = z.infer<typeof WidgetManifest>;
export const isCode = (m: WidgetManifest) => !!(m.code || m.html);

/** A short fingerprint of the code: approval is tied to it, so changed code asks again. */
export function codeHash(m: Pick<WidgetManifest, 'code' | 'html' | 'css' | 'permissions'>): string {
  const s = `${m.permissions.join(',')}\u0000${m.html ?? ''}\u0000${m.css ?? ''}\u0000${m.code ?? ''}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return h1.toString(36) + h2.toString(36) + s.length.toString(36);
}

/** 내 라이브러리: saved widgets (a configured built-in), page templates, skins, and manifest widgets. */
export const LIBRARY_KINDS = ['widget', 'template', 'skin', 'custom', 'made'] as const;
export type LibraryKind = typeof LIBRARY_KINDS[number];
export const LibraryData = {
  widget: z.object({widget: Widget}),
  template: z.object({widgets: z.array(Widget).max(80), skin: Skin.optional()}),
  skin: z.object({skin: Skin}),
  custom: z.object({manifest: WidgetManifest}),
  // A made widget with its DBs and rules (pack.ts); console code needs the same approval as a code widget.
  made: z.object({pack: MadePack}),
} as const;
export type LibraryItem<K extends LibraryKind = LibraryKind> = {
  id: string; kind: K; name: string; data: z.infer<(typeof LibraryData)[K]>;
  enabled: boolean;
  // Code widgets run only when the user approved this exact code and permission set.
  approved: string | null;
  source: 'user' | 'claude' | 'developer';
  createdAt: string; updatedAt: string;
};
export const runnable = (item: LibraryItem<'custom'>) => item.enabled && (!isCode(item.data.manifest) || item.approved === codeHash(item.data.manifest));

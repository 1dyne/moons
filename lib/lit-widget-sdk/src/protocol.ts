// lit widget API: the only way a code widget talks to lit (docs/lit/WIDGET_PLATFORM.md §4).
// The widget runs in a sandboxed iframe (opaque origin, no network). It posts {lit:1,id,method,params};
// lit answers {lit:1,id,result|error} and pushes {lit:1,event,data}. Every method is checked against the
// permissions the user approved for this widget.

export const PROTOCOL_VERSION = 1;

export type WidgetPermission = 'table:read' | 'table:write' | 'tasks:read' | 'goals:read' | 'condition:read';

/** method → permission it needs (null = always allowed). */
export const METHODS = {
  'context': null,
  'table.rows': 'table:read',
  'table.add': 'table:write',
  'table.update': 'table:write',
  'table.remove': 'table:write',
  'tasks.today': 'tasks:read',
  'goals.list': 'goals:read',
  'condition.today': 'condition:read',
  // A made widget's own developer console (the user's code for their own widget): its own data and parts only.
  'made.data': null,
  'made.press': null,
  'made.add': null,
  'made.update': null,
} as const satisfies Record<string, WidgetPermission | null>;
export type Method = keyof typeof METHODS;

export type Cell = string | number | boolean | null;
export type Row = {id: string; day: string | null; name: string; cells: Record<string, Cell>; createdAt: string};
export type TaskView = {id: string; title: string; result: string; goalIds: string[]; estimateMin: number | null; props: Record<string, Cell>};
export type GoalView = {id: string; title: string; horizon: string; period: string; percent: number; parentId: string | null; deadline: string | null};
export type ConditionView = {day: string; score: number | null; sleepMinutes: number | null};
export type Theme = {bg: string; surface: string; ink: string; muted: string; accent: string; font: string; radius: number; dark: boolean};
export type Context = {day: string; today: string; widgetId: string; instanceId: string; theme: Theme; permissions: WidgetPermission[]; protocol: number};

export type Request = {lit: 1; id: number; method: Method; params?: Record<string, unknown>};
export type Response = {lit: 1; id: number; result?: unknown; error?: string};
export type Push = {lit: 1; event: 'change' | 'theme'; data?: unknown};
export const isRequest = (m: unknown): m is Request => !!m && typeof m === 'object' && (m as Request).lit === 1 && typeof (m as Request).id === 'number' && typeof (m as Request).method === 'string';
export const isResize = (m: unknown): m is {lit: 1; resize: number} => !!m && typeof m === 'object' && (m as {lit?: number}).lit === 1 && typeof (m as {resize?: unknown}).resize === 'number';

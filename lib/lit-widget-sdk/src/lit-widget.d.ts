// Types for widget authors. Reference this file (lit-widget create copies it next to your code) and the
// global `lit` is typed in your editor. No import needed: lit provides `lit` inside the widget frame.

type LitCell = string | number | boolean | null;
interface LitRow { id: string; day: string | null; name: string; cells: Record<string, LitCell>; createdAt: string }
interface LitTask { id: string; title: string; result: 'unknown' | 'in_progress' | 'done' | 'partial' | 'missed' | 'postponed' | 'cancelled'; goalIds: string[]; estimateMin: number | null; props: Record<string, LitCell> }
interface LitGoal { id: string; title: string; horizon: string; period: string; percent: number; parentId: string | null; deadline: string | null }
interface LitCondition { day: string; score: number | null; sleepMinutes: number | null }
interface LitTheme { bg: string; surface: string; ink: string; muted: string; accent: string; font: string; radius: number; dark: boolean }
interface LitContext { day: string; today: string; widgetId: string; instanceId: string; theme: LitTheme; permissions: string[]; protocol: number }

interface LitApi {
  /** Where and how the widget is shown: the day on screen, today, theme colours, granted permissions. */
  context(): Promise<LitContext>;
  /** This widget's own rows (needs table:read / table:write). Keys are your manifest column keys. */
  table: {
    rows(): Promise<LitRow[]>;
    add(cells: Record<string, LitCell>, name?: string): Promise<LitRow>;
    update(id: string, cells: Record<string, LitCell>, name?: string): Promise<LitRow>;
    remove(id: string): Promise<{removed: string}>;
  };
  /** The day's tasks (needs tasks:read). Fields the user marked private are never given. */
  tasks: { today(): Promise<LitTask[]> };
  /** Active goals with overall % (needs goals:read). */
  goals: { list(): Promise<LitGoal[]> };
  /** The day's condition and sleep (needs condition:read). */
  condition: { today(): Promise<LitCondition> };
  /** 'change': records changed (re-read). 'theme': skin changed (CSS variables update by themselves). */
  on(event: 'change' | 'theme', fn: (data?: unknown) => void): () => void;
}

declare const lit: LitApi;

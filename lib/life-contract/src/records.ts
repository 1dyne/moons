import {z} from 'zod';

// Life data contract v0 (docs/LIFE_DATA_CONTRACT_v0.md). The hub stores these; consumers read them.
export const CONTRACT_VERSION = '0';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({offset: true});
const text = (max: number) => z.string().trim().max(max);
const quantity = z.object({amount: z.number().finite().min(0), unit: text(24)});
// Date-only values never get an invented time: precision travels with the value.
const when = z.object({value: z.string().min(10).max(40), precision: z.enum(['day', 'minute'])});

export const GoalBody = z.object({
  title: text(200).min(1),
  horizon: z.enum(['year', 'quarter', 'month', 'week']),
  period: z.string().regex(/^\d{4}(-Q[1-4]|-\d{2}|-W\d{2})?$/),
  parentGoalId: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  criterion: text(500).nullable().default(null),
  target: quantity.extend({aggregation: z.enum(['count', 'sum', 'rate'])}).nullable().default(null),
  status: z.enum(['active', 'achieved', 'dropped', 'paused']).default('active'),
});
export const ProjectBody = z.object({
  title: text(200).min(1),
  status: z.enum(['active', 'done', 'paused', 'dropped']).default('active'),
  goalIds: z.array(z.string()).max(20).default([]),
});
// missed: the user reported not doing it. Different from unknown (no report) and cancelled (no longer planned).
export const Result = z.enum(['done', 'partial', 'in_progress', 'missed', 'postponed', 'cancelled', 'unknown']);
export const TaskBody = z.object({
  title: text(200).min(1),
  category: z.enum(['must', 'want', 'leisure']).nullable().default(null),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
  goalIds: z.array(z.string()).max(20).default([]),
  projectId: z.string().nullable().default(null),
  routineId: z.string().nullable().default(null),
  plan: z.object({
    state: z.enum(['planned', 'committed', 'dropped']).default('planned'),
    due: when.nullable().default(null),
    start: when.nullable().default(null),
    end: when.nullable().default(null),
    target: quantity.nullable().default(null),
  }).default({}),
  outcome: z.object({
    // Unknown is the default: a day passing never turns a task into "not done".
    result: Result.default('unknown'),
    actualStart: instant.nullable().default(null),
    actualEnd: instant.nullable().default(null),
    completedAt: instant.nullable().default(null),
    amount: z.number().finite().min(0).nullable().default(null),
    unit: text(24).nullable().default(null),
    reason: text(500).nullable().default(null),
    reportedAt: instant.nullable().default(null),
    basis: z.enum(['self_report', 'timer', 'import']).default('self_report'),
    postponedTo: z.string().nullable().default(null),
  }).default({}),
});
export const RoutineBody = z.object({
  title: text(200).min(1),
  recurrence: z.object({
    freq: z.enum(['daily', 'weekly', 'monthly']),
    byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
    byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
  }),
  // pick_daily: only routines picked for the day become that day's tasks, and only those count.
  mode: z.enum(['fixed_all', 'pick_daily']).default('pick_daily'),
  target: quantity.nullable().default(null),
  goalIds: z.array(z.string()).max(20).default([]),
  active: z.boolean().default(true),
});
export const SleepBody = z.object({
  start: instant.nullable().default(null),
  end: instant.nullable().default(null),
  naps: z.array(z.object({start: instant, end: instant})).max(10).default([]),
  quality: z.number().int().min(1).max(5).nullable().default(null),
});
export const ConditionBody = z.object({
  at: instant,
  energy: z.number().int().min(1).max(5).nullable().default(null),
  mood: text(60).nullable().default(null),
  tags: z.array(text(30)).max(10).default([]),
});
export const ReviewBody = z.object({
  horizon: z.enum(['day', 'week', 'month']),
  period: z.string().min(4).max(10),
  text: text(5000).nullable().default(null),
});

// A stretch of actual focus (time tracker or painted on the timetable). end null = running now.
export const SessionBody = z.object({
  taskId: z.string().nullable().default(null),
  label: text(200).min(1),
  start: instant,
  end: instant.nullable().default(null),
  source: z.enum(['timer', 'manual']).default('timer'),
}).refine(s => !s.end || s.end > s.start, {message: 'A session must end after it starts.'});

export const BODIES = {goal: GoalBody, project: ProjectBody, task: TaskBody, routine: RoutineBody, sleep: SleepBody, condition: ConditionBody, review: ReviewBody, session: SessionBody} as const;
export type Kind = keyof typeof BODIES;
export const KINDS = Object.keys(BODIES) as Kind[];
export type Bodies = {[K in Kind]: z.infer<(typeof BODIES)[K]>};
export type Goal = Bodies['goal']; export type Project = Bodies['project']; export type Task = Bodies['task'];
export type Routine = Bodies['routine']; export type Session = Bodies['session']; export type Sleep = Bodies['sleep']; export type Condition = Bodies['condition']; export type Review = Bodies['review'];

export type Source = {type: 'planner' | 'import:notion' | 'import:paper' | 'import:csv' | 'kit'; ref?: string; confirmed: boolean};
export type LifeRecord<K extends Kind = Kind> = {
  id: string; kind: K; revision: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
  logicalDay: string | null; tz: string;
  source: Source;
  // Fields the user marked private never leave the hub, whoever asks.
  privateFields?: string[];
  body: Bodies[K];
  ext?: Record<string, unknown>;
};
export type AnyRecord = {[K in Kind]: LifeRecord<K>}[Kind];

/** A write from the planner. The hub assigns id (when absent), revision and timestamps. */
export const WriteInput = z.object({
  kind: z.enum(KINDS as [Kind, ...Kind[]]),
  logicalDay: day.nullable().default(null),
  body: z.unknown(),
  ext: z.record(z.unknown()).optional(),
  privateFields: z.array(z.string().max(60)).max(20).optional(),
  // Optimistic check: the write is refused when the stored revision moved on.
  baseRevision: z.number().int().nonnegative().optional(),
  source: z.object({type: z.enum(['planner', 'import:notion', 'import:paper', 'import:csv', 'kit']), ref: z.string().max(200).optional(), confirmed: z.boolean()}).optional(),
});
export type WriteInput = z.infer<typeof WriteInput>;
export function parseBody<K extends Kind>(kind: K, body: unknown): Bodies[K] {
  return BODIES[kind].parse(body) as Bodies[K];
}

export const Settings = z.object({
  tz: z.string().min(1).max(64),
  dayBoundary: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type Settings = z.infer<typeof Settings>;

/** Who may read what. A consumer's grant; the planner itself reads everything. */
export type Scope = 'life.read.plan' | 'life.read.outcome' | 'life.read.condition' | 'life.read.review';
export const ALL_SCOPES: Scope[] = ['life.read.plan', 'life.read.outcome', 'life.read.condition', 'life.read.review'];

/** Drops what a grant does not cover: kinds out of scope, outcome without outcome scope, private fields always. */
export function shareable(record: AnyRecord, scopes: Scope[]): AnyRecord | null {
  const has = (s: Scope) => scopes.includes(s);
  const need: Record<Kind, Scope> = {goal: 'life.read.plan', project: 'life.read.plan', task: 'life.read.plan', routine: 'life.read.plan', sleep: 'life.read.condition', condition: 'life.read.condition', review: 'life.read.review', session: 'life.read.outcome'};
  if (!has(need[record.kind])) return null;
  const copy = structuredClone(record) as AnyRecord;
  delete copy.ext;
  const body = copy.body as Record<string, unknown>;
  for (const field of copy.privateFields ?? []) if (field in body) body[field] = null;
  delete copy.privateFields;
  // Without the outcome grant the outcome is withheld (null), never reported as "unknown".
  if (copy.kind === 'task' && !has('life.read.outcome')) (copy.body as Record<string, unknown>).outcome = null;
  return copy;
}

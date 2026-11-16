import {z} from 'zod';

// lit v2 data contract (docs/lit/V2_DESIGN.md §2). Six record kinds hold everything a user builds:
// property (one shared dictionary), database (a named tag with the properties its items usually have),
// item (one line; zero or more databases), lens (a saved filter), signal (a named condition) and rule.
// Everything is joined by id, never by name: users rename freely and nothing breaks.
// This file knows no template: no word here may name a particular use (see lit-core neutral.test.ts).

const recordId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const optionId = z.string().regex(/^[a-z0-9]{1,12}$/);
const name = z.string().trim().min(1).max(60);

export const PROPERTY_KINDS = ['title', 'text', 'longtext', 'number', 'rating', 'select', 'multi', 'checkbox', 'date', 'datetime', 'duration', 'relation', 'signal', 'formula'] as const;
export type PropertyKind = (typeof PROPERTY_KINDS)[number];
/** What lit itself understands about a property. Everything else about a property is the user's. */
export const ROLES = ['title', 'day', 'start', 'end', 'done', 'fixed'] as const;
export type Role = (typeof ROLES)[number];
/** Which kinds may carry a role. */
export const ROLE_KINDS: Record<Role, PropertyKind[]> = {title: ['title'], day: ['date'], start: ['datetime'], end: ['datetime'], done: ['select', 'checkbox'], fixed: ['checkbox']};
/** What a step of a done property means: finished, not yet, or not counted at all. */
export const MEANINGS = ['done', 'open', 'skip'] as const;
export type Meaning = (typeof MEANINGS)[number];

export const AGGREGATES = ['count', 'sum', 'avg', 'max', 'min', 'last', 'streak', 'days', 'doneRatio'] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export const CellValue = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(60)).max(50)]);
export type CellValue = z.infer<typeof CellValue>;

export const OPS = ['is', 'isNot', 'lt', 'lte', 'gt', 'gte', 'contains', 'empty', 'filled'] as const;
export type Op = (typeof OPS)[number];
/** A condition on one property, or on whatever property holds a role (then it matches across every database).
 * Values may be tokens: @today @yesterday @tomorrow @thisWeek @weekday · @done @open @skip · @none (no database). */
export const Cond = z.object({
  prop: recordId.optional(),
  role: z.enum(ROLES).optional(),
  // 'db': which databases the item has (value: a database id or @none).
  on: z.enum(['value', 'db', 'text']).default('value'),
  op: z.enum(OPS),
  value: CellValue.default(null),
});
export type Cond = z.infer<typeof Cond>;

export const Option = z.object({id: optionId, name, color: z.string().max(20).default(''), meaning: z.enum(MEANINGS).nullable().default(null)});
export type Option = z.infer<typeof Option>;

export const Formula = z.discriminatedUnion('op', [
  // a − b. Two times give minutes; two numbers give a number.
  z.object({op: z.literal('diff'), a: recordId, b: recordId}),
  // Gather the items joined by a relation and reduce one of their properties (doneRatio reads the done role).
  // back: the items whose relation `via` points at this item (the other side of the relation, never stored twice).
  z.object({op: z.literal('rollup'), via: recordId, back: z.boolean().default(false), of: recordId.nullable().default(null), agg: z.enum(AGGREGATES)}),
  // The value `of` had on the latest earlier item that shares this item's value of `match` (last time's weight).
  z.object({op: z.literal('latest'), of: recordId, match: recordId}),
  z.object({op: z.literal('ifThen'), when: z.array(Cond).max(8), then: CellValue, else: CellValue.default(null)}),
  // For developers who want to write it: numbers, + − × ÷, parentheses and {property id}.
  z.object({op: z.literal('expr'), expr: z.string().max(500)}),
]);
export type Formula = z.infer<typeof Formula>;

export const PropertyBody = z.object({
  name,
  kind: z.enum(PROPERTY_KINDS),
  role: z.enum(ROLES).nullable().default(null),
  desc: z.string().max(300).default(''),
  unit: z.string().max(12).default(''),
  options: z.array(Option).max(100).default([]),
  max: z.number().int().min(2).max(100).default(5),
  relation: z.object({db: recordId.nullable().default(null), many: z.boolean().default(true)}).nullable().default(null),
  formula: Formula.nullable().default(null),
}).refine(p => !p.role || ROLE_KINDS[p.role].includes(p.kind), {message: 'This kind cannot hold that role.'})
  .refine(p => p.kind !== 'formula' || !!p.formula, {message: 'A formula property needs a formula.'});
export type PropertyBody = z.infer<typeof PropertyBody>;

export const DatabaseBody = z.object({
  name,
  icon: z.string().max(24).default(''),
  desc: z.string().max(300).default(''),
  // The properties items of this database usually have (an item may have others too).
  properties: z.array(recordId).max(60).default([]),
  // Time between start and end counts as focus.
  focus: z.boolean().default(false),
  from: z.object({template: z.string().max(80), version: z.number().int().min(1)}).nullable().default(null),
});
export type DatabaseBody = z.infer<typeof DatabaseBody>;

export const ItemBody = z.object({
  dbs: z.array(recordId).max(10).default([]),
  // A line written before it had a title property (quick capture).
  text: z.string().max(4000).default(''),
  values: z.record(recordId, CellValue).default({}),
  order: z.number().finite().nullable().default(null),
  archived: z.boolean().default(false),
});
export type ItemBody = z.infer<typeof ItemBody>;

export const Source = z.object({lens: recordId.nullable().default(null), dbs: z.array(recordId).max(10).default([]), where: z.array(Cond).max(12).default([])});
export type Source = z.infer<typeof Source>;

export const LensBody = Source.extend({name, archived: z.boolean().default(false), sort: z.array(z.object({prop: recordId, dir: z.enum(['asc', 'desc'])})).max(3).default([])});
export type LensBody = z.infer<typeof LensBody>;

export const PERIODS = ['today', 'yesterday', 'week', 'last7', 'month', 'last30', 'all'] as const;
export const SignalBody = z.object({
  name,
  measure: Source.extend({of: recordId.nullable().default(null), agg: z.enum(AGGREGATES).default('count'), period: z.enum(PERIODS).default('today')}),
  op: z.enum(['lt', 'lte', 'gt', 'gte', 'is', 'isNot']),
  // A number, or another signal's measured value (planned time > time I have).
  compare: z.union([z.object({n: z.number().finite()}), z.object({signal: recordId})]),
});
export type SignalBody = z.infer<typeof SignalBody>;

export const ValueExpr = z.union([
  z.object({set: CellValue}),
  z.object({copy: recordId}),           // the same property of the item that started the rule
  z.object({now: z.literal(true)}),     // this moment (datetime)
  z.object({today: z.literal(true)}),   // this planner day (date)
  z.object({link: z.literal(true)}),    // a relation to the item that started the rule
]);
export type ValueExpr = z.infer<typeof ValueExpr>;
export const Action = z.discriminatedUnion('do', [
  z.object({do: z.literal('set'), values: z.record(recordId, ValueExpr)}),
  z.object({do: z.literal('create'), dbs: z.array(recordId).max(10), values: z.record(recordId, ValueExpr).default({})}),
  // dayStart: one new item per source item, once a day (repeating items). The new item is linked back through `link`.
  z.object({do: z.literal('createEach'), dbs: z.array(recordId).max(10), link: recordId, values: z.record(recordId, ValueExpr).default({})}),
  z.object({do: z.literal('archive')}),
  z.object({do: z.literal('notify'), text: z.string().trim().min(1).max(200)}),
  z.object({do: z.literal('effect'), name: z.string().regex(/^[a-z]{1,20}$/)}),
  // Show a form; saving it adds one item to `dbs`, linked to the item that started the rule through `link`.
  z.object({do: z.literal('openForm'), dbs: z.array(recordId).max(10), props: z.array(recordId).max(20), link: recordId.nullable().default(null), title: z.string().max(80).default('')}),
  z.object({do: z.literal('goTo'), page: z.string().max(40), carry: z.boolean().default(true)}),
]);
export type Action = z.infer<typeof Action>;
export const RuleBody = z.object({
  name: z.string().max(60).default(''),
  enabled: z.boolean().default(true),
  mode: z.enum(['auto', 'suggest']).default('auto'),
  // enter: an item comes to match the source · change: an item in the source is added or changed ·
  // signal: a signal becomes true · dayStart: a new planner day opens · time: a clock time.
  on: z.object({kind: z.enum(['enter', 'change', 'signal', 'dayStart', 'time']), signal: recordId.nullable().default(null), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('22:00')}),
  source: Source.default({}),
  if: z.array(Cond).max(8).default([]),
  do: z.array(Action).min(1).max(8),
});
export type RuleBody = z.infer<typeof RuleBody>;

export const V2_BODIES = {property: PropertyBody, database: DatabaseBody, item: ItemBody, lens: LensBody, signal: SignalBody, rule: RuleBody} as const;
export type V2Kind = keyof typeof V2_BODIES;
export const V2_KINDS = Object.keys(V2_BODIES) as V2Kind[];
export const isV2Kind = (k: string): k is V2Kind => (V2_KINDS as string[]).includes(k);

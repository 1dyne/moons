import {z} from 'zod';

// PlannerSpec (docs/PLANNER_SPEC_v1.md §4.1): what the planner looks like. Data lives in the life hub;
// changing a spec never moves or rewrites records.
export const CHIP_COLORS = {sky: '#8aaaf8', blue: '#3a66b8', beige: '#efe2d6', teal: '#00838f', green: '#2f9585', mint: '#3f9a8a', yellow: '#fbe4b0', red: '#b05a57'} as const;
export type ChipColor = keyof typeof CHIP_COLORS;

export const MODULE_TYPES = ['tasks', 'timer', 'routine', 'goals', 'condition', 'sleep', 'review', 'timeblock', 'projects', 'metric', 'memo'] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];
/** Modules the renderer draws today. The rest are accepted in a spec but shown as "coming soon". */
export const RENDERED: ModuleType[] = ['tasks', 'timer', 'routine', 'goals', 'condition', 'sleep', 'review'];

const Field = z.object({
  fieldId: z.string().regex(/^[a-z][a-zA-Z0-9_.]{0,60}$/),
  label: z.string().trim().min(1).max(40),
  // The meaning a consumer reads, e.g. 'outcome.completedAt'. Renaming the label never changes it.
  semantic: z.string().max(60).optional(),
  hidden: z.boolean().optional(),
  private: z.boolean().optional(),
});
const Module = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
  type: z.enum(MODULE_TYPES),
  label: z.string().trim().min(1).max(40),
  period: z.enum(['day', 'week', 'month', 'year']).default('day'),
  order: z.number().int().min(0).max(99),
  view: z.enum(['list', 'checklist', 'timeline', 'calendar', 'kanban', 'grid', 'meter']).default('list'),
  options: z.record(z.unknown()).default({}),
  fields: z.array(Field).max(30).default([]),
});
const Rule = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('day_boundary'), at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)}),
  z.object({kind: z.literal('achievement_basis'), moduleId: z.string(), basis: z.enum(['all_defined', 'committed_today'])}),
  z.object({kind: z.literal('carry_over'), moduleId: z.string(), mode: z.enum(['ask', 'auto', 'never'])}),
]);
export const PlannerSpec = z.object({
  specVersion: z.literal(1),
  name: z.string().trim().min(1).max(40),
  theme: z.object({accent: z.enum(Object.keys(CHIP_COLORS) as [ChipColor, ...ChipColor[]]), density: z.enum(['comfortable', 'compact']).default('comfortable')}),
  entry: z.literal('day'),
  periods: z.array(z.enum(['day', 'week', 'month', 'year'])).min(1),
  modules: z.array(Module).min(1).max(20),
  dashboards: z.array(z.object({id: z.string(), kind: z.enum(['goal', 'project', 'period']), widgets: z.array(z.enum(['progress', 'linked_items', 'streak', 'trend', 'history']))})).max(10).default([]),
  rules: z.array(Rule).max(20).default([]),
  source: z.object({kind: z.enum(['chat', 'paper', 'notion', 'template']), ref: z.string().max(80).optional()}).optional(),
}).superRefine((spec, ctx) => {
  const ids = spec.modules.map(m => m.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({code: 'custom', message: 'Module ids must be unique.'});
  for (const r of spec.rules) if ('moduleId' in r && !ids.includes(r.moduleId)) ctx.addIssue({code: 'custom', message: `Rule points to a missing module: ${r.moduleId}`});
});
export type PlannerSpec = z.infer<typeof PlannerSpec>;
export type ModuleSpec = PlannerSpec['modules'][number];

export const modulesFor = (spec: PlannerSpec, period: ModuleSpec['period']) => spec.modules.filter(m => m.period === period).sort((a, b) => a.order - b.order);
export const uses = (spec: PlannerSpec, type: ModuleType) => spec.modules.some(m => m.type === type);
export const dayBoundary = (spec: PlannerSpec) => spec.rules.find((r): r is Extract<typeof r, {kind: 'day_boundary'}> => r.kind === 'day_boundary')?.at ?? '04:00';

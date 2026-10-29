// Which models MOONS can call, what they cost, and which step of the work each AI task belongs to.
// Prices are USD per 1M tokens (input / output), checked 2026-10-24; a model typed in by the operator has no price.
export type Provider = 'openai' | 'anthropic' | 'gemini';
export type ModelInfo = {id: string; provider: Provider; label: string; input: number | null; output: number | null};

export const MODELS: ModelInfo[] = [
  {id: 'gpt-5.4-nano', provider: 'openai', label: 'GPT-5.4 nano', input: 0.20, output: 1.25},
  {id: 'gpt-5.4-mini', provider: 'openai', label: 'GPT-5.4 mini', input: 0.75, output: 4.50},
  {id: 'gpt-5.4', provider: 'openai', label: 'GPT-5.4', input: 2.50, output: 15.00},
  {id: 'claude-haiku-5-5', provider: 'anthropic', label: 'Claude Haiku 5.5', input: 0.10, output: 0.50},
  {id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', input: 2.00, output: 10.00},
  {id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', input: 4.00, output: 20.00},
  {id: 'claude-fable-5-1', provider: 'anthropic', label: 'Claude Fable 5.1', input: 10.00, output: 50.00},
  {id: 'gemini-2.5-flash-lite', provider: 'gemini', label: 'Gemini 2.5 Flash-Lite', input: 0.10, output: 0.40},
  {id: 'gemini-2.5-flash', provider: 'gemini', label: 'Gemini 2.5 Flash', input: 0.30, output: 2.50},
  {id: 'gemini-2.5-pro', provider: 'gemini', label: 'Gemini 2.5 Pro', input: 1.25, output: 10.00},
  {id: 'gemini-3-flash-preview', provider: 'gemini', label: 'Gemini 3 Flash', input: 0.50, output: 3.00},
  {id: 'gemini-3.1-pro-preview', provider: 'gemini', label: 'Gemini 3.1 Pro', input: 2.00, output: 12.00},
];

/** Steps the operator can point at different models. Structuring v3 adds its stages here. */
export const STEPS = [
  {id: 'projects', tasks: ['moons_project_match', 'moons_project_review', 'moons_project_discussion']},
  {id: 'structure', tasks: ['moons_structure', 'moons_outline']},
  {id: 'claims', tasks: ['moons_claims_extract']},
  {id: 'relations', tasks: ['moons_claims_relate']},
  {id: 'dump', tasks: ['moons_dump_claims', 'moons_dump_assess']},
  {id: 'next', tasks: ['moons_next_explore']},
  {id: 'question', tasks: ['moons_question_ai']},
  {id: 'chat_note', tasks: ['moons_chat_note']},
  {id: 'explore_map', tasks: ['moons_explore_map']},
  {id: 'satellite_digest', tasks: ['moons_satellite_digest']},
  {id: 'compare', tasks: ['moons_comparison_v5', 'moons_structure_comparison']},
  {id: 'concepts', tasks: ['moons_concepts_extract', 'moons_concept_page']},
  {id: 'emotions', tasks: ['moons_emotions']},
  {id: 'chat', tasks: ['moons_chat_v5', 'moons_personal_chat']},
  {id: 'form', tasks: ['moons_form_from_photo']},
  {id: 'impostor', tasks: ['moons_impostor', 'moons_impostor_safety']},
] as const;
export type Step = typeof STEPS[number]['id'] | 'other';
export const stepOf = (task: string): Step => STEPS.find(s => (s.tasks as readonly string[]).includes(task))?.id ?? 'other';

/** A typed-in model is written "provider:model-id" so it can be routed. */
export function resolveModel(id: string): ModelInfo | null {
  const known = MODELS.find(m => m.id === id);
  if (known) return known;
  const m = /^(openai|anthropic|gemini):([A-Za-z0-9._-]{2,80})$/.exec(id);
  return m ? {id: m[2]!, provider: m[1] as Provider, label: m[2]!, input: null, output: null} : null;
}

/** Without a choice, MOONS runs on OpenAI as before (env can still override). */
export const defaultModel = (tier: 'fast' | 'deep') =>
  tier === 'deep' ? (process.env.OPENAI_MODEL_DEEP || 'gpt-5.4') : (process.env.OPENAI_MODEL || 'gpt-5.4-mini');

export const providerReady = (p: Provider) =>
  p === 'openai' ? !!process.env.OPENAI_API_KEY : p === 'anthropic' ? !!process.env.ANTHROPIC_API_KEY : !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

/** Estimated cost. Cached input is priced at a tenth of the input rate, roughly what all three providers charge. */
export function costUsd(model: ModelInfo, usage: {input: number; output: number; cached?: number}) {
  if (model.input === null || model.output === null) return null;
  const cached = Math.min(usage.cached ?? 0, usage.input);
  return ((usage.input - cached) * model.input + cached * model.input * 0.1 + usage.output * model.output) / 1e6;
}

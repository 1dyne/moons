import {openai, openaiEmbedder} from './openai.ts';
import {anthropicJson, anthropicText} from './anthropic.ts';
import {geminiJson, geminiText} from './gemini.ts';
import {AIError, type Embedder, type JsonTask, type MoonsAI, type TextTask, type Usage} from './provider.ts';
import {costUsd, defaultModel, providerReady, resolveModel, stepOf, type ModelInfo} from './catalog.ts';
import {aiScope} from '../v5/ai-access.ts';
import {q} from '../db.ts';

/** The model for a task: the operator's choice for its step when that provider has a key, else the OpenAI default. */
export function modelFor(task: string, tier: 'fast' | 'deep'): ModelInfo {
  const chosen = aiScope.getStore()?.models?.[stepOf(task)];
  const picked = chosen ? resolveModel(chosen) : null;
  if (picked && providerReady(picked.provider)) return picked;
  const id = defaultModel(tier);
  return resolveModel(id) ?? {id, provider: 'openai', label: id, input: null, output: null};
}

/** Every AI call leaves one row: which step, which model, tokens, estimated cost, time. Logging never fails the call. */
async function record(task: string, model: ModelInfo, started: number, usage: Usage | undefined, ok: boolean) {
  const u = usage ?? {input: 0, output: 0, cached: 0};
  const hook = aiScope.getStore()?.onUsage;
  if (hook) { hook({task, model: `${model.provider}:${model.id}`, input: u.input, output: u.output, cost: costUsd(model, u), ok}); return; }
  try {
    await q(`insert into ai_calls(owner_id,step,task,provider,model,input_tokens,output_tokens,cached_tokens,cost_usd,ms,ok,project_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [aiScope.getStore()?.owner ?? null, stepOf(task), task, model.provider, model.id, u.input, u.output, u.cached, costUsd(model, u), Date.now() - started, ok, aiScope.getStore()?.project ?? null]);
  } catch { /* the table exists once the workspace is initialised; event mode may run without it */ }
}

async function timed<R extends {usage?: Usage}>(task: string, model: ModelInfo, work: () => Promise<R>): Promise<R> {
  const started = Date.now();
  try { const result = await work(); void record(task, model, started, result.usage, true); return result; }
  catch (error) { void record(task, model, started, undefined, false); throw error; }
}

const router: MoonsAI = {
  name: 'router',
  json<T>(task: JsonTask) {
    const model = modelFor(task.name, task.tier), routed = {...task, model: model.id};
    return timed(task.name, model, () => model.provider === 'anthropic' ? anthropicJson<T>(routed) : model.provider === 'gemini' ? geminiJson<T>(routed) : openai.json<T>(routed));
  },
  text(task: TextTask) {
    const name = task.name ?? 'moons_text', model = modelFor(name, task.tier), routed = {...task, model: model.id};
    return timed(name, model, () => model.provider === 'anthropic' ? anthropicText(routed) : model.provider === 'gemini' ? geminiText(routed) : openai.text(routed));
  },
  transcribe: (...args) => openai.transcribe(...args),
  moderate: text => openai.moderate(text),
};

export function ai(): MoonsAI { return router; }
export function embedder(): Embedder { return openaiEmbedder; }
export {AIError};

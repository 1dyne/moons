import {AIError, type JsonTask, type TextTask, type Usage} from './provider.ts';
import {portableSchema} from './schema.ts';

const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'; // override only for local tests
type Part = {text?: string; thought?: boolean; inlineData?: {mimeType: string; data: string}};
type Body = {candidates?: {content?: {parts?: Part[]}; finishReason?: string}[];
  usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number};
  error?: {message?: string}};

async function generate(model: string, body: Record<string, unknown>, timeoutMs: number): Promise<Body> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new AIError('GEMINI_API_KEY is not set', 'AI_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: controller.signal, headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, body: JSON.stringify(body)});
    const json = await res.json().catch(() => ({})) as Body;
    if (res.status === 429) throw new AIError('Gemini rate limit', 'RATE_LIMITED');
    if (!res.ok) throw Object.assign(new AIError(`Gemini ${res.status}: ${(json.error?.message ?? '').slice(0, 300)}`, 'AI_FAILED'), {status: res.status});
    return json;
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(`Gemini failed: ${(error as Error).message}`, 'AI_FAILED');
  } finally { clearTimeout(timer); }
}

function read(body: Body): {text: string; usage: Usage} {
  const c = body.candidates?.[0];
  if (c?.finishReason === 'MAX_TOKENS') throw new AIError('Gemini response hit the token limit', 'PARSE_FAILED');
  const text = (c?.content?.parts ?? []).filter(p => !p.thought && p.text).map(p => p.text).join('').trim();
  if (!text) throw new AIError(`Empty response from Gemini (${c?.finishReason ?? 'no candidate'})`, 'PARSE_FAILED');
  const u = body.usageMetadata ?? {};
  return {text, usage: {input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cached: u.cachedContentTokenCount ?? 0}};
}

export async function geminiJson<T>(task: JsonTask & {model: string}) {
  const parts: Part[] = [...(task.images ?? []).map(i => ({inlineData: {mimeType: i.mime, data: i.base64}})), {text: task.user}];
  const request = (withSchema: boolean) => ({
    systemInstruction: {parts: [{text: withSchema ? task.system : `${task.system}\n\nReply with JSON only, matching this JSON Schema:\n${JSON.stringify(task.schema)}`}]},
    contents: [{role: 'user', parts}],
    generationConfig: {responseMimeType: 'application/json', ...(withSchema ? {responseJsonSchema: portableSchema(task.schema)} : {})},
  });
  const timeout = (task.tier === 'deep' ? 120000 : 90000) + Math.min(120000, task.user.length * 4);
  let body: Body;
  // A model that rejects the schema form still gets it, written into the instructions.
  try { body = await generate(task.model, request(true), timeout); }
  catch (error) { if ((error as {status?: number}).status !== 400) throw error; body = await generate(task.model, request(false), timeout); }
  const {text, usage} = read(body);
  try { return {data: JSON.parse(text) as T, model: task.model, usage}; }
  catch { throw new AIError('Gemini returned invalid JSON', 'PARSE_FAILED'); }
}

export async function geminiText(task: TextTask & {model: string}) {
  const body = await generate(task.model, {
    systemInstruction: {parts: [{text: task.system}]},
    contents: task.messages.map(m => ({role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}]})),
  }, 90000);
  const {text, usage} = read(body);
  return {text, model: task.model, usage};
}

import {AIError, type Embedder, type JsonTask, type MoonsAI, type Usage} from './provider.ts';
import {aiScope} from '../v5/ai-access.ts';
import {defaultModel} from './catalog.ts';

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'; // override only for local tests
const HANGUL = /[\uAC00-\uD7A3]/;
// Lines speech models invent on near-silence. Treated as nothing heard.
// No prompt is sent by default: on quiet audio the model reads the prompt back as if it were heard.
const PHANTOM = /시청해\s*주셔서\s*감사합니다|구독과\s*좋아요|자막\s*(제공|by)|MBC\s*뉴스|thanks?\s+for\s+watching/i;

function key() {
  // A user's own key (set per request in aiScope) takes precedence over the operator key.
  const k = aiScope.getStore()?.apiKey || process.env.OPENAI_API_KEY;
  if (!k) throw new AIError('OPENAI_API_KEY is not set', 'AI_UNAVAILABLE');
  return k;
}

async function call(path: string, init: RequestInit, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {...init, signal: controller.signal, headers: {Authorization: `Bearer ${key()}`, ...(init.headers ?? {})}});
    if (res.status === 429) throw new AIError('OpenAI rate limit', 'RATE_LIMITED');
    if (!res.ok) throw new AIError(`OpenAI ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`, 'AI_FAILED');
    return res;
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(`OpenAI ${path} failed: ${(error as Error).message}`, 'AI_FAILED');
  } finally { clearTimeout(timer); }
}

// The model read the prompt back instead of hearing speech.
function echoes(text: string, hint: string) {
  const squash = (s: string) => s.replace(/[\s.,!?]/g, '');
  const t = squash(text), h = squash(hint);
  return t.length >= 6 && (h.includes(t) || t.includes(h.slice(0, 12)));
}

type Body = {choices?: {message?: {content?: string; refusal?: string}}[]; usage?: {prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: {cached_tokens?: number}}};
const usageOf = (b: Body): Usage => ({input: b.usage?.prompt_tokens ?? 0, output: b.usage?.completion_tokens ?? 0, cached: b.usage?.prompt_tokens_details?.cached_tokens ?? 0});

export const openai: MoonsAI = {
  name: 'openai',
  async json<T>(task: JsonTask) {
    const model = task.model ?? defaultModel(task.tier);
    const res = await call('/chat/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model,
        reasoning_effort: task.tier === 'deep' ? (process.env.OPENAI_DEEP_EFFORT || 'low') : 'low',
        messages: [{role: 'system', content: task.system}, {role: 'user', content: task.images?.length
          ? [{type: 'text', text: task.user}, ...task.images.map(i => ({type: 'image_url', image_url: {url: `data:${i.mime};base64,${i.base64}`}}))]
          : task.user}],
        response_format: {type: 'json_schema', json_schema: {name: task.name, strict: true, schema: task.schema}},
      }),
    }, (task.tier === 'deep' ? 90000 : 60000) + Math.min(120000, task.user.length * 4)); // long originals need longer
    const body = await res.json() as Body;
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AIError(`Empty response (${body.choices?.[0]?.message?.refusal ?? 'no content'})`, 'PARSE_FAILED');
    try { return {data: JSON.parse(content) as T, model, usage: usageOf(body)}; }
    catch { throw new AIError('Model returned invalid JSON', 'PARSE_FAILED'); }
  },
  async text(task) {
    const model = task.model ?? defaultModel(task.tier);
    const res = await call('/chat/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model, reasoning_effort: 'low', messages: [{role: 'system', content: task.system}, ...task.messages]}),
    }, 90000);
    const body = await res.json() as Body;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new AIError(`Empty response (${body.choices?.[0]?.message?.refusal ?? 'no content'})`, 'PARSE_FAILED');
    return {text: content, model, usage: usageOf(body)};
  },
  async transcribe(audio, filename, opts = {}) {
    const language = opts.language === undefined ? 'ko' : opts.language;
    const once = async (model: string) => {
      const form = new FormData();
      form.append('file', audio, filename);
      form.append('model', model);
      if (language) form.append('language', language);
      if (opts.hint) form.append('prompt', opts.hint);
      form.append('temperature', '0');
      const res = await call('/audio/transcriptions', {method: 'POST', body: form}, 60000);
      const text = ((await res.json() as {text?: string}).text ?? '').trim();
      if (PHANTOM.test(text) && text.length < 40) return '';
      if (opts.hint && echoes(text, opts.hint)) return '';
      return text;
    };
    const primary = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
    const text = await once(primary);
    // Nothing heard stays nothing: asking Whisper again on silence only invents lines.
    if (!text || !language || HANGUL.test(text) || primary === 'whisper-1') return text;
    // Korean speech sometimes comes back as a short English line. Ask Whisper once more and keep Korean if it hears it.
    try { const again = await once('whisper-1'); if (HANGUL.test(again)) return again; } catch {}
    return text;
  },
  async moderate(text) {
    try {
      const res = await call('/moderations', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model: 'omni-moderation-latest', input: text})}, 15000);
      // "flagged" alone is too eager for casual Korean ("AI랑 싸움"); hold only clear cases.
      const body = await res.json() as {results?: {category_scores?: Record<string, number>}[]};
      const scores = body.results?.[0]?.category_scores ?? {};
      const strict = ['sexual/minors', 'hate/threatening', 'harassment/threatening', 'self-harm/instructions', 'violence/graphic', 'illicit/violent'];
      return Object.entries(scores).some(([k, v]) => strict.includes(k) ? v > 0.5 : v > 0.85);
    } catch { return false; } // moderation outage should not block input; admins can still hide
  },
};

export const openaiEmbedder: Embedder = {
  model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  async embed(texts) {
    if (!texts.length) return [];
    const res = await call('/embeddings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model: this.model, input: texts})}, 30000);
    const body = await res.json() as {data: {index: number; embedding: number[]}[]};
    return body.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  },
};

// Timestamped originals use Whisper's segment response, not invented times.
export async function transcribeTimed(audio:Blob,filename:string) {
  const form=new FormData();form.set('file',audio,filename);form.set('model','whisper-1');form.set('response_format','verbose_json');
  const res=await call('/audio/transcriptions',{method:'POST',body:form},180000);
  const body=await res.json() as {text?:string;duration?:number;segments?:{start:number;end:number;text:string}[]};
  if(!body.text?.trim()||PHANTOM.test(body.text))throw new AIError('No speech recognized.','AI_FAILED');
  return {text:body.text,segments:body.segments??[],duration:body.duration??0};
}

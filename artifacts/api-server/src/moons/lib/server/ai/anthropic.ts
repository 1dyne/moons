import Anthropic from '@anthropic-ai/sdk';
import {AIError, type JsonTask, type TextTask, type Usage} from './provider.ts';
import {portableSchema} from './schema.ts';

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AIError('ANTHROPIC_API_KEY is not set', 'AI_UNAVAILABLE');
  return client ??= new Anthropic();
}

// Streaming keeps long structured outputs clear of HTTP timeouts.
async function run(params: Anthropic.MessageStreamParams) {
  try { return await anthropic().messages.stream(params).finalMessage(); }
  catch (error) {
    if (error instanceof AIError) throw error;
    if (error instanceof Anthropic.RateLimitError) throw new AIError('Anthropic rate limit', 'RATE_LIMITED');
    if (error instanceof Anthropic.APIError) throw new AIError(`Anthropic ${error.status}: ${error.message.slice(0, 300)}`, 'AI_FAILED');
    throw new AIError(`Anthropic failed: ${(error as Error).message}`, 'AI_FAILED');
  }
}

function read(message: Anthropic.Message): {text: string; usage: Usage} {
  if (message.stop_reason === 'refusal') throw new AIError(`Anthropic declined (${message.stop_details?.category ?? 'no category'})`, 'PARSE_FAILED');
  if (message.stop_reason === 'max_tokens') throw new AIError('Anthropic response hit max_tokens', 'PARSE_FAILED');
  const text = message.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('').trim();
  if (!text) throw new AIError('Empty response from Anthropic', 'PARSE_FAILED');
  const u = message.usage;
  const cached = u.cache_read_input_tokens ?? 0;
  return {text, usage: {input: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + cached, output: u.output_tokens, cached}};
}

export async function anthropicJson<T>(task: JsonTask & {model: string}) {
  const content: Anthropic.ContentBlockParam[] = [
    ...(task.images ?? []).map(i => ({type: 'image' as const, source: {type: 'base64' as const, media_type: i.mime as 'image/jpeg', data: i.base64}})),
    {type: 'text', text: task.user},
  ];
  const message = await run({
    model: task.model, max_tokens: 32000, system: task.system, messages: [{role: 'user', content}],
    output_config: {format: {type: 'json_schema', schema: portableSchema(task.schema) as Record<string, unknown>}, effort: task.tier === 'deep' ? 'high' : 'medium'},
  });
  const {text, usage} = read(message);
  try { return {data: JSON.parse(text) as T, model: task.model, usage}; }
  catch { throw new AIError('Anthropic returned invalid JSON', 'PARSE_FAILED'); }
}

export async function anthropicText(task: TextTask & {model: string}) {
  const message = await run({model: task.model, max_tokens: 8000, system: task.system, messages: task.messages, output_config: {effort: 'medium'}});
  const {text, usage} = read(message);
  return {text, model: task.model, usage};
}

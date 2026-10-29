import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type {AddressInfo} from 'node:net';

// One local server stands in for OpenAI, Anthropic and Gemini; each answers in its own wire format.
const seen: {path: string; body: Record<string, unknown>}[] = [];
const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    seen.push({path: req.url ?? '', body});
    if (req.url?.startsWith('/openai/chat/completions')) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({choices: [{message: {content: '{"ok":"openai"}'}}], usage: {prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: {cached_tokens: 40}}}));
    }
    if (req.url?.startsWith('/gemini/models/')) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({candidates: [{content: {parts: [{text: 'thinking', thought: true}, {text: '{"ok":"gemini"}'}]}, finishReason: 'STOP'}],
        usageMetadata: {promptTokenCount: 80, candidatesTokenCount: 10, thoughtsTokenCount: 5}}));
    }
    if (req.url?.startsWith('/v1/messages')) {
      res.setHeader('content-type', 'text/event-stream');
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', {type: 'message_start', message: {id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null,
        usage: {input_tokens: 60, output_tokens: 1, cache_read_input_tokens: 30, cache_creation_input_tokens: 0}}});
      send('content_block_start', {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}});
      send('content_block_delta', {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: '{"ok":"anthropic"}'}});
      send('content_block_stop', {type: 'content_block_stop', index: 0});
      send('message_delta', {type: 'message_delta', delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 12}});
      send('message_stop', {type: 'message_stop'});
      return res.end();
    }
    res.statusCode = 404; return res.end('{}');
  });
});

test('each step goes to the provider of the model chosen for it, and reports its tokens', async () => {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originalFetch = globalThis.fetch;
  let transportError: unknown;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, base, 'Provider tests must never contact external services');
    return originalFetch(input, init).catch(error => {transportError = error; throw error;});
  };
  Object.assign(process.env, {OPENAI_API_KEY: 'test', OPENAI_BASE_URL: `${base}/openai`, ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: base,
    GEMINI_API_KEY: 'test', GEMINI_BASE_URL: `${base}/gemini`});
  const {ai, modelFor} = await import('../lib/server/ai/index.ts');
  const {aiScope} = await import('../lib/server/v5/ai-access.ts');
  const schema = {type: 'object', additionalProperties: false, required: ['ok', 'note'], properties: {ok: {type: 'string'}, note: {type: ['string', 'null']}}};
  const task = (name: string) => ({name, system: 'sys', user: 'hi', schema, tier: 'fast' as const});
  try {
    const models = {structure: 'claude-opus-5-5', compare: 'gemini-2.5-flash', chat: 'anthropic:claude-made-up-1'};
    await aiScope.run({models}, async () => {
      const a = await ai().json<{ok: string}>(task('moons_outline'));
      assert.deepEqual([a.data.ok, a.model, a.usage], ['anthropic', 'claude-opus-5-5', {input: 90, output: 12, cached: 30}]);
      const g = await ai().json<{ok: string}>(task('moons_structure_comparison'));
      assert.deepEqual([g.data.ok, g.model, g.usage], ['gemini', 'gemini-2.5-flash', {input: 80, output: 15, cached: 0}]);
      const o = await ai().json<{ok: string}>(task('moons_emotions')); // no choice for this step: the OpenAI default
      assert.deepEqual([o.data.ok, o.model, o.usage], ['openai', 'gpt-5.4-mini', {input: 100, output: 20, cached: 40}]);
      assert.equal(modelFor('moons_chat_v5', 'fast').id, 'claude-made-up-1'); // a typed-in model routes by its provider prefix
    });
    const toAnthropic = seen.find(s => s.path.startsWith('/v1/messages'))!.body as {output_config: {format: {schema: {properties: {note: unknown}}}}};
    assert.deepEqual(toAnthropic.output_config.format.schema.properties.note, {anyOf: [{type: 'string'}, {type: 'null'}]}); // nullable rewritten for Claude
    // A provider without a key falls back to the default instead of failing.
    delete process.env.GEMINI_API_KEY;
    await aiScope.run({models: {compare: 'gemini-2.5-pro'}}, async () => assert.equal(modelFor('moons_comparison_v5', 'fast').id, 'gpt-5.4-mini'));
  } catch (error) { throw new Error(String(error), {cause: transportError ?? error}); }
  finally { globalThis.fetch = originalFetch; server.close(); }
});

test('cost counts cached input at a tenth, and a typed-in model has no price', async () => {
  const {costUsd, resolveModel} = await import('../lib/server/ai/catalog.ts');
  assert.equal(costUsd(resolveModel('gpt-5.4')!, {input: 1_000_000, output: 0, cached: 1_000_000}), 0.25);
  assert.equal(costUsd(resolveModel('claude-opus-5-5')!, {input: 1_000_000, output: 1_000_000}), 24);
  assert.equal(costUsd(resolveModel('gemini:gemini-9')!, {input: 10, output: 10}), null);
  assert.equal(resolveModel('nonsense'), null);
});

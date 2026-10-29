// Provider seam. ai() routes each task to OpenAI, Anthropic or Gemini (ai/index.ts) by the model chosen for its step.
// Embeddings and speech stay on OpenAI so stored vectors remain comparable.
export type Usage = {input: number; output: number; cached: number}; // tokens; output includes reasoning
export type JsonTask = {
  name: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  tier: 'fast' | 'deep';
  model?: string; // set by the router; a provider falls back to its own default without it
  // Optional images (e.g. a photographed paper page) sent alongside the user text.
  images?: {mime: string; base64: string}[];
};

export interface MoonsAI {
  name: string;
  json<T>(task: JsonTask): Promise<{data: T; model: string; usage?: Usage}>;
  // Free-text reply for conversations (personal MOONS chat).
  text(task: TextTask): Promise<{text: string; model: string; usage?: Usage}>;
  // language null = detect; hint = context words for the speech model.
  transcribe(audio: Blob, filename: string, opts?: {language?: string | null; hint?: string}): Promise<string>;
  moderate(text: string): Promise<boolean>; // true = should be held back
}

export type TextTask = {name?: string; system: string; messages: {role: 'user' | 'assistant'; content: string}[]; tier: 'fast' | 'deep'; model?: string};

export interface Embedder {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export type AIErrorCode = 'AI_UNAVAILABLE' | 'AI_FAILED' | 'PARSE_FAILED' | 'RATE_LIMITED';
export class AIError extends Error {
  code: AIErrorCode;
  constructor(message: string, code: AIErrorCode) { super(message); this.code = code; }
}

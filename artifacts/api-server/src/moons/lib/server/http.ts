import {AIError} from './ai/index.ts';
import {logger} from '../../../lib/logger';

export function fail(status: number, code: string, message: string) {
  return Response.json({error: {code, message}}, {status});
}

export function fromError(error: unknown) {
  if (error instanceof AIError) {
    const status = error.code === 'RATE_LIMITED' ? 429 : error.code === 'AI_UNAVAILABLE' ? 503 : 502;
    return fail(status, error.code, 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  logger.error({message: (error as Error).message}, 'MOONS route error');
  return fail(500, 'SERVER_ERROR', '서버에서 문제가 생겼어요.');
}

// In-memory sliding window. Enough for a single long-running server on event day.
const hits = new Map<string, number[]>();
export function limited(key: string, max: number, windowMs = 60000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  return false;
}

export function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}

export function isAdmin(request: Request) {
  const token = process.env.ADMIN_TOKEN;
  return !!token && request.headers.get('x-admin-token') === token;
}

export const participantOk = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);

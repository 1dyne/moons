
export const SPACE_ID = import.meta.env.VITE_EVENT_SPACE_ID || 'hackathon-1014';

export function participantId() {
  try {
    let id = localStorage.getItem('moons.participant');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('moons.participant', id); }
    return id;
  } catch { return 'anon-' + Math.random().toString(36).slice(2, 12); }
}

export class ApiError extends Error {
  code: string; status: number;
  constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status; }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {cache: 'no-store', ...init});
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error?.message ?? '연결이 불안정해요. 다시 시도해 주세요.', body?.error?.code ?? 'NETWORK', res.status);
  return body as T;
}

export const postJson = (body: unknown): RequestInit => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false});
}

// Small deterministic hash for stable layouts.
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

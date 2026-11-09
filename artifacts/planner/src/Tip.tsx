import {useSyncExternalStore} from 'react';

// How-to notes ("체크 칸을 누를 때마다 …") the user can close once read.
// Closed notes are remembered on this device; 설정 → "닫은 안내 다시 보기" brings them back.
const KEY = 'lit.tips.closed';
const listeners = new Set<() => void>();
let closed: Set<string> = read();
function read() { try { return new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set<string>(); } }
function save(next: Set<string>) {
  closed = next;
  try { localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* private mode: closes for this visit only */ }
  listeners.forEach(f => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const useClosed = () => useSyncExternalStore(subscribe, () => closed, () => closed);

export const closeTip = (id: string) => save(new Set([...closed, id]));
export const reopenTips = () => save(new Set());
export const useClosedTipCount = () => useClosed().size;

export function Tip({id, children, block}: {id: string; children: React.ReactNode; block?: boolean}) {
  const shut = useClosed();
  if (shut.has(id)) return null;
  const Tag = block ? 'p' : 'span';
  return <Tag className={`tip ${block ? 'block' : ''}`}>
    <span className="tip-text">{children}</span>
    <button type="button" className="tip-x" onClick={() => closeTip(id)} aria-label="이 안내 닫기" title="확인했어요 · 닫기">×</button>
  </Tag>;
}

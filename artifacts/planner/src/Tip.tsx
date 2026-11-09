import {useSyncExternalStore} from 'react';

// How-to notes and explanations. They stay out of the way in daily use: hidden unless the user turns
// "사용 안내 보기" on in 설정 (a later tutorial will show them). Each shown note closes with ×.
const KEY = 'lit.tips.closed', ON = 'lit.tips.on';
const listeners = new Set<() => void>();
type State = {on: boolean; closed: Set<string>};
let state: State = read();
function read(): State {
  try { return {on: localStorage.getItem(ON) === '1', closed: new Set<string>(JSON.parse(localStorage.getItem(KEY) ?? '[]'))}; }
  catch { return {on: false, closed: new Set<string>()}; }
}
function save(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify([...next.closed])); localStorage.setItem(ON, next.on ? '1' : '0'); } catch { /* private mode: this visit only */ }
  listeners.forEach(f => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const useTips = () => useSyncExternalStore(subscribe, () => state, () => state);

export const closeTip = (id: string) => save({...state, closed: new Set([...state.closed, id])});
/** Turning notes on brings every closed one back. */
export const setTipsOn = (on: boolean) => save({on, closed: on ? new Set() : state.closed});
export const useTipsOn = () => useTips().on;

export function Tip({id, children, block}: {id: string; children: React.ReactNode; block?: boolean}) {
  const s = useTips();
  if (!s.on || s.closed.has(id)) return null;
  const Tag = block ? 'p' : 'span';
  return <Tag className={`tip ${block ? 'block' : ''}`}>
    <span className="tip-text">{children}</span>
    <button type="button" className="tip-x" onClick={() => closeTip(id)} aria-label="이 안내 닫기" title="확인했어요 · 닫기">×</button>
  </Tag>;
}

// v9 3장: the five spaces on the rail, and which space each existing path belongs to.
// Paths stay as they were (v7 0.4); this table only decides which rail item is current.
export type SpaceId = 'record' | 'learn' | 'space' | 'share' | 'market' | 'satellite' | 'profile';

export function spaceOf(path: string): SpaceId {
  const [first = '', , third] = path.split('?')[0]!.split('/').filter(Boolean);
  switch (first) {
    case '': case 'notes': case 'media': case 'forms': case 'pages': case 'storage': case 'print': return 'record';
    case 'entries': return third === 'original' ? 'record' : 'learn';
    case 'learn': case 'station': case 'compare': case 'chat': return 'learn';
    case 'galaxy': case 'universe': case 'concepts': return 'space';
    case 'teams': return 'share';
    case 'market': return 'market';
    case 'satellite': case 'projects': case 'planner': case 'connect': case 'sat': return 'satellite';
    case 'settings': case 'inbox': case 'structures': case 'onboarding': return 'profile';
    default: return 'record';
  }
}

/** The first screen of each space. */
export const spaceHome: Record<SpaceId, string> = {record: '/', learn: '/learn', space: '/galaxy', share: '/teams', market: '/market', satellite: '/satellite', profile: '/settings'};

export type Focus = {type: 'entry' | 'concept' | 'question' | 'page'; id: string};
const KEY = 'moons.focus';

export function readFocus(): Focus | null {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v && typeof v.id === 'string' && typeof v.type === 'string' ? v : null; } catch { return null; }
}
export function writeFocus(f: Focus | null) {
  try { if (f) sessionStorage.setItem(KEY, JSON.stringify(f)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** What the user was looking at, from the path (null when the path is not about one thing). */
export function focusOfPath(path: string): Focus | null {
  const [first, id] = path.split('?')[0]!.split('/').filter(Boolean);
  if (!id || id === 'new' || id === 'compare') return null;
  if (first === 'entries') return {type: 'entry', id};
  if (first === 'pages') return {type: 'page', id};
  if (first === 'concepts') return {type: 'concept', id};
  return null;
}

/** v9 3장 맥락 유지: switching space keeps the thing in view. Clicking the space you are in goes to its first screen. */
export function targetFor(space: SpaceId, current: SpaceId, focus: Focus | null, entryOfPage?: (pageId: string) => string | undefined): string {
  if (space === current || !focus) return spaceHome[space];
  const entry = focus.type === 'entry' ? focus.id : focus.type === 'page' ? entryOfPage?.(focus.id) : undefined;
  if (space === 'record') return focus.type === 'page' ? `/pages/${focus.id}` : entry ? `/entries/${entry}/original` : spaceHome.record;
  if (space === 'learn') return entry ? `/learn?focus=${entry}` : focus.type === 'concept' ? `/learn?concept=${focus.id}` : spaceHome.learn;
  if (space === 'space') return entry ? `/galaxy?focus=${entry}` : focus.type === 'concept' ? `/galaxy?concept=${focus.id}` : spaceHome.space;
  return spaceHome[space];
}

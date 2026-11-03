import type {ReactNode} from 'react';
import {BookOpen,CalendarClock,ClipboardList,FolderOpen,NotebookPen,Orbit,Plus,Store as StoreIcon,Users,VenetianMask,type LucideIcon} from 'lucide-react';
import {Logo} from '../Brand';
import {tr} from '@/lib/i18n';
import {spaceOf,targetFor,readFocus,type SpaceId} from '@/lib/spaces';
import {enabledSatellites} from '@/lib/satellites';
import {deviceManifest} from '@workspace/moons-sync/satellites';
import type {Store} from '@/lib/model';

export type RailSatellite = {id: string; name: string; url: string; icon?: LucideIcon; initial?: string};
const deviceIcons: Record<string, LucideIcon> = {projects: FolderOpen, planner: CalendarClock, impostor: VenetianMask, forms: ClipboardList};

/** v9 9.3: the Satellites under the rail divider. Pinned ones first; without a choice, every installed one is pinned. */
export function railSatellites(store: Store, all_ = false): RailSatellite[] {
  const all: RailSatellite[] = [];
  for (const id of enabledSatellites(store)) {
    const m = deviceManifest(id); if (!m) continue;
    all.push({id, name: id === 'planner' ? tr('Planner') : m.name === 'Form builder' ? tr('Form builder') : m.name, url: m.route, icon: deviceIcons[id]});
  }
  for (const s of store.satellites ?? []) if (s.kind === 'external') all.push({id: s.id, name: s.name, url: `/satellite/${s.id}`, initial: s.name.trim().slice(0, 1).toUpperCase()});
  const pinned = (store.settings as {pinnedSatellites?: string[]} | undefined)?.pinnedSatellites;
  if (all_) return all;
  return pinned ? pinned.map(id => all.find(s => s.id === id)).filter((s): s is RailSatellite => !!s) : all;
}

const spaces: {id: SpaceId; label: string; icon: LucideIcon}[] = [
  {id: 'record', label: 'Record', icon: NotebookPen},
  {id: 'learn', label: 'Learn', icon: BookOpen},
  {id: 'space', label: 'Space', icon: Orbit},
  {id: 'share', label: 'Share', icon: Users},
];

export default function Rail({path, go, store, tools, showShare, showMarket, entryOfPage}: {path: string; go: (url: string) => void; store: Store | null; tools?: ReactNode; showShare: boolean; showMarket: boolean; entryOfPage?: (id: string) => string | undefined}) {
  const current = spaceOf(path);
  const sats = store ? railSatellites(store) : [];
  const items = spaces.filter(s => s.id !== 'share' || showShare).concat(showMarket ? [{id: 'market', label: 'Market', icon: StoreIcon}] : []);
  return <nav className="rail" aria-label={tr('Spaces')}>
    <button className="rail-logo" onClick={() => go('/')} aria-label={tr('MOONS home')}><Logo size="rail"/></button>
    <div className="rail-spaces">
      {items.map(({id, label, icon: Icon}) => <button key={id} className="rail-item" aria-current={current === id ? 'page' : undefined} onClick={() => go(targetFor(id, current, readFocus(), entryOfPage))}><Icon size={21} strokeWidth={1.7}/><span>{tr(label)}</span></button>)}
    </div>
    <hr className="rail-sep"/>
    <div className="rail-sats" aria-label={tr('My Satellites')}>
      {sats.map(s => { const Icon = s.icon; const on = path === s.url || path.startsWith(s.url + '/'); return <button key={s.id} className="rail-item sat" aria-current={on ? 'page' : undefined} onClick={() => go(s.url)} title={s.name}>{Icon ? <Icon size={19} strokeWidth={1.7}/> : <b className="sat-initial">{s.initial}</b>}<span>{s.name}</span></button>; })}
      <button className="rail-item add" aria-current={path === '/satellite' ? 'page' : undefined} onClick={() => go('/satellite')} aria-label={tr('Satellite square')} title={tr('Satellite square')}><Plus size={19}/></button>
    </div>
    <div className="rail-tools">{tools}</div>
  </nav>;
}

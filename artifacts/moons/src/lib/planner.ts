import {uid} from './model.ts';

// Planner data lives in the workspace as collections, so it syncs and is logged like everything else.
export type Familiarity = 'new' | 'think_i_know' | 'know';
export type Project = {id: string; name: string; planetId?: string; patternFormId?: string; familiarity: Familiarity; status: 'active' | 'done'; createdAt: string};
export type TaskStatus = 'todo' | 'doing' | 'done' | 'dropped';
export type Reward = 'yes' | 'meh' | 'no';
/** wish: a bonus-stage item — something you would like to do once the day's tasks are done. It never counts
 *  toward the day's completion. reward: whether doing it felt like a reward, asked right after finishing it. */
export type Task = {id: string; title: string; projectId?: string; stepKey?: string; plannedDate?: string; plannedStart?: string; estimateMin?: number; status: TaskStatus; createdAt: string; doneAt?: string; wish?: boolean; reward?: Reward; sourceBriefId?:string; sourceProposalId?:string};
export type Session = {id: string; taskId: string; startedAt: string; endedAt?: string; source: 'timer' | 'manual' | 'suggested'};
export type Confidence = {id: string; targetType: 'concept' | 'task' | 'node' | 'project'; targetId: string; value: number; note?: string; at: string};

export type PlannerStore = {projects?: Project[]; tasks?: Task[]; sessions?: Session[]; confidence?: Confidence[]; entries: {id: string; createdAt: string; planetIds: string[]}[]};

const now = () => new Date().toISOString();
export const localDay = (iso: string) => {const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;};
export const today = () => localDay(now());

export function newProject(name: string, familiarity: Familiarity, extra: Partial<Project> = {}): Project {
  return {id: uid(), name, familiarity, status: 'active', createdAt: now(), ...extra};
}
export function newTask(title: string, extra: Partial<Task> = {}): Task {
  return {id: uid(), title, status: 'todo', createdAt: now(), ...extra};
}

const minutes = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** Minutes spent on a task: closed sessions plus a running one up to `at`. */
export function actualMinutes(sessions: Session[], taskId: string, at = now()) {
  return sessions.filter(s => s.taskId === taskId).reduce((sum, s) => sum + minutes(s.startedAt, s.endedAt ?? at), 0);
}
export const running = (sessions: Session[]) => sessions.find(s => !s.endedAt) ?? null;

/** Start a task's timer. Any other running session is closed first: one timer at a time. */
export function startTimer<S extends PlannerStore>(store: S, taskId: string, at = now()): S {
  const sessions = (store.sessions ?? []).map(s => s.endedAt ? s : {...s, endedAt: at});
  const tasks = (store.tasks ?? []).map(t => t.id === taskId && t.status === 'todo' ? {...t, status: 'doing' as const} : t);
  return {...store, tasks, sessions: [...sessions, {id: uid(), taskId, startedAt: at, source: 'timer' as const}]};
}
export function stopTimer<S extends PlannerStore>(store: S, at = now()): S {
  return {...store, sessions: (store.sessions ?? []).map(s => s.endedAt ? s : {...s, endedAt: at})};
}
export function setStatus<S extends PlannerStore>(store: S, taskId: string, status: TaskStatus, at = now()): S {
  const stopped = status === 'done' || status === 'dropped' ? stopTimerFor(store, taskId, at) : store;
  return {...stopped, tasks: (stopped.tasks ?? []).map(t => t.id === taskId ? {...t, status, ...(status === 'done' ? {doneAt: at} : {})} : t)};
}
function stopTimerFor<S extends PlannerStore>(store: S, taskId: string, at: string): S {
  return {...store, sessions: (store.sessions ?? []).map(s => !s.endedAt && s.taskId === taskId ? {...s, endedAt: at} : s)};
}

export type TimeSuggestion = {taskId: string; projectId: string; startedAt: string; endedAt: string; count: number};

/** Times you wrote in MOONS for a project's planet while no timer ran: offered as sessions you can accept.
 *  Records closer than `gap` minutes form one window; each window is padded by `pad` minutes. */
export function missedTime(store: PlannerStore, day: string, gap = 30, pad = 5): TimeSuggestion[] {
  const projects = (store.projects ?? []).filter(p => p.status === 'active' && p.planetId);
  const tasks = store.tasks ?? [], sessions = store.sessions ?? [];
  const out: TimeSuggestion[] = [];
  for (const p of projects) {
    const task = tasks.find(t => t.projectId === p.id && (t.status === 'doing' || t.status === 'todo')) ?? tasks.find(t => t.projectId === p.id);
    if (!task) continue;
    const times = store.entries.filter(e => e.planetIds.includes(p.planetId!) && localDay(e.createdAt) === day).map(e => new Date(e.createdAt).getTime()).sort((a, b) => a - b);
    let start = -1, last = -1, count = 0;
    const flush = () => {
      if (start < 0) return;
      const s = new Date(start - pad * 60000).toISOString(), e = new Date(last + pad * 60000).toISOString();
      const covered = sessions.some(x => x.startedAt < e && (x.endedAt ?? now()) > s);
      if (!covered) out.push({taskId: task.id, projectId: p.id, startedAt: s, endedAt: e, count});
    };
    for (const t of times) {
      if (start >= 0 && t - last <= gap * 60000) {last = t; count++; continue;}
      flush(); start = t; last = t; count = 1;
    }
    flush();
  }
  return out;
}
export function acceptSuggestion<S extends PlannerStore>(store: S, s: TimeSuggestion): S {
  return {...store, sessions: [...(store.sessions ?? []), {id: uid(), taskId: s.taskId, startedAt: s.startedAt, endedAt: s.endedAt, source: 'suggested' as const}]};
}

export function rate<S extends PlannerStore>(store: S, targetType: Confidence['targetType'], targetId: string, value: number, note?: string): S {
  const v = Math.min(10, Math.max(1, Math.round(value)));
  return {...store, confidence: [...(store.confidence ?? []), {id: uid(), targetType, targetId, value: v, ...(note?.trim() ? {note: note.trim()} : {}), at: now()}]};
}
export const ratingsFor = (store: PlannerStore, targetId: string) => (store.confidence ?? []).filter(c => c.targetId === targetId).sort((a, b) => a.at.localeCompare(b.at));

/** Flat stretch: the last `n` ratings moved by at most 1 point. An observation, not a verdict. */
export function plateau(ratings: Confidence[], n = 4) {
  if (ratings.length < n) return false;
  const last = ratings.slice(-n).map(r => r.value);
  return Math.max(...last) - Math.min(...last) <= 1;
}

/** The day's completion counts planned tasks only; wishes and dropped tasks are left out. */
export function completion(tasks: Task[]) {
  const counted = tasks.filter(t => !t.wish && t.status !== 'dropped');
  const done = counted.filter(t => t.status === 'done').length;
  return {done, total: counted.length, rate: counted.length ? done / counted.length : null, bonusOpen: counted.length > 0 && done === counted.length};
}
export function setReward<S extends PlannerStore>(store: S, taskId: string, reward: Reward): S {
  return {...store, tasks: (store.tasks ?? []).map(t => t.id === taskId ? {...t, reward} : t)};
}

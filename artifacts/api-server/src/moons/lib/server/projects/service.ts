import {createHash, randomBytes} from 'node:crypto';
import type {ConnectedProject, ProjectProposal, ReviewDraft, ProjectEvent, ProjectHub} from '@workspace/moons-sync/projects';
import {renderWorkBrief} from '@workspace/moons-sync/projects';
import {q, json, newId} from '../db.ts';
import {WorkspaceError, now, type Store} from '../v5/types.ts';
import {seal} from '../v5/ai-access.ts';
import {listConnections} from './connectors.ts';
import {deviceEnabled,type DeviceSettings} from '@workspace/moons-sync/satellites';

export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new WorkspaceError(400, 'Invalid project data.');
  return v as Record<string, unknown>;
}
export function text(v: unknown, max = 4000, required = false): string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new WorkspaceError(400, 'Invalid or missing text.');
  return v.trim();
}
export function texts(v: unknown, max = 20, length = 1000): string[] {
  if (!Array.isArray(v) || v.length > max) throw new WorkspaceError(400, 'Invalid list.');
  return [...new Set(v.map(x => text(x, length, true)))];
}
export function safeUrl(v: unknown): string {
  const s = text(v ?? '', 1000); if (!s) return '';
  let u: URL; try { u = new URL(s); } catch { throw new WorkspaceError(400, 'Use an https URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password) throw new WorkspaceError(400, 'Use an https URL.');
  return u.toString();
}
export function repository(v: unknown): string {
  const s = text(v ?? '', 200).replace(/^https:\/\/github\.com\//i, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  if (s && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) throw new WorkspaceError(400, 'Use a GitHub owner/repository.');
  return s;
}
export function parseDraft(v: unknown): ReviewDraft {
  const d = object(v);
  const result: ReviewDraft = {title: text(d.title, 160, true), rationale: text(d.rationale, 4000, true), change: text(d.change, 6000, true),
    scope: texts(d.scope), preserve: texts(d.preserve), acceptance: texts(d.acceptance), verification: texts(d.verification),
    questions: texts(d.questions), risks: texts(d.risks), codePaths: texts(d.codePaths, 30, 300)};
  if (!result.scope.length || !result.acceptance.length || !result.verification.length) throw new WorkspaceError(400, 'Scope, acceptance criteria and verification are required.');
  return result;
}
export async function getProject(owner: string, id: string): Promise<ConnectedProject> {
  const row = (await q<{data: ConnectedProject; revision: number; github: boolean; telemetry: boolean}>(
    'select data,revision,github_key is not null github,telemetry_hash is not null telemetry from connected_projects where owner_id=$1 and id=$2', [owner, id]))[0];
  if (!row) throw new WorkspaceError(404, 'Project not found.');
  return {...row.data, revision: row.revision, githubConnected: row.github, telemetryConnected: row.telemetry};
}
export async function listProjects(owner: string): Promise<ConnectedProject[]> {
  const rows = await q<{data: ConnectedProject; revision: number; github: boolean; telemetry: boolean}>(
    'select data,revision,github_key is not null github,telemetry_hash is not null telemetry from connected_projects where owner_id=$1 order by data->>\'createdAt\' desc', [owner]);
  return rows.map(r => ({...r.data, revision: r.revision, githubConnected: r.github, telemetryConnected: r.telemetry}));
}
export async function saveProject(owner: string, input: unknown, store: Store, id?: string) {
  const b = object(input), old = id ? await getProject(owner, id) : undefined;
  if (!old && (await listProjects(owner)).length >= 50) throw new WorkspaceError(400, 'Project limit reached.');
  const noteIds = texts(b.noteIds ?? [], 20, 80);
  if (noteIds.some(n => !store.entries.some(e => e.id === n))) throw new WorkspaceError(404, 'Context note not found in this space.');
  const paths = texts(b.contextPaths ?? ['README.md', 'AGENTS.md'], 8, 250);
  if (paths.some(p => p.startsWith('/') || p.split('/').some(x => x === '..') || !/\.(md|txt|json|tsx?|jsx?|ya?ml)$/i.test(p) || /(^|\/)(\.env|credentials|secrets?)(\.|\/|$)/i.test(p))) throw new WorkspaceError(400, 'Choose source or documentation paths.');
  const repo = repository(b.repository);
  const targetDate=text(b.targetDate??old?.targetDate??'',10);
  if(targetDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||!Number.isFinite(Date.parse(targetDate))||new Date(`${targetDate}T12:00:00Z`).toISOString().slice(0,10)!==targetDate))throw new WorkspaceError(400,'Choose a valid target date.');
  const stage=b.stage??old?.stage??'planning';
  if(!['planning','building','maintaining','paused','done'].includes(String(stage)))throw new WorkspaceError(400,'Choose a project stage.');
  const milestones=b.milestones??old?.milestones??[];
  if(!Array.isArray(milestones)||milestones.length>30)throw new WorkspaceError(400,'Invalid milestones.');
  const milestoneIds=new Set<string>();
  const parsedMilestones=milestones.map(raw=>{const m=object(raw),id=text(m.id,80,true),date=text(m.date??'',10);if(milestoneIds.has(id)||date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date))throw new WorkspaceError(400,'Invalid milestone.');milestoneIds.add(id);return {id,title:text(m.title,200,true),date,done:m.done===true};});
  const rawLinks=b.links??old?.links??[];
  if(!Array.isArray(rawLinks)||rawLinks.length>60)throw new WorkspaceError(400,'Invalid structure lines.');
  const links=rawLinks.map(raw=>{const l=object(raw);return {id:text(l.id,80,true),from:text(l.from,160,true),to:text(l.to,160,true),label:text(l.label??'',40)}}).filter(l=>l.from!==l.to);
  const plannerProjectId = old?.plannerProjectId ?? text(b.plannerProjectId ?? '', 80);
  if (plannerProjectId && (!Array.isArray(store.projects) || !store.projects.some(p => p.id === plannerProjectId))) throw new WorkspaceError(404, 'Project not found in this space.');
  if (!old && plannerProjectId && (await listProjects(owner)).some(p => p.id === plannerProjectId)) throw new WorkspaceError(409, 'This project is already connected.');
  const project: ConnectedProject = {id: old?.id ?? (plannerProjectId || newId()), ...(plannerProjectId ? {plannerProjectId} : {}), name: text(b.name, 100, true), goal: text(b.goal, 5000, true),
    repository: repo, website: safeUrl(b.website), contextPaths: paths, noteIds, watch: b.watch !== false,
    contexts: old?.contexts ?? [], createdAt: old?.createdAt ?? now(), updatedAt: now(), revision: (old?.revision ?? 0) + 1,targetDate,stage:stage as ConnectedProject['stage'],milestones:parsedMilestones,links,
    ...(old?.repository === repo && old.snapshot ? {snapshot: old.snapshot} : {})};
  if (old) {
    const rows = await q(`update connected_projects set data=$3::jsonb,revision=revision+1,
      github_key=case when data->>'repository'=$5 then github_key else null end
      where owner_id=$1 and id=$2 and revision=$4 returning id`, [owner, id, json(project), b.revision, repo]);
    if (!rows.length) throw new WorkspaceError(409, 'Project changed. Reload before saving.');
  } else await q('insert into connected_projects(owner_id,id,data) values($1,$2,$3::jsonb)', [owner, project.id, json(project)]);
  return getProject(owner, project.id);
}
export async function getProposal(owner: string, id: string): Promise<ProjectProposal> {
  const row = (await q<{data: ProjectProposal; revision: number}>('select data,revision from project_proposals where owner_id=$1 and id=$2', [owner, id]))[0];
  if (!row) throw new WorkspaceError(404, 'Proposal not found.');
  return {...row.data, revision: row.revision};
}
export async function writeProposal(owner: string, p: ProjectProposal, expected: unknown) {
  p.updatedAt = now(); p.revision = Number(expected) + 1;
  const rows = await q('update project_proposals set data=$3::jsonb,revision=revision+1 where owner_id=$1 and id=$2 and revision=$4 returning id', [owner, p.id, json(p), expected]);
  if (!rows.length) throw new WorkspaceError(409, 'Proposal changed. Reload before continuing.');
  return p;
}
export function confirmProposal(p: ProjectProposal): ProjectProposal {
  if (p.status !== 'review') throw new WorkspaceError(409, 'Open a new revision before confirming.');
  const d = parseDraft(p.draft);
  if (d.questions.length) throw new WorkspaceError(400, 'Resolve the open questions before confirming.');
  const approvedAt = now(), version = p.briefs.length + 1, markdown = renderWorkBrief(p, version, approvedAt);
  return {...p, status: 'confirmed', notice: 'seen', briefs: [...p.briefs, {id: newId(), version, approvedAt, markdown, digest: digest(markdown), sourceRevision: p.revision}]};
}
export async function proposalAction(owner: string, id: string, input: unknown) {
  const b = object(input), p = await getProposal(owner, id);
  if (b.revision !== p.revision) throw new WorkspaceError(409, 'Proposal changed. Reload before continuing.');
  if (b.action === 'edit') {
    if (p.status !== 'review') throw new WorkspaceError(409, 'Open a new revision before editing.');
    p.draft = parseDraft(b.draft);
  } else if (b.action === 'confirm') return writeProposal(owner, confirmProposal(p), b.revision);
  else if (b.action === 'reopen') { p.status = 'review'; p.notice = 'seen'; }
  else if (b.action === 'dismiss') { p.status = 'dismissed'; p.notice = 'dismissed'; }
  else if (b.action === 'handoff') {
    if (p.status !== 'confirmed' || !p.briefs.length) throw new WorkspaceError(409, 'Confirm a brief first.');
    p.status = 'handed_off';
  } else if (b.action === 'result') {
    const brief = p.briefs.find(x => x.id === b.briefId);
    if (!brief) throw new WorkspaceError(400, 'Choose an approved brief version.');
    if (p.results.length >= 30) throw new WorkspaceError(400, 'Result limit reached.');
    p.results.push({id: newId(), briefId: brief.id, text: text(b.text, 20000, true), url: safeUrl(b.url), at: now(), evidence: 'reported'});
    if (brief.id === p.briefs.at(-1)?.id && p.status !== 'review') p.status = 'reported';
  } else throw new WorkspaceError(400, 'Unknown proposal action.');
  return writeProposal(owner, p, b.revision);
}
export async function setGithubKey(owner: string, id: string, value: unknown) {
  await getProject(owner, id); const key = text(value ?? '', 500);
  await q('update connected_projects set github_key=$3 where owner_id=$1 and id=$2', [owner, id, key ? seal(key) : null]);
}
export async function rotateTelemetry(owner: string, id: string, revoke = false) {
  await getProject(owner, id); const token = revoke ? null : `moons_${randomBytes(32).toString('base64url')}`;
  await q('update connected_projects set telemetry_hash=$3 where owner_id=$1 and id=$2', [owner, id, token ? digest(token) : null]);
  return {token};
}
export function parseEvent(input: unknown, projectId: string): ProjectEvent {
  const b = object(input), at = text(b.at, 40, true);
  if (!Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.now() + 300000) throw new WorkspaceError(400, 'Invalid event time.');
  if (!['usage', 'error', 'deployment', 'cost'].includes(String(b.kind)) || typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0 || b.value > 1e12) throw new WorkspaceError(400, 'Invalid metric.');
  if (!['estimated', 'reported'].includes(String(b.basis))) throw new WorkspaceError(400, 'Choose estimated or reported.');
  if (b.aggregation !== undefined && !['sum', 'latest'].includes(String(b.aggregation))) throw new WorkspaceError(400, 'Choose sum or latest.');
  const unit = text(b.unit, 30, true);
  if (b.kind === 'cost' && !/^[A-Z]{3}$/.test(unit)) throw new WorkspaceError(400, 'Use an ISO currency code.');
  return {id: text(b.id, 100, true), projectId, kind: b.kind as ProjectEvent['kind'], name: text(b.name, 100, true), value: b.value,
    unit, at: new Date(at).toISOString(), basis: b.basis as ProjectEvent['basis'], source: text(b.source, 100, true), aggregation: b.aggregation === 'latest' ? 'latest' : 'sum'};
}
export async function acceptEvent(token: string, input: unknown) {
  const row = (await q<{owner_id: string; id: string}>('select owner_id,id from connected_projects where telemetry_hash=$1', [digest(token)]))[0];
  if (!row) throw new WorkspaceError(401, 'Invalid project token.');
  const workspace=(await q<{store:Store}>('select store from personal_workspaces where owner_id=$1',[row.owner_id]))[0]?.store;
  if(!deviceEnabled(workspace?.settings as DeviceSettings|undefined,'projects'))throw new WorkspaceError(403,'Dock is paused or not installed.');
  const event = parseEvent(input, row.id);
  const saved = await q('insert into project_events(owner_id,project_id,id,data,at) values($1,$2,$3,$4::jsonb,$5) on conflict do nothing returning id', [row.owner_id, row.id, event.id, json(event), event.at]);
  return {accepted: !!saved.length};
}
export async function projectHub(owner: string): Promise<ProjectHub> {
  const [projects, proposals, jobs, events, usage, usageByProject, connections] = await Promise.all([
    listProjects(owner),
    q<{data: ProjectProposal; revision: number}>('select data,revision from project_proposals where owner_id=$1 order by data->>\'updatedAt\' desc limit 500', [owner]),
    q<{id: string; entryId: string; state: string; attempts: number; error: string | null; createdAt: string}>('select id,entry_id "entryId",state,attempts,error,created_at::text "createdAt" from project_jobs where owner_id=$1 order by created_at desc limit 50', [owner]),
    // Aggregate the full window before returning it; row limits must not silently undercount spend.
    q<{data: ProjectEvent}>(`select (array_agg(data order by at desc))[1] || jsonb_build_object('value',
      case when data->>'aggregation'='latest' then ((array_agg(data order by at desc))[1]->>'value')::numeric
      else sum((data->>'value')::numeric) end) data
      from project_events where owner_id=$1 and at>now()-interval '30 days'
      group by project_id,data->>'kind',data->>'name',data->>'unit',data->>'basis',data->>'source',data->>'aggregation'`, [owner]),
    q<{calls: number; cost: number | null; unknown: number}>('select count(*)::int calls,sum(cost_usd)::float cost,count(*) filter(where cost_usd is null)::int unknown from ai_calls where owner_id=$1 and at>now()-interval \'30 days\'', [owner]),
    // MOONS's own AI spend per project (reviews and discussions carry the project they served).
    q<{projectId: string; calls: number; cost: number | null; unknown: number}>('select project_id "projectId",count(*)::int calls,sum(cost_usd)::float cost,count(*) filter(where cost_usd is null)::int unknown from ai_calls where owner_id=$1 and project_id is not null and at>now()-interval \'30 days\' group by project_id', [owner]),
    listConnections(owner),
  ]);
  return {projects, proposals: proposals.map(p => ({...p.data, revision: p.revision})), jobs, events: events.map(e => e.data), connections, aiUsage: usage[0] ?? {calls: 0, cost: null, unknown: 0}, aiByProject: usageByProject};
}

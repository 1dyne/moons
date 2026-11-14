import type {ProjectProposal} from '@workspace/moons-sync/projects';
import {q, json, transaction, newId} from '../db.ts';
import {initV5, loadWorkspace} from '../v5/workspace-store.ts';
import {WorkspaceError, type Store} from '../v5/types.ts';
import {listProjects} from './service.ts';
import {generateReviews} from './review.ts';
import {deviceEnabled,type DeviceSettings} from '@workspace/moons-sync/satellites';
import {onProjectWork} from './queue.ts';

type Job = {id: string; owner_id: string; entry_id: string; lease: string; attempts: number; tag_key: string};
export async function runProjectJob() {
  await initV5();
  const lease = newId();
  const job = (await q<Job>(`update project_jobs set state='running',lease=$1,started_at=now(),attempts=attempts+1,error=null
    where id=(select id from project_jobs where attempts<3 and
    ((state='queued' and available_at<=now()) or (state='running' and started_at<now()-interval '10 minutes'))
    order by created_at for update skip locked limit 1) returning *`, [lease]))[0];
  if (!job) {
    await q(`update project_jobs set state='failed',error='Interrupted repeatedly. Retry this review.' where state='running' and attempts>=3 and started_at<now()-interval '10 minutes'`);
    return false;
  }
  const heartbeat = setInterval(() => {void q("update project_jobs set started_at=now() where id=$1 and lease=$2 and state='running'", [job.id, lease]).catch(() => undefined);}, 30000);
  heartbeat.unref();
  try {
    const {store} = await loadWorkspace(job.owner_id);
    const entry = store.entries.find(e => e.id === job.entry_id);
    const enabled = deviceEnabled(store.settings as DeviceSettings,'projects');
    const tags = [...new Set(Array.isArray(entry?.projectIds) ? entry.projectIds as string[] : [])].sort();
    const existing = await q<{data: ProjectProposal}>('select data from project_proposals where owner_id=$1', [job.owner_id]);
    const proposals = entry && enabled && JSON.stringify(tags) === job.tag_key
      ? await generateReviews(job.owner_id, store, entry, await listProjects(job.owner_id), existing.map(x => x.data)) : [];
    await transaction(async tx => {
      // Recheck opt-in after inference: pausing or retagging cancels an in-flight review.
      const current = (await tx.query('select store from personal_workspaces where owner_id=$1 for update', [job.owner_id])).rows[0]?.store as Store | undefined;
      const held = await tx.query('select id from project_jobs where id=$1 and lease=$2 and state=\'running\' for update', [job.id, lease]);
      if (!held.rows.length) return;
      const currentEntry = current?.entries.find(e => e.id === job.entry_id);
      const currentTags = [...new Set(Array.isArray(currentEntry?.projectIds) ? currentEntry.projectIds as string[] : [])].sort();
      const stillEnabled = deviceEnabled(current?.settings as DeviceSettings,'projects');
      const watched = (await tx.query('select id,data from connected_projects where owner_id=$1 for share', [job.owner_id])).rows;
      const accepted = stillEnabled && currentEntry && JSON.stringify(currentTags) === job.tag_key
        ? proposals.filter(p => watched.some(w => w.id === p.projectId && (w.data as {watch: boolean}).watch)) : [];
      for (const p of accepted) await tx.query(`insert into project_proposals(owner_id,id,project_id,entry_id,data) values($1,$2,$3,$4,$5::jsonb)
        on conflict(owner_id,project_id,entry_id) do nothing`, [job.owner_id, p.id, p.projectId, p.entryId, json(p)]);
      await tx.query('update project_jobs set state=$3,lease=null where id=$1 and lease=$2', [job.id, lease, accepted.length ? 'complete' : 'no_proposal']);
    });
  } catch (error) {
    const message = error instanceof WorkspaceError && error.status < 500 ? error.message : 'Project review failed. Check AI connection and retry.';
    await q(`update project_jobs set state=$3,error=$4,lease=null,available_at=now()+interval '2 minutes' where id=$1 and lease=$2`, [job.id, lease, job.attempts >= 3 ? 'failed' : 'queued', message]);
  } finally {clearInterval(heartbeat);}
  return true;
}
// A failed job is requeued for now()+2 minutes, and a lease lost with its process is
// reclaimed 10 minutes after it was taken. Nothing else puts work in the queue on a timer.
const RETRY_MS = 150_000;
const LEASE_MS = 11 * 60_000;
// How long until the queue is worth another look, or 0 when no job is left to run.
async function nextCheck() {
  const row = (await q<{queued: string; running: string}>(`select
    count(*) filter (where state='queued') queued, count(*) filter (where state='running') running
    from project_jobs where attempts<3`))[0];
  return Number(row?.queued ?? 0) ? RETRY_MS : Number(row?.running ?? 0) ? LEASE_MS : 0;
}
// Jobs arrive through enqueueProjectSparks in this same process, so the worker is woken by
// that write and otherwise holds no timer: polling an empty queue costs a query every few
// seconds, and a managed Postgres that is never idle never suspends its compute.
// MOONS_PROJECT_POLL_MS is an escape hatch for a deployment whose jobs are written by a
// second process that cannot wake this one; it caps how long the worker stays asleep.
export function startProjectWorker(onError: (error: unknown) => void) {
  const floor = Number(process.env.MOONS_PROJECT_POLL_MS) || 0;
  let draining = false, again = false, stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = (ms: number) => {
    const wait = floor && ms ? Math.min(ms, floor) : ms || floor;
    if (stopped || timer || !wait) return;
    timer = setTimeout(() => {timer = undefined; void drain();}, wait);
    timer.unref();
  };
  const drain = async () => {
    if (draining) {again = true; return;}
    draining = true;
    try {
      do {again = false; while (!stopped && await runProjectJob());} while (again && !stopped);
      later(await nextCheck());
    } catch (error) {onError(error); later(RETRY_MS);}
    finally {draining = false;}
  };
  onProjectWork(() => {if (!stopped) void drain();});
  void drain(); // Picks up jobs a previous process left behind.
  return () => {stopped = true; onProjectWork(undefined); if (timer) clearTimeout(timer);};
}

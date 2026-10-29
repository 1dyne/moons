import type {Driver} from '../db.ts';
import type {Store} from '../v5/types.ts';
import {deviceEnabled,type DeviceSettings} from '@workspace/moons-sync/satellites';

export function changedProjectSparks(previous: Store, next: Store) {
  const enabled = deviceEnabled(next.settings as DeviceSettings,'projects');
  if (!enabled) return [];
  return next.entries.filter(e => e.kind === 'dump' && e.body.trim()).flatMap(e => {
    const old = previous.entries.find(x => x.id === e.id);
    const tags = Array.isArray(e.projectIds) ? [...new Set(e.projectIds as string[])].sort() : [];
    const before = Array.isArray(old?.projectIds) ? [...new Set(old.projectIds as string[])].sort() : [];
    return !old || JSON.stringify(tags) !== JSON.stringify(before) ? [{entryId: e.id, tags}] : [];
  });
}

// Written in the same transaction as the original: a browser closing cannot lose the trigger.
export async function enqueueProjectSparks(tx: Driver, owner: string, previous: Store, next: Store) {
  for (const spark of changedProjectSparks(previous, next)) {
    await tx.query(`insert into project_jobs(id,owner_id,entry_id,tag_key)
      select $1,$2,$3,$4 where exists(select 1 from connected_projects where owner_id=$2 and data->>'watch'='true')
      on conflict(owner_id,entry_id,tag_key) do nothing`, [crypto.randomUUID(), owner, spark.entryId, JSON.stringify(spark.tags)]);
  }
}

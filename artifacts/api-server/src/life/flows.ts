import type {AnyRecord} from '@workspace/life-contract';
import {Logic, runFlows, runItems, type PlannerSpec} from '@workspace/planner-spec';
import {allRecords, getSpec, onAfterWrite, writeRecordOnly} from './store.ts';

// Automations between widgets (docs/lit/BLOCKS.md §4) run here, after every write, whoever wrote it
// (the planner on any device, Claude through the connector). Data actions are applied on the server; 'notify' is shown
// by the screen that made the write. A chain of automations never runs the same flow twice, and stops at 6 steps.
async function run(owner: string, record: AnyRecord, chain: string[]) {
  if (record.kind !== 'entry' || chain.length >= 6) return;
  const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
  const logic = Logic.safeParse(spec?.logic ?? {});
  if (!logic.success || !logic.data.flows.length) return;
  const {writes} = runFlows(logic.data, await allRecords(owner), record, {day: record.logicalDay ?? '', chain});
  for (const w of writes) {
    const saved = await writeRecordOnly(owner, w.id, {kind: 'entry', logicalDay: w.logicalDay, body: w.body, source: {type: 'planner', ref: `flow:${w.flow}`, confirmed: true}}).catch(() => null);
    if (saved) await run(owner, saved, [...chain, w.flow]);
  }
}
// 항목마다 rules (a wish that opens when its own 상황 is met) look again after any write: a task done, focus logged…
// The planner, when open, runs them too and shows the sparkle; done here, they also happen when Claude made the write.
async function items(owner: string, record: AnyRecord) {
  if (!record.logicalDay || record.source?.ref?.startsWith('flow:')) return;
  const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
  const logic = Logic.safeParse(spec?.logic ?? {});
  if (!logic.success) return;
  const flows = logic.data.flows.filter(f => f.enabled && f.on.kind === 'item');
  if (!flows.length) return;
  const records = await allRecords(owner);
  for (const f of flows) for (const w of runItems(f, logic.data, records, record.logicalDay).writes)
    await writeRecordOnly(owner, w.id, {kind: 'entry', logicalDay: w.logicalDay, body: w.body, ...(w.baseRevision !== undefined ? {baseRevision: w.baseRevision} : {}), source: {type: 'planner', ref: `flow:${w.flow}`, confirmed: true}}).catch(() => null);
}
onAfterWrite(async (owner, record) => {
  await run(owner, record, record.source?.ref?.startsWith('flow:') ? [record.source.ref.slice(5)] : []);
  await items(owner, record);
});

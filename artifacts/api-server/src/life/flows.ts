import type {AnyRecord} from '@workspace/life-contract';
import {Logic, runFlows, type PlannerSpec} from '@workspace/planner-spec';
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
onAfterWrite((owner, record) => run(owner, record, record.source?.ref?.startsWith('flow:') ? [record.source.ref.slice(5)] : []));

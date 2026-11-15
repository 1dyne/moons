import type {AnyRecord} from '@workspace/life-contract';
import {Logic, recordWrite, runFlows, runItems, setSystemZone, type FlowWrite, type PlannerSpec} from '@workspace/planner-spec';
import {allRecords, getSettings, getSpec, onAfterWrite, writeRecordOnly} from './store.ts';

// Automations between widgets (docs/lit/BLOCKS.md §4) run here, after every write, whoever wrote it
// (the planner on any device, Claude through the connector). Data actions are applied on the server; 'notify' is shown
// by the screen that made the write. A chain of automations never runs the same flow twice, and stops at 6 steps.
// A rule's write lands on its own record: a DB item as an entry, a 할 일/목표 item as a change to that task or goal.
async function save(owner: string, w: FlowWrite, records: AnyRecord[], boundary: number) {
  const rw = recordWrite(w, records, boundary);
  return writeRecordOnly(owner, w.id, {...rw, source: {type: 'planner', ref: `flow:${w.flow}`, confirmed: true}}).catch(() => null);
}
async function zone(owner: string) { const s = await getSettings(owner); setSystemZone(s.tz); return Number(s.dayBoundary.slice(0, 2)) || 4; }
async function run(owner: string, record: AnyRecord, chain: string[]) {
  if (!['entry', 'task', 'goal'].includes(record.kind) || chain.length >= 6) return;
  const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
  const logic = Logic.safeParse(spec?.logic ?? {});
  if (!logic.success || !logic.data.flows.length) return;
  const boundary = await zone(owner), records = await allRecords(owner);
  const {writes} = runFlows(logic.data, records, record, {day: record.logicalDay ?? '', chain});
  for (const w of writes) {
    const saved = await save(owner, w, records, boundary);
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
  const boundary = await zone(owner), records = await allRecords(owner);
  for (const f of flows) for (const w of runItems(f, logic.data, records, record.logicalDay).writes) await save(owner, w, records, boundary);
}
onAfterWrite(async (owner, record) => {
  await run(owner, record, record.source?.ref?.startsWith('flow:') ? [record.source.ref.slice(5)] : []);
  await items(owner, record);
});

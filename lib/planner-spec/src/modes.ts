import {z} from 'zod';
import type {AnyRecord} from '@workspace/life-contract';
import {Widget} from './canvas.ts';
import type {Logic} from './logic.ts';

// Modes (docs/lit/MODES.md): the day page changes with the situation. A mode turns on by itself when today's latest
// energy is at or below its threshold (or by hand), and changes how tasks are run and, if it has one, which page is shown.
//   taskStyle 'plan' — the usual to-do list.
//   taskStyle 'did'  — 한 일 방식 (에너지 긴축모드): every unfinished task shows as 희망사항 (grey), finishing one colours it as 한 일,
//                      and what is written is written as already done. Only the display changes; the tasks themselves stay as they are.
export const Mode = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  name: z.string().trim().min(1).max(30),
  energyAtOrBelow: z.number().int().min(1).max(10).nullable().default(null),
  taskStyle: z.enum(['plan', 'did']).default('did'),
  // Its own day page (the user's second template). Absent = the usual day page.
  widgets: z.array(Widget).max(80).optional(),
});
export type Mode = z.infer<typeof Mode>;

type Rec = AnyRecord & {body: Record<string, unknown>};
/** Today's latest energy score (1–10) from any source: condition checks, the score left when a timer stops,
 *  and entries of a condition type (or the first score field of a type made from condition records). */
export function currentEnergy(records: AnyRecord[], logic: Logic | undefined, day: string): {score: number; at: string} | null {
  let best: {score: number; at: string} | null = null;
  const take = (score: unknown, at: unknown) => { if (typeof score === 'number' && typeof at === 'string' && (!best || at > best.at)) best = {score, at}; };
  const scoreField = new Map((logic?.types ?? []).map(t => [t.id, t.from === 'condition' || /컨디션|에너지/.test(t.name) ? t.fields.find(f => f.kind === 'score')?.id : undefined]));
  for (const r of records as Rec[]) {
    if (r.deletedAt || r.logicalDay !== day) continue;
    if (r.kind === 'condition') take(r.body.energy, r.body.at);
    else if (r.kind === 'session' && r.body.end) take(r.body.condition, r.body.end);
    else if (r.kind === 'entry') { const f = scoreField.get(r.body.type as string); if (f) take((r.body.fields as Record<string, unknown>)[f], r.body.at); }
  }
  return best;
}
/** The mode in force: the user's choice for the day if they made one ('off' = none), else the first mode whose threshold the energy meets. */
export function activeMode(modes: Mode[], energy: number | null, override: string | null | undefined): Mode | null {
  if (override === 'off') return null;
  if (override) return modes.find(m => m.id === override) ?? null;
  if (energy === null) return null;
  return modes.find(m => m.energyAtOrBelow !== null && energy <= m.energyAtOrBelow) ?? null;
}

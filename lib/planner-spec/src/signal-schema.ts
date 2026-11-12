import {z} from 'zod';
import {AGGS, type Agg} from './agg.ts';

// 상황 (docs/lit/BLOCKS.md §4): things about the user's day that lit computes from every record — focus time, tasks,
// goals, the mission, energy, any DB. A wish opens when its 상황 is met; an automation can start or check on one.
export const SIGNALS = [
  {kind: 'focus', name: '오늘 순집중', unit: '시간', needs: 'n'},
  {kind: 'tasksAll', name: '오늘 할 일 다 끝내기', unit: '', needs: ''},
  {kind: 'tasksBy', name: '오늘 할 일을 정한 시각 전에 다 끝내기', unit: '', needs: 'at'},
  {kind: 'tasksDone', name: '오늘 끝낸 할 일', unit: '개', needs: 'n'},
  {kind: 'mission', name: '오늘의 미션 달성 (순집중 목표 또는 할 일 전부)', unit: '시간', needs: 'n'},
  {kind: 'goal', name: '목표 진행률', unit: '%', needs: 'goal n'},
  {kind: 'goalDone', name: '목표 이루기', unit: '', needs: 'goal'},
  {kind: 'energyHigh', name: '에너지가 이만큼 이상', unit: '점', needs: 'n'},
  {kind: 'energyLow', name: '에너지가 이만큼 이하', unit: '점', needs: 'n'},
  {kind: 'db', name: 'DB 합계', unit: '', needs: 'db'},
] as const;
export type SignalKind = (typeof SIGNALS)[number]['kind'];
export const Signal = z.object({
  kind: z.enum(SIGNALS.map(s => s.kind) as [SignalKind, ...SignalKind[]]),
  n: z.number().min(0).max(100000).default(1),
  at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('18:00'),
  goalId: z.string().max(40).default(''),
  // DB 합계: which DB, what is counted, over which days.
  type: z.string().max(24).default(''),
  agg: z.enum(AGGS.map(a => a.id) as [Agg, ...Agg[]]).default('count'),
  of: z.string().max(24).default(''),
  period: z.enum(['today', 'week', 'month']).default('today'),
});
export type Signal = z.infer<typeof Signal>;

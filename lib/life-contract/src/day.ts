import type {Routine, Settings} from './records.ts';

/** Local calendar date of an instant in a time zone. */
export function localDate(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function localTime(at: Date, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(at);
}

/** The logical day an instant belongs to: before the day boundary (e.g. 04:00) it is still yesterday. */
export function logicalDay(at: Date | string, settings: Settings) {
  const [h, m] = settings.dayBoundary.split(':').map(Number);
  return localDate(new Date(new Date(at).getTime() - (h! * 60 + m!) * 60_000), settings.tz);
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number) => new Date(asDate(day).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const weekday = (day: string) => asDate(day).getUTCDay();

/** ISO week label of a day, e.g. 2026-W44 (weeks start Monday; week 1 holds January 4). */
export function isoWeek(day: string) {
  const d = asDate(day);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86_400_000);
  const year = thursday.getUTCFullYear(), jan4 = new Date(Date.UTC(year, 0, 4));
  const week1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000;
  return `${year}-W${String(1 + Math.floor((thursday.getTime() - week1) / (7 * 86_400_000))).padStart(2, '0')}`;
}

/** Whether a goal period ('2026', '2026-Q4', '2026-11', '2026-W44') contains a day. */
export function periodContains(period: string, day: string) {
  if (/^\d{4}$/.test(period)) return day.startsWith(period);
  if (/^\d{4}-Q[1-4]$/.test(period)) return day.startsWith(period.slice(0, 4)) && Math.ceil(Number(day.slice(5, 7)) / 3) === Number(period.slice(6));
  if (/^\d{4}-\d{2}$/.test(period)) return day.startsWith(period);
  if (/^\d{4}-W\d{2}$/.test(period)) return isoWeek(day) === period;
  return false;
}
export function periodsOf(day: string) {
  return {year: day.slice(0, 4), quarter: `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`, month: day.slice(0, 7), week: isoWeek(day)};
}

/** Whether a routine is due on a day. */
export function routineDue(r: Routine, day: string) {
  if (!r.active) return false;
  const {freq, byWeekday, byMonthDay} = r.recurrence;
  if (freq === 'daily') return true;
  if (freq === 'weekly') return (byWeekday ?? []).includes(weekday(day));
  return (byMonthDay ?? []).includes(Number(day.slice(8, 10)));
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** ULID: time-ordered, never reused. */
export function ulid(now = Date.now()) {
  let time = '', t = now;
  for (let i = 0; i < 10; i++) { time = ALPHABET[t % 32] + time; t = Math.floor(t / 32); }
  const random = crypto.getRandomValues(new Uint8Array(16));
  return time + Array.from(random, b => ALPHABET[b % 32]).join('');
}

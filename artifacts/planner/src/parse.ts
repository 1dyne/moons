// Quick entry, read locally (no AI): fixed time ranges, estimates and amounts in what the user typed.
/** "10:00-12:00 회의" → a fixed appointment; "보고서 90분" → an estimate. Read locally (no AI). */
export function parseEntry(text: string, day: string) {
  const range = text.match(/(\d{1,2}):(\d{2})\s*[-~–]\s*(\d{1,2}):(\d{2})/);
  // A single clock time at the start ("9:00 수학", "14:30 보고서") is the start time.
  const single = range ? null : text.match(/^\s*(\d{1,2}):(\d{2})(?!\d)/);
  const title = range ? text.replace(range[0], '').trim() : single ? text.slice(single[0].length).trim() : text.trim();
  // Time is the estimate ("보고서 90분", "1세트 60분"); any other count is the amount ("수학 20문제").
  const time = title.match(/(?:예상\s*)?(\d+(?:\.\d+)?)\s*(분|시간)(?![가-힣a-z])/);
  const estimateMin = time ? Math.round(Number(time[1]) * (time[2] === '시간' ? 60 : 1)) : null;
  const clean = time ? title.replace(time[0], '').replace(/\s{2,}/g, ' ').trim() : title;
  const target = parseTarget(clean);
  const at = (h: string, m: string) => ({value: new Date(`${day}T${h.padStart(2, '0')}:${m}:00`).toISOString(), precision: 'minute' as const});
  const ok = (h: string, m: string) => Number(h) < 24 && Number(m) < 60;
  const fixed = range && ok(range[1]!, range[2]!) && ok(range[3]!, range[4]!) ? {start: at(range[1]!, range[2]!), end: at(range[3]!, range[4]!)} : null;
  // time: when the task starts (and ends, for a range). The tasks list places timed tasks by it.
  const when = fixed ?? (single && ok(single[1]!, single[2]!) ? {start: at(single[1]!, single[2]!), end: null} : null);
  return {title: clean || title || text.trim(), target, estimateMin, fixed, time: when};
}
/** "수학 20문제" → a target of 20 문제, read locally (no AI). */
const UNITS = '분|시간|문제|문항|쪽|페이지|p|단어|개|세트|회|번|km|강|챕터|장';
export function parseTarget(text: string) {
  const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})(?![가-힣a-z])`));
  return m ? {amount: Number(m[1]), unit: m[2] === 'p' ? '쪽' : m[2]!} : null;
}

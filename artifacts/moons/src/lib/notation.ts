import {uid} from './model.ts';
import {tr} from './i18n.ts';

// "My symbols": the user's own shorthand, read by MOONS when structuring and comparing.
export type NotationRole = 'gap' | 'memo' | 'section' | 'relation' | 'emphasis' | 'note';
export type Notation = {id: string; symbol: string; meaning: string; role: NotationRole; scope?: {planetIds?: string[]; formIds?: string[]}};

export const roleInfo: Record<NotationRole, {label: string; hint: string}> = {
  gap: {label: tr('Blank to fill'), hint: tr('Marked as “to look up”; can be sent to the planner')},
  memo: {label: tr('My memo'), hint: tr('Kept apart from the content, as my own correction')},
  section: {label: tr('Section title'), hint: tr('Used to group the structure')},
  relation: {label: tr('Relation'), hint: tr('Used to connect the two sides')},
  emphasis: {label: tr('Key term'), hint: tr('Exactly this word matters')},
  note: {label: tr('Meaning only'), hint: tr('MOONS just knows what it means')},
};
export const notationRoles = Object.keys(roleInfo) as NotationRole[];

/** Starting examples, taken from the way MOONS's first user writes. Every row can be edited or removed. */
export const examples = (): Notation[] => [
  {symbol: '[ctrl+F]', meaning: tr('A concept I don’t know yet — find it in the original and fill it in'), role: 'gap'},
  {symbol: '//', meaning: tr('A memo correcting my own wording'), role: 'memo'},
  {symbol: '<…>', meaning: tr('Section title, e.g. <Making> <Evaluation>'), role: 'section'},
  {symbol: '<->', meaning: tr('A property and its matching problem'), role: 'relation'},
  {symbol: 'diff.', meaning: tr('Something different to compare with'), role: 'relation'},
  {symbol: '**…**', meaning: tr('It has to be exactly this word'), role: 'emphasis'},
].map(n => ({...n, id: uid()} as Notation));

export const newNotation = (): Notation => ({id: uid(), symbol: '', meaning: '', role: 'note'});

/** Legend lines like "* [ctrl+F] 는 … 의미" or "* // = …" at the top of a dump: offered as new symbols. */
export function detectLegend(text: string, existing: Notation[]): Notation[] {
  const known = new Set(existing.map(n => n.symbol));
  const out: Notation[] = [];
  for (const line of text.split('\n').slice(0, 8)) {
    // One symbol token, then a spaced separator: "* [ctrl+F] 는 …", "* // = …". "* 시각 <-> 쪼개짐" is content.
    const m = line.match(/^\s*\*\s*(\S+?)\s*(?:는|은|=|:|→)\s+(.+)$/u);
    if (!m) continue;
    const symbol = m[1]!.trim(), meaning = m[2]!.replace(/\s*(?:을|를)?\s*의미(?:함|한다|해요)?\.?$/u, '').trim();
    // A symbol has punctuation in it ([ctrl+F], //, diff.); plain words like "충돌은 …" are content, not a legend.
    if (!symbol || symbol.length > 20 || !/[^\p{L}\p{N}\s]/u.test(symbol) || known.has(symbol) || out.some(o => o.symbol === symbol)) continue;
    out.push({id: uid(), symbol, meaning: meaning || m[2]!.trim(), role: /찾아|채워|모르/.test(meaning) ? 'gap' : 'note'});
  }
  return out;
}

import {splitSentences, uid, type Entry} from './model.ts';
import {tr} from './i18n.ts';

// User-made forms ("my banners"). A form is a list of blocks; filling it creates one entry.
// Only the words the user typed become the entry body (originals stay the user's own words);
// labels, numbers, dates and choices are kept in meta.values.

export const blockKinds = ['text', 'longtext', 'checklist', 'steps', 'estimate', 'date', 'time', 'scale', 'select', 'planet', 'link'] as const;
export type BlockKind = typeof blockKinds[number];
export type FormBlock = {id: string; kind: BlockKind; label: string; required?: boolean; options?: string[]};
export type FormTemplate = {id: string; name: string; icon: string; blocks: FormBlock[]; position: number; source: 'manual' | 'photo'; createdAt: string; updatedAt: string};

// Values per block kind.
export type ChecklistItem = {text: string; done: boolean};
export type BlockValue = string | number | ChecklistItem[] | string[] | null;
export type FormValues = Record<string, BlockValue>;

export const blockInfo: Record<BlockKind, {label: string; hint: string}> = {
  text: {label: tr('Short text'), hint: tr('One line in your own words')},
  longtext: {label: tr('Long text'), hint: tr('A few lines in your own words')},
  checklist: {label: tr('Checklist'), hint: tr('Items you tick off')},
  steps: {label: tr('Steps'), hint: tr('An ordered list, like your usual work order')},
  estimate: {label: tr('Time estimate'), hint: tr('Minutes you expect it to take')},
  date: {label: tr('Date'), hint: ''},
  time: {label: tr('Time'), hint: ''},
  scale: {label: tr('Scale 1–10'), hint: tr('How sure, how much, how hard')},
  select: {label: tr('Choice'), hint: tr('Pick one of your options')},
  planet: {label: tr('Mother planet'), hint: tr('Where this lands in your universe')},
  link: {label: tr('Link'), hint: ''},
};

// Kinds whose typed words become the entry body.
const WORD_KINDS = new Set<BlockKind>(['text', 'longtext', 'checklist', 'steps']);

export function newBlock(kind: BlockKind): FormBlock {
  return {id: uid(), kind, label: blockInfo[kind].label, ...(kind === 'select' ? {options: [tr('Option 1'), tr('Option 2')]} : {})};
}
export function newForm(position: number): FormTemplate {
  const at = new Date().toISOString();
  return {id: uid(), name: '', icon: 'Pencil', blocks: [newBlock('longtext')], position, source: 'manual', createdAt: at, updatedAt: at};
}
export const formsOf = (store: {forms?: FormTemplate[]}) => [...(store.forms ?? [])].sort((a, b) => a.position - b.position);

export function emptyValue(block: FormBlock): BlockValue {
  if (block.kind === 'checklist') return (block.options ?? []).map(text => ({text, done: false}));
  if (block.kind === 'steps') return [...(block.options ?? [])];
  return null;
}

const isBlank = (v: BlockValue) => v === null || v === '' || (Array.isArray(v) && v.every(x => typeof x === 'string' ? !x.trim() : !x.text.trim()));

/** Labels of required blocks that are still empty. */
export function missingRequired(form: FormTemplate, values: FormValues): string[] {
  return form.blocks.filter(b => b.required && isBlank(values[b.id] ?? null)).map(b => b.label);
}

/** Words the user typed, in block order, then the free text. */
export function formWords(form: FormTemplate, values: FormValues, freeText: string): string[] {
  const lines: string[] = [];
  for (const b of form.blocks) {
    if (!WORD_KINDS.has(b.kind)) continue;
    const v = values[b.id];
    if (typeof v === 'string' && v.trim()) lines.push(v.trim());
    if (Array.isArray(v)) for (const x of v) {const t = typeof x === 'string' ? x : x.text; if (t.trim()) lines.push(t.trim());}
  }
  if (freeText.trim()) lines.push(freeText.trim());
  return lines;
}

export function makeFormEntry(form: FormTemplate, values: FormValues, freeText: string): Entry | null {
  const lines = formWords(form, values, freeText);
  const planetIds = form.blocks.filter(b => b.kind === 'planet').map(b => values[b.id]).filter((v): v is string => typeof v === 'string' && !!v);
  const hasAny = lines.length || form.blocks.some(b => !WORD_KINDS.has(b.kind) && !isBlank(values[b.id] ?? null));
  if (!hasAny) return null;
  const body = lines.join('\n');
  const title = (typeof values[form.blocks.find(b => b.kind === 'text')?.id ?? ''] === 'string' && (values[form.blocks.find(b => b.kind === 'text')!.id] as string).trim()) || form.name;
  return {
    id: uid(), kind: 'dump', body, sentences: body ? splitSentences(body) : [], locked: true, status: 'saved',
    createdAt: new Date().toISOString(), planetIds: [...new Set(planetIds)], title,
    meta: {formId: form.id, formName: form.name, values, labels: Object.fromEntries(form.blocks.map(b => [b.id, b.label]))},
  } as Entry;
}

/** Turn an AI photo draft into a form; unknown kinds become long text. Nothing is saved here. */
export function formFromDraft(draft: {name?: string; blocks?: {kind?: string; label?: string; options?: string[]}[]}, position: number): FormTemplate {
  const base = newForm(position);
  const blocks = (draft.blocks ?? []).slice(0, 30).map(b => {
    const kind = (blockKinds as readonly string[]).includes(b.kind ?? '') ? b.kind as BlockKind : 'longtext';
    return {...newBlock(kind), label: (b.label ?? blockInfo[kind].label).slice(0, 80), ...(b.options?.length ? {options: b.options.slice(0, 20).map(o => o.slice(0, 80))} : {})};
  });
  return {...base, name: (draft.name ?? '').slice(0, 40), blocks: blocks.length ? blocks : base.blocks, source: 'photo'};
}

// v9 4.3/4.5: what the toolbar can put into a page — basic blocks, built-in structures and the user's own.
import {newBlock, type Block, type BlockKind, type BlockValues} from './pages.ts';
import {uid} from './model.ts';
import {tr} from './i18n.ts';

export type Structure = {id: string; name: string; level: 'block' | 'page' | 'view'; kind?: string; icon?: string; blocks: Block[]; moonPrompts?: string[]; source: 'builtin' | 'manual' | 'photo' | 'market'; favorite?: boolean; position?: number; updatedAt?: string};
export type Tool = {id: string; label: string; icon: string; tier: 1 | 2 | 3; make: () => Block[]; structure?: Structure; preview: string[]};

const b = <K extends BlockKind>(kind: K, value?: Partial<BlockValues[K]>) => newBlock(kind, value);
export const builtinTools = (): Tool[] => [
  {id: 'heading', label: tr('Heading'), icon: 'Heading', tier: 1, make: () => [b('heading')], preview: ['H']},
  {id: 'text', label: tr('Text'), icon: 'Pilcrow', tier: 1, make: () => [b('text')], preview: ['¶']},
  {id: 'chat', label: tr('Chat'), icon: 'MessagesSquare', tier: 1, make: () => [b('chat')], preview: ['💬']},
  {id: 'table', label: tr('Table'), icon: 'Table', tier: 1, make: () => [b('table')], preview: ['▦']},
  {id: 'file', label: tr('File'), icon: 'Paperclip', tier: 1, make: () => [b('file')], preview: []},
  {id: 'link', label: tr('Link'), icon: 'Link', tier: 1, make: () => [b('link')], preview: []},
  {id: 'canvas', label: tr('Canvas'), icon: 'LayoutDashboard', tier: 1, make: () => [b('canvas')], preview: []},
  {id: 'card', label: tr('Card'), icon: 'RectangleHorizontal', tier: 2, make: () => [b('card')], preview: []},
  {id: 'cloze', label: tr('Cloze'), icon: 'SquareDashed', tier: 2, make: () => [b('cloze')], preview: []},
  {id: 'qcards', label: tr('Question cards'), icon: 'Layers', tier: 2, make: () => [b('qcards')], preview: []},
  {id: 'checklist', label: tr('Checklist'), icon: 'ListChecks', tier: 3, make: () => [b('checklist')], preview: []},
  {id: 'steps', label: tr('Steps'), icon: 'ListOrdered', tier: 3, make: () => [b('steps')], preview: []},
  {id: 'timeline', label: tr('Timeline'), icon: 'GitCommitHorizontal', tier: 3, make: () => [b('timeline')], preview: []},
  {id: 'gallery', label: tr('Gallery'), icon: 'Images', tier: 3, make: () => [b('gallery')], preview: []},
];

/** Built-in structures (v9 4.3 "기본 내 구조"): the user can copy and change them. */
export const builtinStructures = (): Structure[] => [
  {id: 'builtin-error', name: tr('Error note'), level: 'block', icon: 'TriangleAlert', source: 'builtin', blocks: [
    newBlock('fields', {fields: [{label: tr('Problem'), text: ''}, {label: tr('Situation'), text: ''}, {label: tr('Error'), text: ''}, {label: tr('Reason'), text: ''}, {label: tr('Fix'), text: ''}]}),
    newBlock('status', {value: 'open'}), newBlock('log', {items: []})], moonPrompts: [tr('In what situation does this mistake happen?'), tr('What would you check first next time?')]},
  {id: 'builtin-cornell', name: tr('Cornell note'), level: 'block', icon: 'Columns2', source: 'builtin', blocks: [newBlock('fields', {fields: [{label: tr('Cues'), text: ''}, {label: tr('Notes'), text: ''}, {label: tr('Summary'), text: ''}]})]},
  {id: 'builtin-compare', name: tr('Comparison table'), level: 'block', icon: 'Columns3', source: 'builtin', blocks: [newBlock('table', {columns: [tr('Criteria'), 'A', 'B'], rows: [['', '', ''], ['', '', '']]})]},
  {id: 'builtin-dump-error', name: tr('Error dump'), level: 'block', kind: 'chat', icon: 'MessagesSquare', source: 'builtin', blocks: [newBlock('chat', {messages: [], steps: [tr('Which problem was it?'), tr('What was the situation?'), tr('What went wrong?'), tr('Why do you think it happened?'), tr('What will you try next time?')], step: 0})]},
];

export const structureTool = (s: Structure): Tool => ({id: s.id, label: s.name, icon: s.icon ?? 'Shapes', tier: 1, structure: s, preview: [],
  make: () => s.blocks.map(x => ({...structuredClone(x), id: uid(), by: 'user' as const}))});

/** Default toolbar when the user has not chosen (v9 4.6). */
export const DEFAULT_TOOLBAR = ['heading', 'chat', 'table', 'file', 'canvas', 'builtin-error'];

/** A structure keeps the shape and drops the user's words (v9 4.5). */
export function shapeOf(blocks: Block[]): Block[] {
  return blocks.map(x => {
    const v = structuredClone(x.value) as unknown as Record<string, unknown>;
    switch (x.kind) {
      case 'heading': case 'text': case 'cloze': (v as {text: string}).text = x.kind === 'heading' ? (v as {text: string}).text : ''; break;
      case 'fields': (v as BlockValues['fields']).fields.forEach(f => { f.text = ''; }); break;
      case 'table': { const t = v as BlockValues['table']; t.rows = t.rows.slice(0, 1).map(r => r.map(() => '')); break; }
      case 'chat': (v as BlockValues['chat']).messages = []; (v as BlockValues['chat']).step = 0; break;
      case 'log': (v as BlockValues['log']).items = []; break;
      case 'checklist': (v as BlockValues['checklist']).items = (v as BlockValues['checklist']).items.map(i => ({text: i.text, done: false})); break;
      case 'card': (v as BlockValues['card']).front = ''; (v as BlockValues['card']).back = ''; break;
      case 'qcards': (v as BlockValues['qcards']).cards = (v as BlockValues['qcards']).cards.map(c => ({q: c.q, a: ''})); break;
      case 'timeline': (v as BlockValues['timeline']).items = [{date: '', text: ''}]; break;
      case 'canvas': (v as BlockValues['canvas']).items = (v as BlockValues['canvas']).items.map(i => ({...i, text: ''})); break;
      case 'file': case 'link': case 'gallery': return {...x, id: uid(), by: 'user', value: {...newBlock(x.kind).value}} as Block;
    }
    return {...x, id: uid(), by: 'user', value: v} as Block;
  });
}

/** v6 forms become my structures (v9 4.5): words-type blocks become fields, lists stay lists. */
export function formToStructure(f: {id: string; name: string; icon: string; blocks: {kind: string; label: string; options?: string[]}[]}): Structure {
  const blocks: Block[] = [];
  let fields: {label: string; text: string}[] = [];
  const flush = () => { if (fields.length) { blocks.push(newBlock('fields', {fields})); fields = []; } };
  for (const b of f.blocks) {
    if (b.kind === 'checklist') { flush(); blocks.push(newBlock('checklist', {items: (b.options?.length ? b.options : ['']).map(t => ({text: t, done: false}))})); }
    else if (b.kind === 'steps') { flush(); blocks.push(newBlock('steps', {items: b.options?.length ? [...b.options] : ['']})); }
    else if (b.kind === 'planet') continue;
    else fields.push({label: b.label, text: ''});
  }
  flush();
  return {id: `form-${f.id}`, name: f.name || 'Form', level: 'page', icon: f.icon || 'ClipboardList', blocks, source: 'manual'};
}

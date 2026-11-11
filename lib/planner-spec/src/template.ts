// HTML designs for made widgets (docs/lit/BLOCKS.md §5): a small Mustache-like language, no scripts.
//   {{name}}               the value, HTML-escaped        {{{name}}} is never allowed (no raw HTML)
//   {{a.b.c}}              a path into the data
//   {{#each list}}…{{/each}}   repeat; inside, names are read from the item first ({{this}} is the item itself)
//   {{#if x}}…{{else}}…{{/if}} truthy test (an empty list is false)
//   {{icon "moon"}}        an icon from lit's icon set
// Blocks keep working inside a design: <lit-block ref="b1"></lit-block> shows block b1 as it is,
// and any element with data-lit-press="b1" does what block b1's main button does.
export type Data = Record<string, unknown>;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
function get(scopes: unknown[], path: string): unknown {
  if (path === 'this') return scopes[0];
  const parts = path.split('.');
  for (const s of scopes) {
    if (s && typeof s === 'object' && parts[0]! in (s as object)) return parts.reduce<unknown>((v, k) => v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, s);
  }
  return undefined;
}
const truthy = (v: unknown) => Array.isArray(v) ? v.length > 0 : !!v && v !== '0';
type Node = {t: 'text'; s: string} | {t: 'var'; p: string} | {t: 'icon'; n: string} | {t: 'each' | 'if'; p: string; body: Node[]; alt: Node[]};
function parse(src: string): Node[] {
  const re = /\{\{\s*(#each|#if|\/each|\/if|else|icon)?\s*([^}]*?)\s*\}\}/g;
  const root: Node[] = [], stack: {node: Node & {t: 'each' | 'if'}; inAlt: boolean}[] = [];
  const push = (n: Node) => { const top = stack.at(-1); (top ? (top.inAlt ? top.node.alt : top.node.body) : root).push(n); };
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) push({t: 'text', s: src.slice(last, m.index)});
    last = re.lastIndex;
    const [, kw, arg] = m;
    if (src[m.index + 2] === '{') throw new Error('{{{ }}} (raw HTML) is not allowed');
    if (kw === '#each' || kw === '#if') { const node = {t: kw.slice(1) as 'each' | 'if', p: arg!.trim(), body: [], alt: []}; push(node); stack.push({node, inAlt: false}); }
    else if (kw === '/each' || kw === '/if') { const top = stack.pop(); if (!top || top.node.t !== kw.slice(1)) throw new Error(`{{${kw}}} has no opening`); }
    else if (kw === 'else') { const top = stack.at(-1); if (!top) throw new Error('{{else}} outside {{#if}}'); top.inAlt = true; }
    else if (kw === 'icon') push({t: 'icon', n: arg!.replace(/["']/g, '').trim()});
    else push({t: 'var', p: arg!.trim()});
  }
  if (stack.length) throw new Error(`{{#${stack.at(-1)!.node.t}}} is not closed`);
  if (last < src.length) push({t: 'text', s: src.slice(last)});
  return root;
}
function emit(nodes: Node[], scopes: unknown[], icon: (n: string) => string): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.s;
    else if (n.t === 'var') out += esc(get(scopes, n.p));
    else if (n.t === 'icon') out += icon(n.n);
    else if (n.t === 'if') out += emit(truthy(get(scopes, n.p)) ? n.body : n.alt, scopes, icon);
    else { const list = get(scopes, n.p); if (Array.isArray(list) && list.length) for (const item of list.slice(0, 500)) out += emit(n.body, [item, ...scopes], icon); else out += emit(n.alt, scopes, icon); }
  }
  return out;
}
/** Fills a template. Throws with a readable message when the template is malformed. */
export function renderTemplate(src: string, data: Data, icon: (name: string) => string = () => ''): string {
  return emit(parse(src), [data], icon);
}
/** Problems with a template, for the editor ('' when fine). */
export function checkTemplate(src: string): string {
  try { parse(src); return ''; } catch (e) { return (e as Error).message; }
}
/** CSS a design may use: no imports, no outside addresses (a stylesheet could otherwise send data out through url()). */
export function cleanCss(css: string): string {
  return css.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)(?!data:image\/)[^)]*\1\s*\)/gi, 'none').replace(/expression\s*\(/gi, '(').replace(/behavior\s*:/gi, 'x:');
}

import type {Mark} from './pages.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = (h?: string) => { try { const u = new URL(h ?? '', 'https://x.invalid'); return /^(https?|mailto):$/.test(u.protocol) ? h! : '#'; } catch { return '#'; } };

/** Text + mark ranges → the HTML a text block shows (only mark, b and a; everything else is text). */
export function marksToHtml(text: string, marks: Mark[] = []): string {
  const cuts = new Set([0, text.length]);
  for (const m of marks) { cuts.add(Math.max(0, Math.min(text.length, m.start))); cuts.add(Math.max(0, Math.min(text.length, m.end))); }
  const pts = [...cuts].sort((a, b) => a - b);
  let html = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!; if (a === b) continue;
    let seg = esc(text.slice(a, b)).replace(/\n/g, '<br>');
    const on = marks.filter(m => m.start <= a && m.end >= b);
    for (const m of on) seg = m.type === 'hl' ? `<mark>${seg}</mark>` : m.type === 'b' ? `<b>${seg}</b>` : `<a href="${esc(safeHref(m.href))}" target="_blank" rel="noreferrer noopener">${seg}</a>`;
    html += seg;
  }
  return text.endsWith('\n') ? html + '<br>' : html;
}

/** Toggle a mark over [start,end): removes it where it already covers, adds it otherwise. Adjacent same marks merge. */
export function toggleMark(marks: Mark[], start: number, end: number, type: Mark['type'], href?: string): Mark[] {
  if (end <= start) return marks;
  const same = marks.filter(m => m.type === type), other = marks.filter(m => m.type !== type);
  const covered = same.some(m => m.start <= start && m.end >= end);
  let next: Mark[] = [];
  if (covered) {
    for (const m of same) {
      if (m.end <= start || m.start >= end) { next.push(m); continue; }
      if (m.start < start) next.push({...m, end: start});
      if (m.end > end) next.push({...m, start: end});
    }
  } else {
    next = [...same.filter(m => m.end < start || m.start > end), {type, start: Math.min(start, ...same.filter(m => !(m.end < start || m.start > end)).map(m => m.start)), end: Math.max(end, ...same.filter(m => !(m.end < start || m.start > end)).map(m => m.end)), ...(href ? {href} : {})}];
  }
  return [...other, ...next].sort((a, b) => a.start - b.start);
}

/** Read a contentEditable element back into text + marks. */
export function domToMarks(root: Node, keepTrailing = false): {text: string; marks: Mark[]} {
  let text = ''; const marks: Mark[] = [];
  const walk = (node: Node, active: {type: Mark['type']; href?: string}[]) => {
    if (node.nodeType === 3) { text += node.nodeValue ?? ''; return; }
    if (node.nodeType !== 1) return;
    const el = node as Element, tag = el.tagName;
    if (tag === 'BR') { text += '\n'; return; }
    const block = (tag === 'DIV' || tag === 'P') && node !== root;
    if (block && text && !text.endsWith('\n')) text += '\n';
    const type: Mark['type'] | null = tag === 'MARK' ? 'hl' : tag === 'B' || tag === 'STRONG' ? 'b' : tag === 'A' ? 'link' : null;
    const start = text.length;
    const next = type ? [...active, {type, href: tag === 'A' ? el.getAttribute('href') ?? undefined : undefined}] : active;
    el.childNodes.forEach(c => walk(c, next));
    if (type && text.length > start) marks.push({type, start, end: text.length, ...(type === 'link' ? {href: el.getAttribute('href') ?? undefined} : {})});
  };
  root.childNodes.forEach(c => walk(c, []));
  if (!keepTrailing && text.endsWith('\n')) text = text.slice(0, -1);
  return {text, marks: marks.reduce<Mark[]>((acc, m) => toggleMark(acc.filter(x => !(x.type === m.type && x.start === m.start && x.end === m.end)), m.start, m.end, m.type, m.href), [])};
}

/** Shift marks after an edit that replaced [at, at+removed) with `added` characters. */
export function shiftMarks(marks: Mark[], at: number, removed: number, added: number): Mark[] {
  const d = added - removed;
  return marks.map(m => ({...m, start: m.start >= at + removed ? m.start + d : Math.min(m.start, at + added), end: m.end > at ? Math.max(at + added, m.end + d) : m.end})).filter(m => m.end > m.start);
}

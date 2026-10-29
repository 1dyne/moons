// PDF materials (v7 6.4): the extracted text is the original. Headings, sections and page numbers are kept;
// each sentence remembers its page. A PDF with no text layer (a scan) is refused for now.
import {splitSentences} from '../../thought.ts';
import {WorkspaceError} from './types.ts';

type Line = {text: string; size: number; page: number; y: number};
type TextItem = {str: string; transform: number[]; width: number; height: number; hasEOL?: boolean};

const compact = (s: string) => s.replace(/\s+/g, ' ').trim();
const pageNumberLike = (s: string) => /^(?:page\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(?:\s*\/\s*\d{1,4})?$/i.test(s);

/** Lines of a page: items on the same baseline joined, with the largest font size on the line. */
function pageLines(items: TextItem[], page: number): Line[] {
  const rows: {y: number; parts: {x: number; w: number; text: string; size: number}[]}[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5]!, x = it.transform[4]!, size = Math.abs(it.transform[3]!) || it.height || 0;
    let row = rows.find(r => Math.abs(r.y - y) < Math.max(2, size * 0.35));
    if (!row) { row = {y, parts: []}; rows.push(row); }
    row.parts.push({x, w: it.width || 0, text: it.str, size});
  }
  return rows.sort((a, b) => b.y - a.y).map(r => {
    const parts = r.parts.sort((a, b) => a.x - b.x);
    // A space only where the page leaves a gap: a font change inside a word ("collider의") is not one.
    let text = '';
    parts.forEach((p, i) => { const prev = parts[i - 1]; text += prev && p.x - (prev.x + prev.w) > p.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(p.text) ? ` ${p.text}` : p.text; });
    return {text: compact(text), size: Math.max(...parts.map(p => p.size)), page, y: r.y};
  }).filter(l => l.text);
}

export async function extractPdf(data: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0}).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...pageLines(content.items as TextItem[], p));
    page.cleanup();
  }
  const meta = await doc.getMetadata().catch(() => null);
  const pages = doc.numPages;
  await doc.destroy();
  const chars = lines.reduce((n, l) => n + l.text.length, 0);
  if (chars < Math.max(40, pages * 20)) throw new WorkspaceError(422, 'This PDF has no text layer (a scan). Reading scans comes later.');
  // Running heads and feet: the same line on many pages, and bare page numbers.
  const seen = new Map<string, Set<number>>();
  for (const l of lines) { const k = l.text.replace(/\d+/g, '#'); seen.set(k, (seen.get(k) ?? new Set()).add(l.page)); }
  const running = (l: Line) => pages >= 3 && (seen.get(l.text.replace(/\d+/g, '#'))?.size ?? 0) >= Math.max(3, pages * 0.5);
  const kept = lines.filter(l => !pageNumberLike(l.text) && !running(l));
  // The body size is the most common size by characters; clearly larger short lines are headings.
  const bySize = new Map<number, number>();
  for (const l of kept) { const s = Math.round(l.size * 2) / 2; bySize.set(s, (bySize.get(s) ?? 0) + l.text.length); }
  const body = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const heading = (l: Line) => l.size >= body * 1.15 && l.text.length <= 120 && !/[.。,]$/.test(l.text);
  // Paragraphs: body lines run together (a hyphen at a line end joins the word); headings stand alone.
  const blocks: {text: string; page: number; heading: boolean}[] = [];
  let prev: Line | undefined;
  for (const l of kept) {
    const last = blocks[blocks.length - 1], h = heading(l), gap = prev && prev.page === l.page ? prev.y - l.y : 0;
    prev = l;
    // A wider gap than the line spacing starts a paragraph.
    if (h || !last || last.heading || gap > l.size * 1.9) { blocks.push({text: l.text, page: l.page, heading: h}); continue; }
    if (/[.!?。:]$|[다요]\.?$/.test(last.text) && /^[A-Z가-힣0-9(•\-–·]/.test(l.text) && l.text.length < 60 && last.text.length < 60) { blocks.push({text: l.text, page: l.page, heading: false}); continue; }
    last.text = /[A-Za-z]-$/.test(last.text) ? last.text.slice(0, -1) + l.text : `${last.text} ${l.text}`;
  }
  const text = blocks.map(b => b.text).join('\n');
  // Each sentence takes the page where it starts.
  const starts: {at: number; page: number}[] = [];
  let at = 0;
  for (const b of blocks) { starts.push({at, page: b.page}); at += b.text.length + 1; }
  const sentences = splitSentences(text);
  let cursor = 0;
  const sentencePages = sentences.map(s => {
    const i = text.indexOf(s, cursor);
    if (i >= 0) cursor = i + s.length;
    const pos = i >= 0 ? i : cursor;
    let page = 1;
    for (const st of starts) if (st.at <= pos) page = st.page;
    return page;
  });
  const info = (meta?.info ?? {}) as {Title?: string};
  const title = compact(info.Title ?? '') || blocks.find(b => b.heading)?.text || '';
  return {text, title: title.slice(0, 200), pages, sentencePages};
}

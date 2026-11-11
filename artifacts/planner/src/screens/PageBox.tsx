import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {LifeRecord, Note, PageBlock} from '@workspace/life-contract';
import type {Widget} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import {useL} from '../labels.tsx';
import type {Ctx} from './day.ts';
import {patchWidget} from './Table.tsx';

// ── 메모·소원 상자 ────────────────────────────────────────────────────────────
// Like a Notion button: tap the icon → a card asks → 이동 opens a new page the user decorates freely.
// Each page is one record (note, signifier 'entry', table = this widget's id), so it is stored like a database row,
// but the front shows the pages themselves as little decorated cards, never a table.
export const BOX_ICONS: Record<string, {glyph: string; name: string}> = {
  memo: {glyph: '📝', name: '메모장'}, mail: {glyph: '📮', name: '우체통'}, box: {glyph: '📦', name: '상자'},
  bowl: {glyph: '🥣', name: '소원 그릇'}, moon: {glyph: '🌙', name: '달'}, gift: {glyph: '🎁', name: '선물'}, star: {glyph: '⭐', name: '별'},
};
export const boxGlyph = (w: Widget) => BOX_ICONS[String(w.options.icon ?? 'memo')]?.glyph ?? String(w.options.icon ?? '📝');
const BG = ['#ffffff', '#fff6d6', '#fde4ec', '#e4f1ff', '#e6f5e9', '#efe8ff', '#f3ede4', '#1f2433'];
const INK = ['#2d2f2a', '#d0342c', '#3a66b8', '#2f9585', '#e9a317', '#7b6bc4', '#8a8a84'];
const STICKERS = ['🌙', '⭐', '✨', '🌸', '🍀', '💌', '🎀', '☁️', '🔥', '💡', '📌', '🫧'];
const KINDS: [PageBlock['type'], string][] = [['text', '글'], ['h', '제목'], ['check', '체크'], ['quote', '인용'], ['divider', '구분선'], ['sticker', '스티커']];
const bid = () => Math.random().toString(36).slice(2, 10);
const block = (type: PageBlock['type'], text = ''): PageBlock => ({id: bid(), type, text, checked: false, color: null, align: type === 'sticker' ? 'center' : 'left'});
type Template = {blocks?: PageBlock[]; bg?: string | null; icon?: string | null};

export function PageBox({w, ctx}: {w: Widget; ctx: Ctx}) {
  const L = useL(), glyph = boxGlyph(w);
  const pages = ofKind(ctx.p.records, 'note').filter(n => n.body.signifier === 'entry' && n.body.table === w.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [ask, setAsk] = useState(false), [title, setTitle] = useState(''), [openId, setOpenId] = useState<string | null>(null);
  const tpl = (w.options.template as Template | undefined) ?? {};
  const go = async () => {
    setAsk(false);
    const r = await ctx.p.write(null, {kind: 'note', logicalDay: ctx.day, body: {text: '', signifier: 'entry', table: w.id, title: title.trim() || null, icon: tpl.icon ?? null, bg: tpl.bg ?? null,
      blocks: (tpl.blocks ?? [block('text')]).map(b => ({...b, id: bid()}))} satisfies Partial<Note>});
    setTitle('');
    if (r) setOpenId(r.id);
  };
  const open = pages.find(x => x.id === openId);
  const cards = w.options.display !== 'icon';
  return <div className="pbox">
    <button className="pbox-icon" onClick={() => setAsk(true)} aria-label={`${w.title || BOX_ICONS[String(w.options.icon ?? 'memo')]?.name || '상자'} 새 페이지`}><span aria-hidden="true">{glyph}</span>{pages.length > 0 && <em>{pages.length}</em>}</button>
    {cards && pages.length > 0 && <ul className="pbox-cards">{pages.map(pg => <li key={pg.id}>
      <button className={`pbox-card ${pg.body.cells.done ? 'done' : ''}`} style={pg.body.bg ? {background: pg.body.bg, color: dark(pg.body.bg) ? '#f4f1ea' : undefined} : undefined} onClick={() => setOpenId(pg.id)}>
        <span className="pc-icon" aria-hidden="true">{pg.body.icon || glyph}</span>
        <b>{pg.body.title || '제목 없음'}</b>
        <span className="pc-line">{firstLine(pg.body.blocks)}</span>
        {pg.body.cells.done ? <i className="pc-done" aria-label="이뤄짐">✓</i> : null}
      </button></li>)}</ul>}
    {!cards && pages.length > 0 && <ul className="pbox-list">{pages.map(pg => <li key={pg.id}><button className="link" onClick={() => setOpenId(pg.id)}>{pg.body.icon || glyph} {pg.body.title || '제목 없음'}</button></li>)}</ul>}
    {ask && createPortal(<div className="pbox-ask-wrap" onClick={e => { if (e.target === e.currentTarget) setAsk(false); }}>
      <form className="pbox-ask" role="dialog" aria-label={L('ask', '새 페이지를 만들까요?')} onSubmit={e => { e.preventDefault(); void go(); }}>
        <span className="pa-icon" aria-hidden="true">{glyph}</span>
        <p>{L('ask', '새 페이지를 만들까요?')}</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목" aria-label="제목" maxLength={200} autoFocus />
        <div className="inline"><button className="primary">{L('go', '이동')}</button><button type="button" className="ghost" onClick={() => setAsk(false)}>{L('cancel', '취소')}</button></div>
      </form>
    </div>, document.body)}
    {open && createPortal(<PageEditor rec={open} ctx={ctx} glyph={glyph} close={() => setOpenId(null)}
      saveTemplate={ctx.saveSpec ? t => void ctx.saveSpec!(s => patchWidget(s, w.id, x => ({...x, options: {...x.options, template: t}}))) : undefined} />, document.body)}
  </div>;
}

const firstLine = (blocks: PageBlock[]) => blocks.find(b => b.type !== 'divider' && b.type !== 'sticker' && b.text.trim())?.text.split('\n')[0]?.slice(0, 60) ?? '';
const dark = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110; };

/** A page to decorate: title, emoji, paper colour and blocks the user adds, moves, colours and removes. Saves as they type. */
function PageEditor({rec, ctx, glyph, close, saveTemplate}: {rec: LifeRecord<'note'>; ctx: Ctx; glyph: string; close: () => void; saveTemplate?: (t: Template) => void}) {
  const [d, setD] = useState(() => ({title: rec.body.title ?? '', icon: rec.body.icon, bg: rec.body.bg, blocks: rec.body.blocks.length ? rec.body.blocks : [block('text')], done: rec.body.cells.done === true}));
  const [focus, setFocus] = useState<string | null>(null), [picker, setPicker] = useState(false), [kept, setKept] = useState(false);
  const dirty = useRef(false), latest = useRef(d);
  latest.current = d;
  const save = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const cur = ofKind(ctx.p.records, 'note').find(x => x.id === rec.id) ?? rec, v = latest.current;
    void ctx.p.write(rec.id, {kind: 'note', logicalDay: cur.logicalDay, body: {...cur.body, title: v.title.trim() || null, icon: v.icon, bg: v.bg, blocks: v.blocks, text: v.blocks.map(b => b.text).filter(Boolean).join('\n').slice(0, 5000), cells: {...cur.body.cells, done: v.done}}, baseRevision: cur.revision});
  };
  useEffect(() => { const t = setTimeout(save, 700); return () => clearTimeout(t); }, [d]);
  useEffect(() => () => save(), []);
  const put = (patch: Partial<typeof d>) => { dirty.current = true; setD(x => ({...x, ...patch})); };
  const setBlock = (id: string, patch: Partial<PageBlock>) => put({blocks: d.blocks.map(b => b.id === id ? {...b, ...patch} : b)});
  const insert = (after: string | null, b: PageBlock) => { const i = after ? d.blocks.findIndex(x => x.id === after) + 1 : d.blocks.length; const next = [...d.blocks]; next.splice(i, 0, b); put({blocks: next}); setFocus(b.id); };
  const moveBlock = (id: string, by: number) => { const i = d.blocks.findIndex(x => x.id === id), j = i + by; if (j < 0 || j >= d.blocks.length) return; const next = [...d.blocks]; [next[i], next[j]] = [next[j]!, next[i]!]; put({blocks: next}); };
  const removeBlock = (id: string) => put({blocks: d.blocks.filter(b => b.id !== id)});
  const shut = () => { save(); close(); };
  const ink = d.bg && dark(d.bg) ? '#f4f1ea' : undefined;
  return <div className="page-wrap" role="dialog" aria-label={d.title || '새 페이지'} onKeyDown={e => { if (e.key === 'Escape') shut(); }}>
    <div className="page-sheet" style={{background: d.bg ?? undefined, color: ink}}>
      <header className="page-bar">
        <button className="ghost" onClick={shut} aria-label="닫기">←</button>
        <span className="page-tools">
          <button className="ghost small" onClick={() => setPicker(!picker)} aria-expanded={picker}>꾸미기</button>
          <label className="row-check small"><input type="checkbox" checked={d.done} onChange={e => put({done: e.target.checked})} /> 이뤄짐</label>
          {saveTemplate && <button className="ghost small" onClick={() => { saveTemplate({blocks: d.blocks.map(b => ({...b, checked: false})), bg: d.bg, icon: d.icon}); setKept(true); }}>{kept ? '틀로 저장됨' : '새 페이지 틀로'}</button>}
          <button className="ghost small danger" onClick={() => { if (confirm('이 페이지를 지울까요?')) { dirty.current = false; void ctx.p.remove(rec.id); close(); } }}>지우기</button>
        </span>
      </header>
      {picker && <div className="page-picker">
        <span className="muted small">아이콘</span>
        <div className="swatches">{[glyph, ...STICKERS].map(g => <button key={g} className={`emoji-btn ${(d.icon ?? glyph) === g ? 'on' : ''}`} onClick={() => put({icon: g === glyph ? null : g})}>{g}</button>)}
          <input className="emoji-in" maxLength={4} value={d.icon ?? ''} onChange={e => put({icon: e.target.value || null})} aria-label="아이콘 직접 넣기" /></div>
        <span className="muted small">종이 색</span>
        <div className="swatches">{BG.map(c => <button key={c} className={`swatch ${d.bg === c ? 'on' : ''}`} style={{background: c}} onClick={() => put({bg: c === '#ffffff' ? null : c})} aria-label={`종이 ${c}`} />)}
          <input type="color" value={d.bg ?? '#ffffff'} onChange={e => put({bg: e.target.value})} aria-label="종이 색 고르기" /></div>
      </div>}
      <div className="page-head"><span className="page-icon" aria-hidden="true">{d.icon || glyph}</span>
        <input className="page-title" value={d.title} onChange={e => put({title: e.target.value})} placeholder="제목 없음" aria-label="제목" maxLength={200} /></div>
      <div className="page-blocks">{d.blocks.map((b, i) => <div key={b.id} className={`pb pb-${b.type} ${b.checked ? 'checked' : ''} ${focus === b.id ? 'focus' : ''}`} style={{color: b.color ?? undefined, textAlign: b.align}} onFocus={() => setFocus(b.id)}>
        {b.type === 'divider' ? <hr /> : b.type === 'check' ? <label className="pb-check"><input type="checkbox" checked={b.checked} onChange={e => setBlock(b.id, {checked: e.target.checked})} />
            <input value={b.text} onChange={e => setBlock(b.id, {text: e.target.value})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insert(b.id, block('check')); } }} aria-label="체크 항목" autoFocus={focus === b.id} /></label>
          : b.type === 'h' ? <input className="pb-h" value={b.text} onChange={e => setBlock(b.id, {text: e.target.value})} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insert(b.id, block('text')); } }} aria-label="제목 줄" autoFocus={focus === b.id} />
          : b.type === 'sticker' ? <input className="pb-sticker" value={b.text} onChange={e => setBlock(b.id, {text: e.target.value})} maxLength={8} aria-label="스티커" autoFocus={focus === b.id} />
          : <Grow value={b.text} onChange={v => setBlock(b.id, {text: v})} label={b.type === 'quote' ? '인용' : '글'} focus={focus === b.id} />}
        {focus === b.id && <div className="pb-tools" role="toolbar" aria-label="블록 도구">
          <select value={b.type} onChange={e => setBlock(b.id, {type: e.target.value as PageBlock['type']})} aria-label="블록 종류">{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          {b.type === 'sticker' && STICKERS.slice(0, 6).map(g => <button key={g} className="emoji-btn" onClick={() => setBlock(b.id, {text: g})}>{g}</button>)}
          {b.type !== 'divider' && INK.map(c => <button key={c} className={`swatch sm ${b.color === c ? 'on' : ''}`} style={{background: c}} onClick={() => setBlock(b.id, {color: c === INK[0] ? null : c})} aria-label={`글자색 ${c}`} />)}
          {b.type !== 'divider' && (['left', 'center', 'right'] as const).map(a => <button key={a} className={`ghost small ${b.align === a ? 'on' : ''}`} onClick={() => setBlock(b.id, {align: a})} aria-label={{left: '왼쪽', center: '가운데', right: '오른쪽'}[a]}>{{left: '⇤', center: '↔', right: '⇥'}[a]}</button>)}
          <button className="ghost small" disabled={i === 0} onClick={() => moveBlock(b.id, -1)} aria-label="위로">↑</button>
          <button className="ghost small" disabled={i === d.blocks.length - 1} onClick={() => moveBlock(b.id, 1)} aria-label="아래로">↓</button>
          <button className="ghost small danger" onClick={() => removeBlock(b.id)} aria-label="블록 지우기">×</button>
        </div>}
      </div>)}</div>
      <div className="page-add" role="group" aria-label="블록 추가">{KINDS.map(([k, n]) => <button key={k} className="small" onClick={() => insert(focus, block(k, k === 'sticker' ? '🌙' : ''))}>+ {n}</button>)}</div>
    </div>
  </div>;
}

/** A textarea that grows with what is written. */
function Grow({value, onChange, label, focus}: {value: string; onChange: (v: string) => void; label: string; focus: boolean}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={e => onChange(e.target.value)} aria-label={label} autoFocus={focus} />;
}

import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {WIDGET_LABELS, widgetInfo, type PlannerSpec, type Widget} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import type {Ctx} from './day.ts';
import {patchWidget} from './Table.tsx';
import {WidgetOptions} from './WidgetOptions.tsx';

/** A widget's settings, opened from ⚙ or by tapping the widget twice (anywhere that is not a button, a field or editable text).
 *  Returns the ⚙ button, the panel (when open) and the pointer handler to put on the widget. */
export function useWidgetSettings(w: Widget, ctx: Ctx) {
  const [open, setOpen] = useState(false);
  const last = useRef<{t: number; x: number; y: number} | null>(null);
  if (!ctx.saveSpec) return {gear: null, panel: null, tap: undefined};
  const tap = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,textarea,select,a,label,.editable,.inline-edit,[role=button],[contenteditable]')) { last.current = null; return; }
    const now = {t: e.timeStamp, x: e.clientX, y: e.clientY}, prev = last.current;
    if (prev && now.t - prev.t < 350 && Math.hypot(now.x - prev.x, now.y - prev.y) < 24) { last.current = null; setOpen(true); }
    else last.current = now;
  };
  const gear = <button className="wg-gear" onClick={e => { e.stopPropagation(); setOpen(true); }} aria-label={`${w.title || widgetInfo(w.type).label} 설정`} title="설정 (위젯을 두 번 눌러도 열려요)">⚙</button>;
  const panel = open ? createPortal(<Panel w={w} ctx={ctx} close={() => setOpen(false)} />, document.body) : null;
  return {gear, panel, tap};
}

function Panel({w, ctx, close}: {w: Widget; ctx: Ctx; close: () => void}) {
  const [o, setO] = useState<Record<string, unknown>>(w.options), [title, setTitle] = useState(w.title ?? ''), [busy, setBusy] = useState(false);
  const spec = ctx.spec as PlannerSpec;
  const draft = {...w, options: o};
  const all = [...(spec.canvas?.day ?? []), ...(spec.tabs ?? []).flatMap(t => t.widgets ?? [])];
  const tables = all.filter((x, i) => (x.type === 'table' || x.type === 'wishes') && all.findIndex(y => y.id === x.id) === i).map(x => ({id: x.id, title: x.title || x.id}));
  const labels = WIDGET_LABELS[w.type], cur = (o.labels as Record<string, string> | undefined) ?? {};
  const save = async () => {
    setBusy(true);
    await ctx.saveSpec!(s => patchWidget(s, w.id, x => ({...x, title: title.trim() || undefined, options: o})));
    setBusy(false); close();
  };
  return <div className="gear-wrap" onClick={e => { if (e.target === e.currentTarget) close(); }} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
    <div className="gear-panel" role="dialog" aria-label="위젯 설정">
      <header className="gear-bar"><button className="ghost" onClick={close} aria-label="닫기">←</button><h3>{title.trim() || widgetInfo(w.type).label} 설정</h3>
        <button className="primary small" disabled={busy} onClick={() => void save()}>저장</button></header>
      <label>이름 <input value={title} onChange={e => setTitle(e.target.value)} placeholder={widgetInfo(w.type).label} maxLength={40} /></label>
      <WidgetOptions w={draft} opt={(k, v) => setO(x => ({...x, [k]: v}))} goals={ofKind(ctx.p.records, 'goal').map(g => ({id: g.id, title: g.body.title}))} props={spec.props?.task ?? []} tables={tables} />
      {labels && <details className="ed-labels"><summary>버튼·칸 문구</summary>
        {labels.map(l => <label key={l.key}>{l.name ?? (l.def || '(빈 칸)')}
          <input value={cur[l.key] ?? ''} placeholder={l.def} maxLength={60} onChange={e => setO(x => ({...x, labels: {...cur, [l.key]: e.target.value}}))} /></label>)}
      </details>}
      <div className="inline"><button className="primary" disabled={busy} onClick={() => void save()}>저장</button><button className="ghost" onClick={close}>취소</button></div>
    </div>
  </div>;
}

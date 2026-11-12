import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Flow, Logic, WIDGET_LABELS, widgetInfo, type PlannerSpec, type Widget} from '@workspace/planner-spec';
import {ofKind} from '../data.ts';
import type {Ctx} from './day.ts';
import {patchWidget} from './Table.tsx';
import {WidgetOptions} from './WidgetOptions.tsx';
import {openStudio} from '../made/Studio.tsx';

/** A widget's settings, opened from ⚙ or by tapping the widget twice (anywhere that is not a button, a field or editable text).
 *  Returns the ⚙ button, the panel (when open) and the pointer handler to put on the widget. */
export function useWidgetSettings(w: Widget, ctx: Ctx) {
  const [open, setOpen] = useState(false);
  const last = useRef<{t: number; x: number; y: number} | null>(null);
  if (!ctx.saveSpec) return {gear: null, panel: null, tap: undefined};
  // A made widget's settings are its studio (logic, blocks, automations, design).
  const show = () => w.type === 'made' ? openStudio({widgetId: w.id}) : setOpen(true);
  const tap = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,textarea,select,a,label,.editable,.inline-edit,[role=button],[contenteditable]')) { last.current = null; return; }
    const now = {t: e.timeStamp, x: e.clientX, y: e.clientY}, prev = last.current;
    if (prev && now.t - prev.t < 350 && Math.hypot(now.x - prev.x, now.y - prev.y) < 24) { last.current = null; show(); }
    else last.current = now;
  };
  const gear = <button className="wg-gear" onClick={e => { e.stopPropagation(); show(); }} aria-label={`${w.title || widgetInfo(w.type).label} 설정`} title="설정 (위젯을 두 번 눌러도 열려요)">⚙</button>;
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
    await ctx.saveSpec!(s => withReceiptFlows(patchWidget(s, w.id, x => ({...x, title: title.trim() || undefined, options: o})), w, o));
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

/** The receipt's popup choices are automations (so they also show in 메뉴 → 로직): one for the day start, one at a time. */
function withReceiptFlows(spec: PlannerSpec, w: Widget, o: Record<string, unknown>): PlannerSpec {
  if (w.type !== 'receipt') return spec;
  const logic = Logic.parse(spec.logic ?? {}), am = `rcs${w.id.replace(/[^a-z0-9]/g, '').slice(-8)}`, pm = `rce${w.id.replace(/[^a-z0-9]/g, '').slice(-8)}`;
  const flows = logic.flows.filter(f => f.id !== am && f.id !== pm);
  if (o.popupStart === true) flows.push(Flow.parse({id: am, name: '영수증: 하루 시작', on: {kind: 'dayStart'}, do: [{do: 'open', what: 'receipt-yesterday'}]}));
  if (typeof o.popupAt === 'string' && o.popupAt) flows.push(Flow.parse({id: pm, name: '영수증: 하루 마침', on: {kind: 'time', at: o.popupAt}, do: [{do: 'open', what: 'receipt-today'}]}));
  return {...spec, logic: {...logic, flows}};
}

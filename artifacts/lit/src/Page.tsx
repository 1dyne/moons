import {useState} from 'react';
import {addDays, v2} from '@workspace/life-contract';
import {title} from '@workspace/lit-core';
import {useLit, newLocalId} from './store.tsx';
import {PartView} from './Parts.tsx';
import {PartEditor} from './PartEditor.tsx';
import {En, Sheet} from './ui.tsx';

export const PART_INFO: Record<v2.PartKind, [string, string, string]> = {
  capture: ['Capture', '빠른 입력', '무엇이든 한 줄. #태그 칸: 값 으로 쓰면 알아듣고 제안해요'],
  checklist: ['Checklist', '체크 목록', '항목마다 달성 단계 체크, 추가·끌어 옮기기·미루기'],
  list: ['List', '목록', '체크 없이 줄로'],
  table: ['Table', '표', '속성을 열로, 칸에서 바로 고치기'],
  gallery: ['Gallery', '카드', '항목을 카드로'],
  cards: ['Unlock cards', '열림 카드', '항목마다 상황이 되면 열려요'],
  calendar: ['Calendar', '달력', '한 달, 항목이 있는 날을 진하게. 누르면 그날로'],
  timegrid: ['Time grid', '10분 칸', '시작·끝이 있는 항목이 저절로 칠해져요 (어느 DB든)'],
  metric: ['Metric', '지표', '개수·합계·평균·끝낸 비율·상황 값 — 숫자·막대·링·신호등'],
  chart: ['Bar chart', '막대 차트', '날마다 집계'],
  breakdown: ['Breakdown', '나눠 보기', '선택 속성별 합계'],
  form: ['Form', '입력 양식', '고른 칸을 채우고 저장하면 한 줄'],
  timestamp: ['Timestamp', '타임스탬프', '누르면 시작, 다시 누르면 끝 (시작·끝 역할 칸에)'],
  timer: ['Timer', '타이머', '정한 시간이 끝나면 기록하고 알려요. 단계를 이어서 반복'],
  rating: ['Rating', '점수', '1~N 중 하나를 누르면 한 줄'],
  counter: ['Counter', '카운터', '+1 할 때마다 한 줄'],
  heading: ['Heading', '제목·문구', '부품 사이의 글'],
};

export function PageView() {
  const {screen, page, saveScreen, today, editing, carried, ws} = useLit();
  const [dayState, setDay] = useState<string | null>(null), [adding, setAdding] = useState<string | null>(null), [editPart, setEditPart] = useState<[string, string] | null>(null);
  const day = dayState ?? today;
  const pg = screen.pages.find(p => p.id === page);
  if (!pg) return <p className="muted center">페이지가 없어요. 위의 + 로 만들어 보세요.</p>;
  const putPage = (next: v2.Page) => saveScreen({...screen, pages: screen.pages.map(p => p.id === pg.id ? next : p)});
  const putWidget = (id: string, f: (w: v2.Widget) => v2.Widget | null) => putPage({...pg, widgets: pg.widgets.flatMap(w => { if (w.id !== id) return [w]; const n = f(w); return n ? [n] : []; })});
  const move = (id: string, d: number) => { const i = pg.widgets.findIndex(w => w.id === id), j = i + d; if (j < 0 || j >= pg.widgets.length) return; const l = [...pg.widgets]; [l[i], l[j]] = [l[j]!, l[i]!]; void putPage({...pg, widgets: l}); };
  return <div className="page">
    <div className="day-nav">
      <button className="ghost" onClick={() => setDay(addDays(day, -1))} aria-label="전날">‹</button>
      <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} aria-label="보이는 날" />
      <button className="ghost" onClick={() => setDay(addDays(day, 1))} aria-label="다음 날">›</button>
      {day !== today && <button className="small" onClick={() => setDay(null)}>오늘</button>}
      {carried && ws.items.get(carried) && <span className="carried small">들고 온 항목 · {title(ws, ws.items.get(carried)!)}</span>}
    </div>
    <div className="widgets">
      {pg.widgets.map(w => <section key={w.id} className={`widget w${w.w} st-${w.style} ${editing ? 'editing' : ''}`} style={w.accent ? {'--accent': w.accent} as React.CSSProperties : undefined}>
        {(w.title || editing) && <header className="widget-h">
          {editing ? <input className="title-in" value={w.title} placeholder="위젯 제목 (비우면 숨김)" onChange={e => void putWidget(w.id, x => ({...x, title: e.target.value}))} /> : <h3>{w.title}</h3>}
          {!editing && <button className="ghost small" onClick={() => void putWidget(w.id, x => ({...x, folded: !x.folded}))} aria-label={w.folded ? '펼치기' : '접기'}>{w.folded ? '▸' : '▾'}</button>}
        </header>}
        {editing && <div className="widget-tools">
          <button className="small" onClick={() => move(w.id, -1)} aria-label="앞으로">←</button>
          <button className="small" onClick={() => move(w.id, 1)} aria-label="뒤로">→</button>
          <button className="small" onClick={() => void putWidget(w.id, x => ({...x, w: Math.max(1, x.w - 1)}))} aria-label="좁게">−</button>
          <span className="small mono">{w.w}/4</span>
          <button className="small" onClick={() => void putWidget(w.id, x => ({...x, w: Math.min(4, x.w + 1)}))} aria-label="넓게">+</button>
          <select value={w.style} onChange={e => void putWidget(w.id, x => ({...x, style: e.target.value as v2.Widget['style']}))} aria-label="모양">{['card', 'line', 'plain', 'filled'].map(s => <option key={s}>{s}</option>)}</select>
          <input type="color" value={w.accent || '#3a66b8'} onChange={e => void putWidget(w.id, x => ({...x, accent: e.target.value}))} aria-label="강조색" />
          <button className="small" onClick={() => setAdding(w.id)}>+ 부품</button>
          <button className="small danger" onClick={() => { if (confirm('위젯을 지울까요? DB와 항목은 그대로예요.')) void putWidget(w.id, () => null); }}>지우기</button>
        </div>}
        {!w.folded && w.parts.map((p, i) => <div key={p.id} className={`part part-${p.kind}`}>
          {editing && <div className="part-tools"><span className="small">{PART_INFO[p.kind][1]} <En>{PART_INFO[p.kind][0]}</En></span>
            <button className="small" onClick={() => setEditPart([w.id, p.id])}>설정</button>
            <button className="small" disabled={i === 0} onClick={() => void putWidget(w.id, x => { const l = [...x.parts]; [l[i - 1], l[i]] = [l[i]!, l[i - 1]!]; return {...x, parts: l}; })}>↑</button>
            <button className="small danger" onClick={() => void putWidget(w.id, x => ({...x, parts: x.parts.filter(y => y.id !== p.id)}))}>✕</button></div>}
          <PartView part={p} day={day} setDay={setDay} />
        </div>)}
        {editing && !w.parts.length && <p className="muted small">부품을 넣어 주세요</p>}
      </section>)}
      {editing && <button className="add-widget" onClick={async () => { const id = newLocalId(); await putPage({...pg, widgets: [...pg.widgets, v2.Widget.parse({id})]}); setAdding(id); }}>+ 위젯 <En>Widget</En></button>}
      {!editing && !pg.widgets.length && <div className="empty-page"><p>빈 페이지예요.</p><p className="muted small">오른쪽 위 <b>편집</b>에서 위젯과 부품을 놓거나, 메뉴 → 템플릿에서 받아 보세요.</p></div>}
    </div>
    {adding && <Sheet title={<span>부품 고르기 <En>Part</En></span>} onClose={() => setAdding(null)}>
      <div className="palette">{(Object.keys(PART_INFO) as v2.PartKind[]).map(k => <button key={k} className="palette-item" onClick={async () => {
        const part = v2.Part.parse({id: newLocalId(), kind: k});
        const wid = adding; setAdding(null);
        await putWidget(wid, x => ({...x, parts: [...x.parts, part]}));
        if (k !== 'heading') setEditPart([wid, part.id]);
      }}><b>{PART_INFO[k][1]} <En>{PART_INFO[k][0]}</En></b><span>{PART_INFO[k][2]}</span></button>)}</div>
    </Sheet>}
    {editPart && (() => {
      const w = pg.widgets.find(x => x.id === editPart[0]), p = w?.parts.find(x => x.id === editPart[1]);
      if (!w || !p) return null;
      return <Sheet wide title={<span>{PART_INFO[p.kind][1]} 설정 <En>{PART_INFO[p.kind][0]}</En></span>} onClose={() => setEditPart(null)}>
        <PartEditor part={p} day={day} onChange={next => void putWidget(w.id, x => ({...x, parts: x.parts.map(y => y.id === p.id ? next : y)}))} />
      </Sheet>;
    })()}
  </div>;
}

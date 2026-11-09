import {useState} from 'react';
import {addDays, efficiency, estimateAccuracy, goalPercent, personaShare, type Settings} from '@workspace/life-contract';
import {ofKind, type Planner} from '../data.ts';
import {hm} from './Focus.tsx';

// Looking back: monthly condition, when focus goes well, how estimates compare, and which persona the days went to.
export function Insights({p, settings, today}: {p: Planner; settings: Settings; today: string}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`, last = addDays(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10), -1);
  // The chart spans the whole month so bars keep their width; days after today are simply empty.
  const e = efficiency(p.records, first, last, settings.tz);
  const est = estimateAccuracy(p.records, first, last < today ? last : today);
  const persona = personaShare(p.records, today, 14);
  const goals = ofKind(p.records, 'goal').filter(g => !g.body.parentGoalId && g.body.status !== 'dropped');
  const shift = (n: number) => { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const maxFocus = Math.max(60, ...e.days.map(d => d.focus));
  return <div className="insights">
    <section className="part"><h3>큰 목표 진행률</h3>
      {goals.length === 0 ? <p className="muted">목표 탭에서 중장기 목표를 세우면 여기서 전체 진행률을 봐요.</p>
        : <ul className="prows">{goals.map(g => { const gp = goalPercent(g.id, p.records); return <li key={g.id} className="prow"><span className="ptitle">{g.body.title}</span><span className="pct"><i style={{width: `${gp.pct}%`}} /><em>{gp.pct}%</em></span></li>; })}</ul>}
    </section>

    <div className="day-nav"><button onClick={() => shift(-1)} aria-label="전달">‹</button><h2>{Number(month.slice(5))}월 돌아보기</h2><button onClick={() => shift(1)} aria-label="다음 달">›</button></div>
    <section className="part"><h3>날마다 컨디션과 집중 <span className="muted small">막대 = 집중 시간, 점 = 컨디션(1~10)</span></h3>
      <div className="month-chart" role="img" aria-label="날짜별 컨디션과 집중 시간">
        {e.days.map(d => <div key={d.day} className="mc-col" title={`${d.day} · 집중 ${hm(d.focus)} · 컨디션 ${d.score ?? '–'}`}>
          <i className="mc-bar" style={{height: `${Math.round(d.focus / maxFocus * 100)}%`}} />
          {d.score !== null && <b className="mc-dot" style={{bottom: `${d.score * 10}%`, '--lv': Math.round(d.score)} as React.CSSProperties} />}
          <span className="mc-day">{Number(d.day.slice(8))}</span>
        </div>)}
      </div>
    </section>
    <section className="part"><h3>언제 집중이 잘 되나</h3>
      <table className="eff"><thead><tr><th>시간대</th><th>집중</th><th>한 번에</th><th>컨디션</th></tr></thead>
        <tbody>{e.byTime.map(b => <tr key={b.id}><td>{b.label}</td><td>{hm(b.minutes)}</td><td>{b.avgSession ? `${b.avgSession}분` : '–'}</td><td>{b.condition ?? '–'}</td></tr>)}</tbody></table>
      {e.tips.length > 0 ? <ul className="tips">{e.tips.map(t => <li key={t}>{t}</li>)}</ul> : <p className="muted small">타이머를 멈출 때 컨디션을 남기면 여기에 시간대별 조언이 생겨요.</p>}
    </section>
    <section className="part"><h3>예상 대비 실제 시간</h3>
      {est.ratio === null ? <p className="muted small">예상 시간을 적고(예: "보고서 60분") 타이머로 재면 비교가 쌓여요.</p> : <>
        <p className="big-num"><strong>{est.ratio}배</strong> <span className="muted">— 예상한 시간의 {Math.round(est.ratio * 100)}%가 실제로 걸렸어요{est.ratio > 1.15 ? '. 계획할 때 이만큼 곱해서 잡아 보세요.' : est.ratio < .85 ? '. 생각보다 빨리 끝내고 있어요.' : '. 예상이 정확한 편이에요.'}</span></p>
        <ul className="prows">{[...est.rows].sort((a, b) => b.actual / b.estimate - a.actual / a.estimate).slice(0, 5).map(r => <li key={r.id} className="prow"><span className="ptitle">{r.title}<span className="psub">{r.day}</span></span><span className="est">{r.estimate}분 → {r.actual}분 <b className={r.actual > r.estimate ? 'over' : 'under'}>{r.actual > r.estimate ? '+' : ''}{r.actual - r.estimate}</b></span></li>)}</ul></>}
    </section>
    <section className="part"><h3>최근 2주, 나는 어떤 페르소나로 살았나</h3>
      {persona.rows.length === 0 ? <p className="muted small">설정에서 페르소나(예: 수험생, 직장인, 창작자)를 만들고 할 일에 붙이면 보여요.</p> : <>
        <div className="persona-bar">{persona.rows.filter(r => r.minutes > 0).map(r => <i key={r.id} style={{flex: r.minutes, background: r.color}} title={`${r.name} ${r.share}%`} />)}</div>
        <ul className="prows">{persona.rows.map(r => <li key={r.id} className="prow"><i className="dot" style={{background: r.color}} /><span className="ptitle">{r.name}</span><span className="muted small">할 일 {r.done}/{r.tasks}</span><strong>{hm(r.minutes)}</strong><span className="muted small">{r.share}%</span></li>)}</ul></>}
    </section>
  </div>;
}

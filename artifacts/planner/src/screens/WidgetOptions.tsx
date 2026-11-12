import {PALETTE, type PropDef, type Widget} from '@workspace/planner-spec';
import {FACTORS, SCORE_TEXT, type Factor} from '../lifeLogic.ts';
import {BOX_ICONS} from './PageBox.tsx';

/** What a focus row can show next to its name. Task properties the user made are added after these. */
export const FOCUS_PROPS = [{id: 'goal', name: '목표 %'}, {id: 'root', name: '전체 목표 %'}, {id: 'persona', name: '페르소나'}, {id: 'category', name: '분류'}, {id: 'estimate', name: '예상 시간'}, {id: 'time', name: '시작 시각'}];

// What each widget can be set to. Shown in 꾸미기 and, the same, in the ⚙ panel on the widget itself.
const SWATCHES = PALETTE;
export const GLYPHS = ['🌙', '⭐', '✨', '🌸', '🌷', '🍀', '☁️', '☀️', '🌈', '💖', '💌', '🎀', '📌', '📎', '✏️', '📚', '☕', '🍰', '🍓', '🐻', '🐰', '🐱', '🐶', '🦋', '🔥', '💪', '✅', '❗', '💡', '🎯', '🏃', '🧘', '🎧', '📷', '✈️', '🏠', '♡', '★', '☾', '♪'];

export /** Photos are shrunk in the browser (longest side 900px, JPEG) so the page stays light. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요.')); };
    img.src = url;
  });
}

export function WidgetOptions({w, opt, goals, props, tables}: {w: Widget; opt: (k: string, v: unknown) => void; goals: {id: string; title: string}[]; props: PropDef[]; tables: {id: string; title: string}[]}) {
  const o = w.options;
  switch (w.type) {
    case 'text': return <>
      <label>문구 <textarea rows={3} value={String(o.text ?? '')} onChange={e => opt('text', e.target.value)} placeholder="" /></label>
      <label>글자 크기 <select value={String(o.size ?? 'm')} onChange={e => opt('size', e.target.value)}><option value="s">작게</option><option value="m">보통</option><option value="l">크게</option><option value="xl">아주 크게</option></select></label>
      <label>정렬 <select value={String(o.align ?? 'left')} onChange={e => opt('align', e.target.value)}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label></>;
    case 'sticker': return <>
      <span className="muted small">스티커</span>
      <div className="glyphs">{GLYPHS.map(g => <button key={g} className={`glyph ${o.glyph === g ? 'on' : ''}`} onClick={() => opt('glyph', g)}>{g}</button>)}</div>
      <label>직접 쓰기(이모지·글자) <input value={String(o.glyph ?? '')} onChange={e => opt('glyph', e.target.value.slice(0, 8))} /></label>
      <label>크기 <input type="range" min={20} max={160} value={Number(o.size ?? 56)} onChange={e => opt('size', Number(e.target.value))} /></label></>;
    case 'tape': return <>
      <label>무늬 <select value={String(o.pattern ?? 'stripe')} onChange={e => opt('pattern', e.target.value)}><option value="plain">민무늬</option><option value="stripe">사선</option><option value="dot">도트</option><option value="check">체크</option><option value="grid">모눈</option></select></label>
      <span className="muted small">색</span><div className="swatches">{SWATCHES.map(c => <button key={c} className={`swatch ${o.color === c ? 'on' : ''}`} style={{background: c}} onClick={() => opt('color', c)} aria-label={`테이프 색 ${c}`} />)}</div>
      <label>비침 <input type="range" min={0.3} max={1} step={0.05} value={Number(o.opacity ?? 0.85)} onChange={e => opt('opacity', Number(e.target.value))} /></label></>;
    case 'image': return <>
      <label>사진 고르기 <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) opt('src', await shrink(f)); }} /></label>
      <label>또는 사진 주소 <input value={String(o.src ?? '').startsWith('data:') ? '' : String(o.src ?? '')} onChange={e => opt('src', e.target.value)} placeholder="https://…" /></label>
      <label>틀 <select value={String(o.frame ?? 'polaroid')} onChange={e => opt('frame', e.target.value)}><option value="polaroid">폴라로이드</option><option value="round">둥글게</option><option value="circle">동그랗게</option><option value="none">틀 없음</option></select></label>
      <label>설명 <input value={String(o.caption ?? '')} onChange={e => opt('caption', e.target.value)} /></label></>;
    case 'shape': return <>
      <label>모양 <select value={String(o.shape ?? 'heart')} onChange={e => opt('shape', e.target.value)}><option value="heart">하트</option><option value="star">별</option><option value="cloud">구름</option><option value="circle">동그라미</option><option value="label">라벨</option><option value="flower">꽃</option></select></label>
      <span className="muted small">색</span><div className="swatches">{SWATCHES.map(c => <button key={c} className={`swatch ${o.color === c ? 'on' : ''}`} style={{background: c}} onClick={() => opt('color', c)} aria-label={`도형 색 ${c}`} />)}</div>
      <label>안에 쓸 글자 <input value={String(o.text ?? '')} onChange={e => opt('text', e.target.value)} /></label>
      <label>글자 크기 <input type="range" min={8} max={40} value={Number(o.textSize ?? 14)} onChange={e => opt('textSize', Number(e.target.value))} /></label></>;
    case 'progress': case 'dday': return <>
      <label>목표 <select value={String(o.goalId ?? '')} onChange={e => opt('goalId', e.target.value || undefined)}><option value="">자동(첫 큰 목표)</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
      {w.type === 'dday' && <><label>날짜(목표 대신) <input type="date" value={String(o.date ?? '')} onChange={e => opt('date', e.target.value || undefined)} /></label>
        <label>이름 <input value={String(o.label ?? '')} onChange={e => opt('label', e.target.value)} placeholder="이름" /></label></>}</>;
    case 'timetable': case 'hourly': case 'page': return <label>시작 시각 <select value={String(o.startHour ?? 6)} onChange={e => opt('startHour', Number(e.target.value))}>{[4, 5, 6, 7, 8, 9, 10].map(h => <option key={h} value={h}>{h}시</option>)}</select></label>;
    case 'tasks': return <>
      <label>나누는 기준 <select value={typeof o.groupBy === 'string' ? o.groupBy : o.categories === false ? 'none' : 'category'} onChange={e => opt('groupBy', e.target.value)}>
        <option value="category">꼭·하고 싶은·여가</option><option value="none">나누지 않기</option>
        {props.filter(d => d.type === 'select').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="row-check"><input type="checkbox" checked={o.amounts !== false} onChange={e => opt('amounts', e.target.checked)} /> 분량 적기</label></>;
    case 'routine': return <>
      <label>세는 방식 <select value={String(o.mode ?? 'pick_daily')} onChange={e => opt('mode', e.target.value)}><option value="pick_daily">그날 고른 것만</option><option value="fixed_all">정해 둔 것 전부</option></select></label>
      <label className="row-check"><input type="checkbox" checked={o.askReason === true} onChange={e => opt('askReason', e.target.checked)} /> 못 한 이유 남기기</label></>;
    case 'table': return <>
      <label>보이는 줄 <select value={o.scope === 'all' ? 'all' : 'day'} onChange={e => opt('scope', e.target.value)}><option value="day">그날 쓴 줄만</option><option value="all">모든 날 함께</option></select></label>
      <label>자동 기록 <select value={String(o.autoLog ?? '')} onChange={e => opt('autoLog', e.target.value || undefined)}>
        <option value="">없음</option><option value="sessions">집중 세션 (타이머를 멈추면 한 줄)</option><option value="achievements">성취 기록 (목표를 이루면)</option><option value="adjustments">조정·포기 기록 (목표를 포기하면)</option></select></label>
      {o.autoLog ? <p className="muted small">열 이름으로 채워요: {o.autoLog === 'sessions' ? '날짜, 할 일, 페르소나, 시작, 끝, 분, 컨디션, 메모, 목표, 할 일 속성 이름' : o.autoLog === 'achievements' ? '목표, 완료일, 실제 시간(분), 실제 시간, 임팩트, ROI, 다음엔 누가, 메모, 페르소나' : '목표, 날짜, 메모, 상태, 페르소나'}</p> : null}
    </>;
    case 'energy': return <>
      <div className="inline"><label>파랑 (이상) <select value={String(o.greenAt ?? 7)} onChange={e => opt('greenAt', Number(e.target.value))}>{[5, 6, 7, 8, 9].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>빨강 (이하) <select value={String(o.redAt ?? 3)} onChange={e => opt('redAt', Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
      <label>알림 (이하) <select value={String(o.warnAt ?? Number(o.greenAt ?? 7) - 1)} onChange={e => opt('warnAt', Number(e.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="row-check"><input type="checkbox" checked={o.notify !== false} onChange={e => opt('notify', e.target.checked)} /> 알림 버튼 보이기</label>
      <label className="row-check"><input type="checkbox" checked={o.timeline === true} onChange={e => opt('timeline', e.target.checked)} /> 시간대별 점도 보기</label>
      <label>이유 칸 펼치기 (미만) <select value={String(o.askBelow ?? 5)} onChange={e => opt('askBelow', Number(e.target.value))}>{[0, 3, 4, 5, 6, 7, 11].map(n => <option key={n} value={n}>{n === 0 ? '펼치지 않기' : n === 11 ? '항상' : n}</option>)}</select></label>
      <details><summary>점수별 메시지</summary>
        {Array.from({length: 10}, (_, i) => 10 - i).map(n => { const msgs = (o.msgs as Record<string, string> | undefined) ?? {}; return <label key={n} className="score-msg"><span className={`m-light ${n >= Number(o.greenAt ?? 7) ? 'blue' : n <= Number(o.redAt ?? 3) ? 'red' : 'amber'}`} />{n}
          <input value={msgs[String(n)] ?? SCORE_TEXT[n] ?? ''} maxLength={120} onChange={e => opt('msgs', {...msgs, [String(n)]: e.target.value})} aria-label={`${n}점 메시지`} /></label>; })}
      </details>
      <details><summary>저하 요인</summary>
        {((o.factors as Factor[] | undefined) ?? FACTORS).map((f, i, all) => <div key={i} className="inline factor-edit">
          <input value={f.name} maxLength={30} onChange={e => opt('factors', all.map((x, j) => j === i ? {...x, name: e.target.value} : x))} aria-label="요인 이름" />
          <input value={f.desc} maxLength={120} onChange={e => opt('factors', all.map((x, j) => j === i ? {...x, desc: e.target.value} : x))} aria-label="요인 설명" />
          <button className="ghost small" onClick={() => opt('factors', all.filter((_, j) => j !== i))} aria-label={`${f.name} 빼기`}>×</button></div>)}
        <button className="small" onClick={() => opt('factors', [...((o.factors as Factor[] | undefined) ?? FACTORS), {name: '새 요인', desc: ''}])}>+ 요인</button>
      </details></>;
    case 'mission': return <>
      <label>순집중 목표 (시간) <input className="num" inputMode="decimal" value={String(Number(o.focusTarget ?? 480) / 60)} onChange={e => opt('focusTarget', Math.max(30, Math.round((Number(e.target.value) || 8) * 60)))} /></label>
      <label>소원 표 <select value={String(o.wishTable ?? '')} onChange={e => opt('wishTable', e.target.value || undefined)}><option value="">없음</option>{tables.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      {!!o.wishTable && <><label>상태 열 이름 <input value={String(o.statusColumn ?? '상태')} onChange={e => opt('statusColumn', e.target.value)} /></label>
        <div className="inline"><label>잠김 값 <input value={String(o.lockedValue ?? '잠김')} onChange={e => opt('lockedValue', e.target.value)} /></label><label>해금 값 <input value={String(o.unlockValue ?? '해금')} onChange={e => opt('unlockValue', e.target.value)} /></label></div></>}</>;
    case 'receipt': return <>
      <label>보기 <select value={String(o.display ?? 'full')} onChange={e => opt('display', e.target.value)}><option value="full">영수증 펼쳐 두기</option><option value="icon">아이콘 (눌러서 지난 영수증 넘겨보기)</option></select></label>
      <label className="row-check"><input type="checkbox" checked={o.popupStart === true} onChange={e => opt('popupStart', e.target.checked)} /> 하루를 시작할 때 어제 영수증 띄우기</label>
      <label className="row-check"><input type="checkbox" checked={!!o.popupAt} onChange={e => opt('popupAt', e.target.checked ? '22:00' : '')} /> 하루를 마칠 때 오늘 영수증 띄우기</label>
      {!!o.popupAt && <label>시각 <input type="time" className="time-in" value={String(o.popupAt)} onChange={e => e.target.value && opt('popupAt', e.target.value)} /></label>}</>;
    case 'pagebox': return <>
      <span className="muted small">아이콘</span>
      <div className="swatches">{Object.entries(BOX_ICONS).map(([k, v]) => <button key={k} className={`emoji-btn ${String(o.icon ?? 'memo') === k ? 'on' : ''}`} onClick={() => opt('icon', k)} title={v.name} aria-label={v.name}>{v.glyph}</button>)}</div>
      <label>보기 <select value={String(o.display ?? 'cards')} onChange={e => opt('display', e.target.value)}><option value="cards">꾸민 페이지 카드</option><option value="icon">아이콘과 제목만</option></select></label>
      {!!o.template && <button className="small" onClick={() => opt('template', undefined)}>새 페이지 틀 지우기</button>}</>;
    case 'focus': { const subs = (o.subjects as {name: string; color: string}[] | undefined) ?? []; return <>
      <label>보기 <select value={String(o.view ?? 'list')} onChange={e => opt('view', e.target.value)}><option value="list">과목·할 일 목록</option><option value="time">시간순</option></select></label>
      <span className="muted small">보일 속성</span>
      <div className="checks">{[...FOCUS_PROPS, ...props.map(d => ({id: `prop:${d.id}`, name: d.name}))].map(f => { const cur = (o.show as string[] | undefined) ?? ['goal']; return <label key={f.id} className="row-check"><input type="checkbox" checked={cur.includes(f.id)} onChange={e => opt('show', e.target.checked ? [...cur, f.id] : cur.filter(x => x !== f.id))} /> {f.name}</label>; })}</div>
      <span className="muted small">과목</span>
      {subs.map((sj, i) => <div key={i} className="inline"><input value={sj.name} onChange={e => opt('subjects', subs.map((x, j) => j === i ? {...x, name: e.target.value.slice(0, 40)} : x))} aria-label="과목 이름" />
        <input type="color" value={sj.color} onChange={e => opt('subjects', subs.map((x, j) => j === i ? {...x, color: e.target.value} : x))} aria-label="과목 색" />
        <button className="ghost small" onClick={() => opt('subjects', subs.filter((_, j) => j !== i))} aria-label="과목 빼기">×</button></div>)}
      <button className="small" onClick={() => opt('subjects', [...subs, {name: `과목 ${subs.length + 1}`, color: SWATCHES[(subs.length * 5) % SWATCHES.length]}])}>+ 과목</button>
      <label className="row-check"><input type="checkbox" checked={o.showTasks !== false} onChange={e => opt('showTasks', e.target.checked)} /> 오늘 할 일도 버튼으로</label>
      <label className="row-check"><input type="checkbox" checked={o.askCondition !== false} onChange={e => opt('askCondition', e.target.checked)} /> 멈출 때 컨디션 묻기</label>
      <span className="muted small">버튼 색</span>
      <div className="swatches">{SWATCHES.map(c => <button key={c} className={`swatch ${o.buttonColor === c ? 'on' : ''}`} style={{background: c}} onClick={() => opt('buttonColor', c)} aria-label={`버튼 색 ${c}`} />)}
        {!!o.buttonColor && <button className="ghost small" onClick={() => opt('buttonColor', undefined)}>기본</button>}</div></>; }
    case 'list': return <>
      <label>무엇을 <select value={String(o.source ?? 'tasks')} onChange={e => opt('source', e.target.value)}><option value="tasks">할 일</option><option value="goals">목표</option></select></label>
      <label>기간 <select value={String(o.period ?? 'week')} onChange={e => opt('period', e.target.value)}><option value="today">보이는 날</option><option value="week">이번 주</option><option value="month">이번 달</option><option value="overdue">밀린 것</option><option value="all">전체</option></select></label>
      <label>상태 <select value={String(o.status ?? 'open')} onChange={e => opt('status', e.target.value)}><option value="open">안 끝난 것</option><option value="done">끝낸 것</option><option value="all">전부</option></select></label>
      {o.source !== 'goals' && <><label>분류 <select value={String(o.category ?? '')} onChange={e => opt('category', e.target.value || undefined)}><option value="">전부</option><option value="must">꼭</option><option value="want">하고 싶은</option><option value="leisure">여가</option></select></label>
        <label>목표 <select value={String(o.goalId ?? '')} onChange={e => opt('goalId', e.target.value || undefined)}><option value="">전부</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
        {props.length > 0 && <div className="inline"><label>속성 <select value={String(o.propId ?? '')} onChange={e => opt('propId', e.target.value || undefined)}><option value="">없음</option>{props.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          {!!o.propId && <label>값 <input value={String(o.propValue ?? '')} onChange={e => opt('propValue', e.target.value)} list={`pv-${w.id}`} /><datalist id={`pv-${w.id}`}>{(props.find(d => d.id === o.propId)?.options ?? []).map(v => <option key={v} value={v} />)}</datalist></label>}</div>}</>}</>;
    case 'personas': return <>
      <label>보기 <select value={String(o.display ?? 'donut')} onChange={e => opt('display', e.target.value)}><option value="donut">원형 그래프</option><option value="top">가장 많이 산 페르소나 이름표만</option></select></label>
      {props.length > 0 && <label>페르소나 속성 <select value={String(o.prop ?? '')} onChange={e => opt('prop', e.target.value || undefined)}><option value="">자동</option>{props.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}</>;
    case 'persona-board': return <label>Deployed 한도 <input type="number" min={1} max={12} className="num" value={Number(o.limit ?? 3)} onChange={e => opt('limit', Math.max(1, Number(e.target.value) || 3))} /></label>;
    case 'checkin': return <div className="inline">
      <label>기상 <input type="time" value={String(o.wake ?? '07:00')} onChange={e => opt('wake', e.target.value)} /></label>
      <label>취침 <input type="time" value={String(o.sleep ?? '00:00')} onChange={e => opt('sleep', e.target.value)} /></label></div>;
    default: return null;
  }
}


import {useMemo, useRef, useState} from 'react';
import {logicalDay, type Settings} from '@workspace/life-contract';
import {CATALOG, CHIP_COLORS, MOODS, TEMPLATES, candidates, entry, propose, withMood, type ModuleType, type PlannerSpec, type Proposal, type Reference} from '@workspace/planner-spec';
import {memoryBackend, usePlanner} from '../data.ts';
import {sampleRecords} from '../sample.ts';
import {Moon, Speech} from '../Moon.tsx';
import {PlannerView} from './PlannerView.tsx';

const moduleName = (m: ModuleType) => entry(m)?.label ?? m;

// Planner Builder: describe your day → MOONS narrows it down and suggests → mockup → use it.
// This first version runs on the catalog alone (no AI call); the chat shape stays the same when AI joins.
export function Builder({tz, current, onUse, onCancel}: {tz: string; current?: PlannerSpec; onUse: (spec: PlannerSpec) => Promise<void>; onCancel?: () => void}) {
  const [text, setText] = useState(''), [said, setSaid] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({}), [accepted, setAccepted] = useState<ModuleType[]>([]);
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Samples: two or three planners from the reference library; the picked one gets a mood, then becomes real.
  const [cands, setCands] = useState<{reference: Reference; spec: PlannerSpec}[] | null>(null), [pick, setPick] = useState<number | null>(null), [mood, setMood] = useState('calm');
  const preview = cands && pick !== null ? withMood(cands[pick]!.spec, mood) : null;
  const setPreview = (_: null) => { setCands(null); setPick(null); };
  const input = useRef<HTMLTextAreaElement>(null);

  const start = (words: string, templateId?: string) => {
    const p = propose(words, templateId);
    setSaid(words || TEMPLATES.find(t => t.id === templateId)?.name || ''); setProposal(p); setAnswers({}); setAccepted(p.suggested.map(s => s.module)); setName(p.template.name); setPreview(null);
  };
  const restart = () => { setProposal(null); setSaid(null); setPreview(null); setText(''); setTimeout(() => input.current?.focus()); };
  const show = () => { if (!proposal) return; try { setError(''); setCands(candidates(proposal, said ?? '', accepted, answers, name)); setPick(null); } catch (e) { setError((e as Error).message); } };
  const use = async () => { if (!preview) return; setBusy(true); setError(''); try { await onUse(preview); } catch (e) { setError((e as Error).message); setBusy(false); } };

  return <div className={`builder ${cands ? 'split' : ''}`}>
    <div className="chat">
      {current && onCancel && <button className="ghost small back" onClick={onCancel}>‹ 내 플래너로</button>}
      <div className="moon-say">
        <Moon size={proposal ? 48 : 96} />
        <Speech>{current ? '어떻게 고쳐 볼까요?' : '어떤 하루를 관리하고 싶어요?'}</Speech>
      </div>

      {!proposal && <>
        <form className="composer" onSubmit={e => { e.preventDefault(); if (text.trim()) start(text.trim()); }}>
          <textarea ref={input} rows={3} value={text} onChange={e => setText(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim()) start(text.trim()); } }}
            placeholder="예: 루틴 트래커가 필요해. 매일 하는 건 아니고 그날 할 것만 체크하고 싶어." aria-label="필요한 플래너 설명" />
          <div className="composer-bar">
            <span className="attach" title="다음 단계에서 열려요"><button type="button" disabled>종이 플래너 사진</button><button type="button" disabled>노션에서 가져오기</button></span>
            <button className="primary" disabled={!text.trim()}>보내기</button>
          </div>
        </form>
        <div className="chips">
          <span className="muted">이렇게 시작해도 돼요</span>
          {TEMPLATES.map(t => <button key={t.id} className="chip" onClick={() => start('', t.id)} title={t.summary}>{t.name}</button>)}
          {CATALOG.filter(c => !['tasks'].includes(c.module)).map(c => <button key={c.module} className="chip ghost" onClick={() => setText(v => `${v}${v ? ', ' : ''}${c.label}`)}>+ {c.label}</button>)}
        </div>
      </>}

      {proposal && said !== null && <div className="thread">
        <p className="bubble me">{said}</p>
        <div className="bubble moon">
          <p>{proposal.requested.length
            ? <>말씀하신 <strong>{proposal.requested.map(moduleName).join(', ')}</strong>을(를) 중심으로 <strong>{proposal.template.name}</strong> 틀에서 시작할게요.</>
            : <><strong>{proposal.template.name}</strong> 틀에서 시작할게요. {proposal.template.summary}</>}</p>
          {proposal.questions.length > 0 && <p>더 맞게 만들려고 몇 가지만 물어볼게요.</p>}
        </div>
        {proposal.questions.map(q => <div key={q.id} className="bubble moon question">
          <p>{q.text}</p>
          <div className="chips">{q.choices.map(c => <button key={c.id} className={`chip ${answers[q.id] === c.id ? 'on' : ''}`} aria-pressed={answers[q.id] === c.id} onClick={() => { setAnswers({...answers, [q.id]: c.id}); setPreview(null); }}>{c.label}</button>)}</div>
        </div>)}
        {proposal.suggested.length > 0 && <div className="bubble moon suggest">
          <p><span className="tag">MOONS 제안</span> 말씀하지 않았지만 같이 있으면 좋은 것들이에요.</p>
          <ul>{proposal.suggested.map(s => <li key={s.module}>
            <label><input type="checkbox" checked={accepted.includes(s.module)} onChange={e => { setAccepted(e.target.checked ? [...accepted, s.module] : accepted.filter(m => m !== s.module)); setPreview(null); }} /> <strong>{moduleName(s.module)}</strong></label>
            <span className="why">{s.why}</span>
          </li>)}</ul>
        </div>}
        <div className="bubble moon">
          <label className="name">플래너 이름 <input value={name} onChange={e => { setName(e.target.value); setPreview(null); }} maxLength={40} /></label>
          <div className="actions">
            <button className="primary" onClick={show}>{cands ? '샘플 다시 그리기' : '샘플 보기'}</button>
            <button className="ghost" onClick={restart}>처음부터 다시 말하기</button>
          </div>
        </div>
        {cands && !preview && <div className="bubble moon"><p>같은 기능으로 <strong>{cands.length}가지</strong> 플래너를 그려 봤어요. 오른쪽에서 마음에 드는 걸 고르세요.</p></div>}
        {preview && <div className="bubble moon">
          <p><strong>{cands![pick!]!.reference.name}</strong>로 골랐어요. 무드를 고르고, 예시 기록을 눌러 본 뒤 마음에 들면 이대로 쓰세요.</p>
          <div className="moods" role="radiogroup" aria-label="무드">{MOODS.map(m => <button key={m.id} role="radio" aria-checked={mood === m.id} className={`mood-chip mood-${m.id} ${mood === m.id ? 'on' : ''}`} onClick={() => setMood(m.id)} title={m.feel}><i />{m.name}</button>)}</div>
          <button className="ghost small" onClick={() => setPick(null)}>‹ 다른 샘플 보기</button>
          <div className="actions"><button className="primary" disabled={busy} onClick={use}>{busy ? '만드는 중…' : '이대로 쓰기'}</button></div>
          <p className="muted small">예시 기록은 빠지고 빈 플래너로 시작해요. 나중에 언제든 고칠 수 있고, 고쳐도 기록은 그대로예요.</p>
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>}
    </div>
    {cands && !preview && <aside className="samples" aria-label="샘플">{cands.map((c, i) => <button key={c.reference.id + i} className="sample" onClick={() => setPick(i)}>
      <div className="sample-head"><strong>{c.reference.name}</strong><span className="muted small">{c.reference.inspiredBy}</span></div>
      <ul className="sample-pattern">{c.reference.pattern.map(x => <li key={x}>{x}</li>)}</ul>
      <div className="sample-mini" aria-hidden="true"><Mockup spec={c.spec} tz={tz} mini /></div>
      <span className="sample-pick">이걸로 볼래요 →</span>
    </button>)}</aside>}
    {preview && <Mockup key={JSON.stringify(preview)} spec={preview} tz={tz} />}
  </div>;
}

function Mockup({spec, tz, mini}: {spec: PlannerSpec; tz: string; mini?: boolean}) {
  const settings: Settings = {tz, dayBoundary: '04:00'};
  const backend = useMemo(() => memoryBackend(tz), [tz]);
  const p = usePlanner(backend, useMemo(() => sampleRecords(spec, logicalDay(new Date(), settings), tz), [spec, tz]));
  return <aside className={`mockup mood-${spec.mood} ${mini ? 'mini' : ''}`} aria-label={mini ? undefined : '목업'} style={{'--accent': CHIP_COLORS[spec.theme.accent]} as React.CSSProperties}>
    <div className="mockup-head"><Moon size={28} /><strong>{spec.name}</strong><span className="tag">목업 · 예시 데이터</span></div>
    <PlannerView spec={spec} settings={settings} p={p} />
  </aside>;
}

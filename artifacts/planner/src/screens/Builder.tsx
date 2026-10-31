import {useMemo, useRef, useState} from 'react';
import {logicalDay, type Settings} from '@workspace/life-contract';
import {CATALOG, TEMPLATES, compose, entry, propose, type ModuleType, type PlannerSpec, type Proposal} from '@workspace/planner-spec';
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
  const [name, setName] = useState(''), [preview, setPreview] = useState<PlannerSpec | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const start = (words: string, templateId?: string) => {
    const p = propose(words, templateId);
    setSaid(words || TEMPLATES.find(t => t.id === templateId)?.name || ''); setProposal(p); setAnswers({}); setAccepted(p.suggested.map(s => s.module)); setName(p.template.name); setPreview(null);
  };
  const restart = () => { setProposal(null); setSaid(null); setPreview(null); setText(''); setTimeout(() => input.current?.focus()); };
  const show = () => { if (!proposal) return; try { setError(''); setPreview(compose(proposal, accepted, answers, name)); } catch (e) { setError((e as Error).message); } };
  const use = async () => { if (!preview) return; setBusy(true); setError(''); try { await onUse(preview); } catch (e) { setError((e as Error).message); setBusy(false); } };

  return <div className={`builder ${preview ? 'split' : ''}`}>
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
            <button className="primary" onClick={show}>{preview ? '목업 다시 그리기' : '목업 보기'}</button>
            <button className="ghost" onClick={restart}>처음부터 다시 말하기</button>
          </div>
        </div>
        {preview && <div className="bubble moon">
          <p>오른쪽이 <strong>{preview.name}</strong> 목업이에요. 예시 기록이 들어 있으니 눌러 보세요. 마음에 들면 이대로 쓰면 돼요.</p>
          <div className="actions"><button className="primary" disabled={busy} onClick={use}>{busy ? '만드는 중…' : '이대로 쓰기'}</button></div>
          <p className="muted small">예시 기록은 빠지고 빈 플래너로 시작해요. 나중에 언제든 고칠 수 있고, 고쳐도 기록은 그대로예요.</p>
        </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>}
    </div>
    {preview && <Mockup key={JSON.stringify(preview)} spec={preview} tz={tz} />}
  </div>;
}

function Mockup({spec, tz}: {spec: PlannerSpec; tz: string}) {
  const settings: Settings = {tz, dayBoundary: '04:00'};
  const backend = useMemo(() => memoryBackend(tz), [tz]);
  const p = usePlanner(backend, useMemo(() => sampleRecords(spec, logicalDay(new Date(), settings), tz), [spec, tz]));
  return <aside className="mockup" aria-label="목업">
    <div className="mockup-head"><Moon size={28} /><strong>{spec.name}</strong><span className="tag">목업 · 예시 데이터</span></div>
    <PlannerView spec={spec} settings={settings} p={p} />
  </aside>;
}

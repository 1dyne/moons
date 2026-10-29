import {useState} from 'react';
import {ArrowLeft, ArrowUpRight, Check, Copy, Download, GitBranch, LoaderCircle, Plus, RefreshCw, Send, X} from 'lucide-react';
import type {ConnectedProject, ProjectProposal, ReviewDraft, ProjectEvent} from '@workspace/moons-sync/projects';
import type {ProjectHubApi} from '@/lib/project-client';
import type {Store} from '@/lib/model';
import type {WorkspaceApi} from '@/lib/workspace-client';
import {tr, lang} from '@/lib/i18n';
import {toggleSatellite} from '@/lib/satellites';
import '../styles/projects.css';

type Props = {hub: ProjectHubApi; store: Store; ws: WorkspaceApi; go: (url: string) => void; projectId?: string; proposalId?: string};
const label = (s: string) => tr(({review: 'In review', confirmed: 'Confirmed', handed_off: 'Handed off', reported: 'Result reported', dismissed: 'Dismissed', queued: 'Queued', running: 'Reviewing', complete: 'Review ready', no_proposal: 'No applicable update', failed: 'Review failed'} as Record<string, string>)[s] ?? s);
const stamp = (s: string) => new Date(s).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
const listFields: [keyof Pick<ReviewDraft, 'scope' | 'preserve' | 'acceptance' | 'verification' | 'questions' | 'risks' | 'codePaths'>, string][] = [
  ['scope', 'Scope'], ['preserve', 'Preserve'], ['acceptance', 'Acceptance criteria'], ['verification', 'Verification'], ['questions', 'Open questions'], ['risks', 'Risks'], ['codePaths', 'Code paths to inspect'],
];
const split = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

export function ProjectTags({projects, value, onChange}: {projects: ConnectedProject[]; value: string[]; onChange: (ids: string[]) => void}) {
  if (!projects.length) return null;
  return <fieldset className="project-tags"><legend>{tr('Projects')}</legend>{projects.map(p => <label key={p.id}><input type="checkbox" checked={value.includes(p.id)} onChange={e => onChange(e.target.checked ? [...value, p.id] : value.filter(id => id !== p.id))}/>{p.name}</label>)}</fieldset>;
}

export function Metrics({events, projects = []}: {events: ProjectEvent[]; projects?: ConnectedProject[]}) {
  const groups = new Map<string, {name: string; unit: string; kind: string; basis: string; value: number; at: string}>();
  for (const e of events) {const key = `${e.projectId}:${e.kind}:${e.name}:${e.unit}:${e.basis}:${e.source}:${e.aggregation}`, old = groups.get(key), project = projects.find(p => p.id === e.projectId); groups.set(key, {name: `${project ? `${project.name} · ` : ''}${e.name} · ${e.source}`, kind: e.kind, unit: e.unit, basis: e.basis, value: e.aggregation === 'latest' ? (old && old.at > e.at ? old.value : e.value) : (old?.value ?? 0) + e.value, at: old && old.at > e.at ? old.at : e.at});}
  return <section className="settings-card"><h2>{tr('Usage and costs · 30 days')}</h2>{groups.size ? <div className="project-metrics">{[...groups].map(([key, e]) => <article key={key}><small>{e.name}</small><strong>{e.value.toLocaleString(undefined, {maximumFractionDigits: 4})} {e.unit}</strong><span>{tr(e.basis === 'estimated' ? 'Estimated' : 'Reported')} · {stamp(e.at)}</span></article>)}</div> : <span className="project-state">{tr('No measurements')}</span>}</section>;
}

function ReviewEditor({proposal, save, close, busy}: {proposal: ProjectProposal; save: (d: ReviewDraft, revision: number) => Promise<void>; close: () => void; busy: boolean}) {
  const [draft, setDraft] = useState(proposal.draft), [revision] = useState(proposal.revision);
  return <form className="project-form" onSubmit={e => {e.preventDefault(); void save(draft, revision);}}>
    {(['title', 'rationale', 'change'] as const).map(k => <label key={k}>{tr({title: 'Title', rationale: 'Why this update', change: 'Intended behavior'}[k])}<textarea required value={draft[k]} onChange={e => setDraft({...draft, [k]: e.target.value})}/></label>)}
    {listFields.map(([k, name]) => <label key={k}>{tr(name)}<textarea value={draft[k].join('\n')} onChange={e => setDraft({...draft, [k]: e.target.value.split('\n')})}/></label>)}
    <div className="project-actions"><button className="primary" disabled={busy}>{tr('Save review')}</button><button type="button" onClick={close}>{tr('Cancel')}</button></div>
  </form>;
}

export function ProposalView({p, hub, go}: {p: ProjectProposal; hub: ProjectHubApi; go: Props['go']}) {
  const [message, setMessage] = useState(''), [edit, setEdit] = useState(false), [result, setResult] = useState(''), [url, setUrl] = useState(''), [copyState, setCopyState] = useState('');
  const [resultBrief, setResultBrief] = useState(p.briefs.at(-1)?.id ?? '');
  const endpoint = `/proposals/${p.id}`, latest = p.briefs.at(-1);
  async function action(action: string, extra: Record<string, unknown> = {}) {try {await hub.request(endpoint, {action, revision: p.revision, ...extra});} catch { /* hook exposes the error */ }}
  async function send() {try {await hub.request(`${endpoint}/discuss`, {revision: p.revision, text: message}); setMessage('');} catch {}}
  return <>
    <div className="project-heading"><div><span className="project-state">{label(p.status)} · {tr(p.match === 'tagged' ? 'Tagged by you' : 'Connection suggested by MOONS')}</span><h1>{p.draft.title}</h1></div><button onClick={() => go(`/projects/${p.projectId}`)} aria-label={tr('Back')}><ArrowLeft/></button></div>
    <div className="project-review-grid"><section className="settings-card project-review">
      {edit ? <ReviewEditor proposal={p} busy={hub.busy} close={() => setEdit(false)} save={async (draft, revision) => {try {const clean = {...draft}; for (const [k] of listFields) clean[k] = clean[k].map(x => x.trim()).filter(Boolean); await hub.request(endpoint, {action: 'edit', revision, draft: clean}); setEdit(false);} catch {}}}/> : <>
        <h2>{tr('Why this update')}</h2><p>{p.draft.rationale}</p><h2>{tr('Intended behavior')}</h2><p>{p.draft.change}</p>
        {listFields.map(([k, name]) => <section key={k} className={k === 'questions' && p.draft[k].length ? 'project-questions' : ''}><h3>{tr(name)}</h3>{p.draft[k].length ? <ul>{p.draft[k].map((s, i) => <li key={i}>{s}</li>)}</ul> : <span className="project-state">{tr('None')}</span>}</section>)}
        <div className="project-actions">{p.status === 'review' ? <><button onClick={() => setEdit(true)} disabled={hub.busy}>{tr('Edit review')}</button><button className="primary" disabled={hub.busy || p.draft.questions.length > 0} onClick={() => void action('confirm')}><Check size={16}/>{tr('Confirm agenda')}</button><button onClick={() => void action('dismiss')} disabled={hub.busy}>{tr('Dismiss')}</button></> : <button disabled={hub.busy} onClick={() => void action('reopen')}>{tr('Open a new revision')}</button>}</div>
      </>}
      <details><summary>{tr('Original idea')}</summary><blockquote>{p.sourceText}</blockquote><button className="text-button" onClick={() => go(`/entries/${p.entryId}/original`)}>{tr('Open note')}</button></details>
      <details><summary>{tr('Context at review time')}</summary><p>{p.context.repository || tr('Not connected')}</p><p>{p.context.snapshot ? `${p.context.snapshot.sha} · ${stamp(p.context.snapshot.checkedAt)}` : tr('Code not inspected')}</p>{p.context.notes.map(n => <article key={n.id}><h4>{n.title}</h4><small>{n.source}</small><pre>{n.text}</pre></article>)}</details>
    </section><aside className="settings-card project-discussion"><h2>{tr('Discuss with MOONS')}</h2><div className="project-messages" aria-live="polite">{p.messages.map(m => <article key={m.id} className={m.role}><small>{m.role === 'user' ? tr('You') : 'MOONS'}</small><p>{m.text}</p></article>)}</div>
      <form onSubmit={e => {e.preventDefault(); void send();}}><textarea aria-label={tr('Message to MOONS')} maxLength={8000} value={message} onChange={e => setMessage(e.target.value)} disabled={p.status !== 'review' || edit} rows={5}/><button className="primary" disabled={hub.busy || !message.trim() || p.status !== 'review' || edit}><Send size={16}/>{tr('Send')}</button></form>
    </aside></div>
    {!!p.briefs.length && <section className="settings-card"><h2>{tr('Approved work briefs')}</h2>{p.briefs.map(b => <details key={b.id} open={b.id === latest?.id}><summary>v{b.version} · {stamp(b.approvedAt)}</summary><div className="project-actions"><a className="secondary" href={`${import.meta.env.BASE_URL}api/projects/proposals/${p.id}/brief/${b.version}`}><Download size={16}/>{tr('Download brief')}</a><button onClick={() => {void navigator.clipboard.writeText(b.markdown).then(() => setCopyState(tr('Copied')), () => setCopyState(tr('Use Download brief')));}}><Copy size={16}/>{tr('Copy brief')}</button><span role="status">{copyState}</span></div><pre className="project-brief">{b.markdown}</pre></details>)}
      {p.status === 'confirmed' && <button className="primary" disabled={hub.busy} onClick={() => void action('handoff')}>{tr('Mark as handed off')}</button>}
      <h3>{tr('Work reports')}</h3>{p.results.map(r => <article key={r.id} className="project-result"><small>{tr('Reported · not independently verified')} · v{p.briefs.find(b => b.id === r.briefId)?.version} · {stamp(r.at)}</small><p>{r.text}</p>{r.url && <a href={r.url} target="_blank" rel="noreferrer">{tr('Open evidence')} <ArrowUpRight size={14}/></a>}</article>)}
      <form className="project-form" onSubmit={e => {e.preventDefault(); void hub.request(endpoint, {action: 'result', revision: p.revision, briefId: resultBrief || latest?.id, text: result, url}).then(() => {setResult(''); setUrl('');}).catch(() => undefined);}}><label>{tr('Brief version')}<select value={resultBrief || latest?.id} onChange={e => setResultBrief(e.target.value)}>{p.briefs.map(b => <option key={b.id} value={b.id}>v{b.version}</option>)}</select></label><label>{tr('Work report')}<textarea required maxLength={20000} value={result} onChange={e => setResult(e.target.value)}/></label><label>{tr('PR or result URL')}<input type="url" value={url} onChange={e => setUrl(e.target.value)}/></label><button className="primary" disabled={hub.busy || !result.trim()}>{tr('Save result')}</button></form>
    </section>}
  </>;
}

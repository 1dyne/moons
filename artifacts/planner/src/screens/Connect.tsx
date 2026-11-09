import {useEffect, useState} from 'react';
import {useClerk} from '@clerk/react';
import {authEnabled} from '../runtime.ts';
import {Moon, Speech} from '../Moon.tsx';

// OAuth consent for an AI connector (Claude's custom connector → this planner's /mcp).
type Req = {clientName: string; clientUri?: string; redirectHost: string; scopes: string[]};
async function call<T>(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, {credentials: 'include', ...init, headers: {'content-type': 'application/json'}});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? '연결 요청을 처리하지 못했어요.'), {status: res.status});
  return data as T;
}

export function ConnectPage({id}: {id: string}) {
  const [req, setReq] = useState<Req | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [needLogin, setNeedLogin] = useState(false);
  useEffect(() => { call<Req>(`/oauth/requests/${id}`).then(setReq).catch(e => setError((e as Error).message)); }, [id]);
  const answer = async (approve: boolean) => {
    setBusy(true); setError('');
    try { const r = await call<{redirect: string}>(`/oauth/requests/${id}`, {method: 'POST', body: JSON.stringify({approve})}); location.href = r.redirect; }
    catch (e) { if ((e as {status?: number}).status === 401) setNeedLogin(true); else setError((e as Error).message); setBusy(false); }
  };
  return <div className="center connect">
    <div className="moon-say"><Moon size={72} /><Speech>{req ? `${req.clientName}가 내 플래너에 연결하려고 해요` : '연결 요청을 확인하는 중…'}</Speech></div>
    {req && <div className="connect-card">
      <p>연결하면 <strong>{req.clientName}</strong>({req.redirectHost})와 대화하면서 이런 걸 할 수 있어요.</p>
      <ul>
        <li>대화로 정한 대로 플래너를 만들고 바꾸기(위젯 배치·꾸미기)</li>
        <li>큰 목표와 마일스톤, 할 일·루틴·페르소나 넣기</li>
        <li>오늘 할 일·목표 진행률·컨디션 읽기</li>
        <li>MOONS 지식 공간 읽기와 정리안 보내기(승인 후 반영)</li>
      </ul>
      <p className="muted small">플래너를 바꿔도 기록은 그대로 남고, 설정에서 언제든 연결을 끊을 수 있어요.</p>
      {needLogin && authEnabled ? <LoginFirst /> : <div className="actions">
        <button className="primary" disabled={busy} onClick={() => answer(true)}>연결하기</button>
        <button className="ghost" disabled={busy} onClick={() => answer(false)}>거절</button>
      </div>}
    </div>}
    {error && <p className="error">{error}</p>}
  </div>;
}

function LoginFirst() {
  const clerk = useClerk();
  return <div className="actions"><p>먼저 MOONS 계정으로 로그인해 주세요. 플래너가 내 계정에 묶여야 해요.</p>
    <button className="primary" onClick={() => clerk.openSignIn({forceRedirectUrl: location.href})}>MOONS 계정으로 로그인</button></div>;
}

import {useCallback, useEffect, useRef, useState} from 'react';
import type {ProjectHub} from '@workspace/moons-sync/projects';
import {errMsg} from './workspace-client';

export async function projectRequest<T>(path = '', body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/projects${path}`, {credentials: 'include', method: body === undefined ? 'GET' : method,
    ...(body === undefined ? {} : {headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})});
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? 'Project request failed.');
  return data as T;
}
export function useProjectHub(enabled: boolean) {
  const [data, setData] = useState<ProjectHub>({projects: [], proposals: [], jobs: [], events: [], aiUsage: {calls: 0, cost: null, unknown: 0}});
  const [error, setError] = useState(''), [busy, setBusy] = useState(0), [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++generation.current;
    try {const next = await projectRequest<ProjectHub>(); if (seq === generation.current) {setData(next); setLoaded(true); setError('');}}
    catch (e) {if (seq === generation.current) setError(errMsg(e));}
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = setInterval(() => {if (document.visibilityState === 'visible') void reload();}, 10000);
    const focus = () => {void reload();}; window.addEventListener('focus', focus);
    return () => {clearInterval(timer); window.removeEventListener('focus', focus); generation.current++;};
  }, [enabled, reload]);
  const request = useCallback(async <T,>(path: string, body: unknown, method = 'POST') => {
    setBusy(n => n + 1); setError('');
    try {const result = await projectRequest<T>(path, body, method); await reload(); return result;}
    catch (e) {setError(errMsg(e)); throw e;}
    finally {setBusy(n => n - 1);}
  }, [reload]);
  return {data, error, busy: busy > 0, loaded, reload, request};
}
export type ProjectHubApi = ReturnType<typeof useProjectHub>;

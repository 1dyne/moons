import type {ConnectedProject, RepoSnapshot} from '@workspace/moons-sync/projects';
import {q, json} from '../db.ts';
import {open} from '../v5/ai-access.ts';
import {WorkspaceError, now} from '../v5/types.ts';
import {getProject} from './service.ts';

async function github<T>(path: string, key: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: {accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MOONS-projects', ...(key ? {Authorization: `Bearer ${key}`} : {})}});
  if (!response.ok) throw new WorkspaceError(502, `GitHub connection failed (${response.status}).`);
  const raw = await response.text();
  if (raw.length > 3_000_000) throw new WorkspaceError(502, 'GitHub response is too large.');
  return JSON.parse(raw) as T;
}
export async function fetchSnapshot(project: ConnectedProject, key: string): Promise<RepoSnapshot> {
  if (!project.repository) throw new WorkspaceError(400, 'Connect a GitHub repository first.');
  const root = `/repos/${project.repository.split('/').map(encodeURIComponent).join('/')}`;
  const repo = await github<{default_branch: string}>(root, key);
  const commit = await github<{sha: string; commit: {message: string; tree: {sha: string}}}>(`${root}/commits/${encodeURIComponent(repo.default_branch)}`, key);
  const unavailable: string[] = [];
  const checks = await github<{check_runs: RepoSnapshot['checks']}>(`${root}/commits/${commit.sha}/check-runs?per_page=100`, key).catch(() => {unavailable.push('checks'); return {check_runs: []};});
  const tree: {tree: {path: string; type: string}[]; truncated: boolean} = await github<{tree: {path: string; type: string}[]; truncated: boolean}>(`${root}/git/trees/${commit.commit.tree.sha}?recursive=1`, key).catch(() => {unavailable.push('file tree'); return {tree: [], truncated: true};});
  if (tree.truncated) unavailable.push('complete file tree');
  const files: RepoSnapshot['files'] = [];
  for (const path of project.contextPaths) {
    try {
      const file = await github<{type: string; content: string; encoding: string}>(`${root}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commit.sha}`, key);
      if (file.type !== 'file' || file.encoding !== 'base64') {unavailable.push(path); continue;}
      const content = Buffer.from(file.content, 'base64').toString('utf8');
      files.push({path, text: content.slice(0, 16000), truncated: content.length > 16000});
    } catch { unavailable.push(path); }
  }
  return {repo: project.repository, branch: repo.default_branch, sha: commit.sha, checkedAt: now(), commitTitle: commit.commit.message.split('\n')[0]!.slice(0, 300),
    checks: checks.check_runs.map(c => ({name: c.name, status: c.status, conclusion: c.conclusion})), files,
    paths: tree.tree.filter(f => f.type === 'blob').slice(0, 3000).map(f => f.path), unavailable};
}
export async function syncGithub(owner: string, id: string) {
  const p = await getProject(owner, id);
  const row = (await q<{github_key: string | null}>('select github_key from connected_projects where owner_id=$1 and id=$2', [owner, id]))[0]!;
  try {
    const snapshot = await fetchSnapshot(p, row.github_key ? open(row.github_key) : '');
    const saved = await q(`update connected_projects set data=(data-'connectionError')||jsonb_build_object('snapshot',$3::jsonb),revision=revision+1
      where owner_id=$1 and id=$2 and revision=$4 returning id`, [owner, id, json(snapshot), p.revision]);
    if (!saved.length) throw new WorkspaceError(409, 'Project changed. Reload before syncing.');
    return getProject(owner, id);
  } catch (e) {
    const message = e instanceof WorkspaceError ? e.message : 'GitHub connection is unavailable.';
    if (!(e instanceof WorkspaceError && e.status === 409)) await q(`update connected_projects set data=data||jsonb_build_object('connectionError',$3::text) where owner_id=$1 and id=$2 and revision=$4`, [owner, id, message, p.revision]);
    throw new WorkspaceError(e instanceof WorkspaceError ? e.status : 502, message);
  }
}

import {Router, json as body, type Request, type Response} from 'express';
import {guest, initV5, loadWorkspace} from './lib/server/v5/workspace-store.ts';
import {WorkspaceError, now} from './lib/server/v5/types.ts';
import {limited} from './lib/server/http.ts';
import {q, json, newId} from './lib/server/db.ts';
import {projectHub, saveProject, getProject, getProposal, proposalAction, setGithubKey, rotateTelemetry, acceptEvent, object, text} from './lib/server/projects/service.ts';
import {syncGithub} from './lib/server/projects/github.ts';
import {discussProposal} from './lib/server/projects/review.ts';
import {discoverConnections,addConnection,syncConnection,removeConnection} from './lib/server/projects/connectors.ts';
import {deviceEnabled,type DeviceSettings} from '@workspace/moons-sync/satellites';

export function projectsRouter(checkOrigin: (req: Request) => void) {
  const router = Router();
  const wrap = (fn: (req: Request, res: Response, owner: string) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store');
      checkOrigin(req);
      const owner = await guest(req, res);
      if(req.method!=='GET'&&!deviceEnabled((await loadWorkspace(owner)).store.settings as DeviceSettings,'projects'))throw new WorkspaceError(403,'Dock is paused or not installed.');
      if (req.method !== 'GET' && limited(`projects:${owner}`, 30)) throw new WorkspaceError(429, 'Please wait a minute.');
      await fn(req, res, owner);
    } catch (e) {
      res.status(e instanceof WorkspaceError ? e.status : 500).json({error: {message: e instanceof WorkspaceError ? e.message : 'Project request failed. Please retry.'}});
    }
  };
  router.use('/projects', body({limit: '300kb'}));
  router.get('/projects', wrap(async (_req, res, owner) => {res.json(await projectHub(owner));}));
  router.post('/projects/connections/discover',wrap(async(req,res)=>{res.json(await discoverConnections(req.body));}));
  router.post('/projects/:id/connections',wrap(async(req,res,owner)=>{res.status(201).json(await addConnection(owner,String(req.params.id),req.body));}));
  router.post('/projects/connections/:id/sync',wrap(async(req,res,owner)=>{res.json(await syncConnection(owner,String(req.params.id)));}));
  router.post('/projects/connections/:id/remove',wrap(async(req,res,owner)=>{await removeConnection(owner,String(req.params.id));res.json({ok:true});}));
  router.post('/projects', wrap(async (req, res, owner) => {res.status(201).json(await saveProject(owner, req.body, (await loadWorkspace(owner)).store));}));
  router.put('/projects/:id', wrap(async (req, res, owner) => {res.json(await saveProject(owner, req.body, (await loadWorkspace(owner)).store, String(req.params.id)));}));
  router.put('/projects/:id/github-key', wrap(async (req, res, owner) => {await setGithubKey(owner, String(req.params.id), req.body?.key); res.json({ok: true});}));
  router.post('/projects/:id/sync', wrap(async (req, res, owner) => {res.json(await syncGithub(owner, String(req.params.id)));}));
  router.post('/projects/:id/telemetry-token', wrap(async (req, res, owner) => {res.json(await rotateTelemetry(owner, String(req.params.id), req.body?.revoke === true));}));
  router.post('/projects/:id/context', wrap(async (req, res, owner) => {
    const p = await getProject(owner, String(req.params.id)), b = object(req.body);
    if (p.contexts.length >= 20) throw new WorkspaceError(400, 'Context limit reached.');
    p.contexts.push({id: newId(), title: text(b.title, 160, true), source: text(b.source, 200, true), text: text(b.text, 16000, true), createdAt: now()});
    const saved = await q('update connected_projects set data=$3::jsonb,revision=revision+1 where owner_id=$1 and id=$2 and revision=$4 returning id', [owner, p.id, json(p), b.revision]);
    if (!saved.length) throw new WorkspaceError(409, 'Project changed. Reload before saving.');
    res.json(await getProject(owner, p.id));
  }));
  router.post('/projects/jobs/:id/retry', wrap(async (req, res, owner) => {
    const rows = await q(`update project_jobs set state='queued',attempts=0,error=null,available_at=now() where owner_id=$1 and id=$2 and state='failed' returning id`, [owner, String(req.params.id)]);
    if (!rows.length) throw new WorkspaceError(409, 'Only failed reviews can be retried.');
    res.json({ok: true});
  }));
  router.post('/projects/review/:entryId', wrap(async (req, res, owner) => {
    const {store} = await loadWorkspace(owner), entry = store.entries.find(e => e.id === req.params.entryId);
    if (!entry || entry.kind !== 'dump') throw new WorkspaceError(404, 'Spark not found.');
    if (!(store.settings as {satellites?: string[]})?.satellites?.includes('projects')) throw new WorkspaceError(400, 'Turn on the project satellite first.');
    const tags = [...new Set(Array.isArray(entry.projectIds) ? entry.projectIds as string[] : [])].sort();
    await q(`insert into project_jobs(id,owner_id,entry_id,tag_key) values($1,$2,$3,$4) on conflict(owner_id,entry_id,tag_key)
      do update set state='queued',attempts=0,error=null,available_at=now() where project_jobs.state in ('failed','no_proposal')`, [newId(), owner, entry.id, JSON.stringify(tags)]);
    res.status(202).json({queued: true});
  }));
  router.post('/projects/proposals/:id', wrap(async (req, res, owner) => {res.json(await proposalAction(owner, String(req.params.id), req.body));}));
  router.post('/projects/proposals/:id/discuss', wrap(async (req, res, owner) => {res.json(await discussProposal(owner, String(req.params.id), req.body?.revision, req.body?.text));}));
  router.post('/projects/notices', wrap(async (req, res, owner) => {
    if (!Array.isArray(req.body?.ids) || req.body.ids.length > 100 || req.body.ids.some((id: unknown) => typeof id !== 'string') || !['seen', 'dismissed'].includes(req.body.status)) throw new WorkspaceError(400, 'Invalid notification update.');
    await q(`update project_proposals set data=jsonb_set(data,'{notice}',to_jsonb($3::text)) where owner_id=$1 and id=any($2::text[])`, [owner, req.body.ids, req.body.status]);
    res.json({ok: true});
  }));
  router.get('/projects/proposals/:id/brief/:version', wrap(async (req, res, owner) => {
    const p = await getProposal(owner, String(req.params.id)), brief = p.briefs.find(b => b.version === Number(req.params.version));
    if (!brief) throw new WorkspaceError(404, 'Brief not found.');
    res.set({'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="moons-brief-v${brief.version}.md"`}).send(brief.markdown);
  }));
  // This token can only append telemetry to one project. It cannot read notes or approve work.
  router.post('/project-events', body({limit: '8kb'}), async (req, res) => {
    try {
      await initV5();
      if (limited(`project-events:${req.ip}`, 120)) throw new WorkspaceError(429, 'Please wait a minute.');
      const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
      if (!/^moons_[A-Za-z0-9_-]{43}$/.test(token)) throw new WorkspaceError(401, 'Invalid project token.');
      res.status(202).json(await acceptEvent(token, req.body));
    } catch (e) {res.status(e instanceof WorkspaceError ? e.status : 500).json({error: {message: e instanceof WorkspaceError ? e.message : 'Event ingestion failed.'}});}
  });
  return router;
}

import {Router, json as body, type Request, type Response} from 'express';
import {guest, initV5} from './lib/server/v5/workspace-store.ts';
import {WorkspaceError} from './lib/server/v5/types.ts';
import {limited} from './lib/server/http.ts';
import {isOperator, withAi} from './lib/server/v5/ai-access.ts';
import {accountId} from './lib/server/v5/identity.ts';
import {acceptRecord, addFeedback, decideBatch, decideInbox, intakeStatus, listInbox, listRecords, rotateIntake} from './lib/server/satellites/store.ts';
import {agentUsage, runDigest} from './lib/server/satellites/digest.ts';

// v8: Satellites send records here; the user reads them, runs the agent and decides the inbox.
export function satellitesRouter(checkOrigin: (req: Request) => void) {
  const router = Router();
  const fail = (res: Response, e: unknown) => res.status(e instanceof WorkspaceError ? e.status : 500).json({error: {message: e instanceof WorkspaceError ? e.message : 'Satellite request failed. Please retry.'}});
  const wrap = (fn: (req: Request, res: Response, owner: string) => Promise<void>) => async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store');
      checkOrigin(req);
      const owner = await guest(req, res);
      if (req.method !== 'GET' && limited(`satellites:${owner}`, 60)) throw new WorkspaceError(429, 'Please wait a minute.');
      await fn(req, res, owner);
    } catch (e) { fail(res, e); }
  };
  // Records from a Satellite's own server or page: a Satellite token only lets it add records to itself.
  router.post('/satellite-records', body({limit: '72kb'}), async (req, res) => {
    try {
      res.set('Access-Control-Allow-Origin', '*');
      await initV5();
      if (limited(`satellite-records:${req.ip}`, 120)) throw new WorkspaceError(429, 'Please wait a minute.');
      const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
      if (!/^msat_[A-Za-z0-9_-]{43}$/.test(token)) throw new WorkspaceError(401, 'Invalid Satellite token.');
      res.status(202).json(await acceptRecord(token, req.body));
    } catch (e) { fail(res, e); }
  });
  router.options('/satellite-records', (_req, res) => { res.set({'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST'}).status(204).end(); });
  router.use(['/satellites', '/inbox'], body({limit: '200kb'}));
  router.get('/satellites/status', wrap(async (_req, res, owner) => { res.json({intake: await intakeStatus(owner), agent: await agentUsage(owner), inbox: (await listInbox(owner)).length}); }));
  router.post('/satellites/:id/token', wrap(async (req, res, owner) => { res.json(await rotateIntake(owner, String(req.params.id), req.body?.revoke === true)); }));
  router.get('/satellites/:id/records', wrap(async (req, res, owner) => { res.json({records: await listRecords(owner, String(req.params.id), {limit: Number(req.query.limit) || 100})}); }));
  router.post('/satellites/:id/records/:record/feedback', wrap(async (req, res, owner) => { res.json(await addFeedback(owner, String(req.params.id), String(req.params.record), req.body?.text, 'me')); }));
  router.post('/satellites/:id/digest', wrap(async (req, res, owner) => {
    const trigger = req.body?.trigger === 'manual' ? 'manual' : 'open';
    res.json(await withAi(owner, () => runDigest(owner, String(req.params.id), trigger), {operator: await isOperator(accountId(req))}));
  }));
  router.get('/inbox', wrap(async (req, res, owner) => { res.json({items: await listInbox(owner, String(req.query.status ?? 'open'))}); }));
  // An approval changes the space; the reply carries the saved workspace (like an upload) so the browser takes it as is.
  router.post('/inbox/batch/:batch', wrap(async (req, res, owner) => {
    const r = await decideBatch(owner, String(req.params.batch), req.body ?? {});
    res.json(r.workspace ? {...r.workspace, result: {status: r.status, count: r.count, entryIds: r.entryIds}} : {result: {status: r.status, count: r.count}});
  }));
  router.post('/inbox/:id', wrap(async (req, res, owner) => {
    const r = await decideInbox(owner, String(req.params.id), req.body ?? {});
    res.json(r.workspace ? {...r.workspace, result: {status: r.status, entryId: r.entryId}} : {result: {status: r.status}});
  }));
  return router;
}

import {Router, json as body, type Request, type Response} from 'express';
import './autolog.ts';
import './flows.ts';
import {createHash} from 'node:crypto';
import {ALL_SCOPES, KINDS, Settings, buildNow, logicalDay, type Kind} from '@workspace/life-contract';
import {uses, type PlannerSpec} from '@workspace/planner-spec';
import {guest} from '../moons/lib/server/v5/workspace-store.ts';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {limited} from '../moons/lib/server/http.ts';
import {planGoal} from './milestones.ts';
import {isOperator, withAi} from '../moons/lib/server/v5/ai-access.ts';
import {accountId} from '../moons/lib/server/v5/identity.ts';
import {createDevToken, deleteLibrary, listDevTokens, listLibrary, ownerOfDevToken, revokeDevToken, saveLibrary, setLibraryState} from './library.ts';
import {allRecords, changesSince, deleteRecord, getSettings, getSpec, lastActivity, listRecords, putAvailability, putSettings, recordHistory, saveSpec, writeRecord} from './store.ts';

// /api/life/v1 — the planner's own reads and writes (first-party session). Consumer access with
// OAuth scopes (모의 우주, 에너지긴축모드) uses the same handlers once P3 adds the grant check.
export function lifeRouter(checkOrigin: (req: Request) => void) {
  const router = Router();
  // A planner spec can carry small photos (decorations); everything else stays small.
  const small = body({limit: '200kb'}), large = body({limit: '3mb'});
  router.use((req, res, next) => (req.path === '/spec' || req.path.startsWith('/library') || req.path.startsWith('/dev/widgets') ? large : small)(req, res, next));
  const route = (fn: (req: Request, res: Response, owner: string) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store');
      checkOrigin(req);
      const owner = await guest(req, res);
      if (req.method !== 'GET' && limited(`life:${owner}`, 600)) throw new WorkspaceError(429, 'Please wait a minute.');
      const out = await fn(req, res, owner);
      if (out !== undefined) res.json({contractVersion: '0', ...out as object});
    } catch (e) {
      const zod = (e as Error)?.name === 'ZodError';
      const status = e instanceof WorkspaceError ? e.status : zod ? 400 : 500;
      if (status === 500) req.log.error({message: (e as Error).message}, 'Life request failed');
      res.status(status).json({error: {message: status === 500 ? 'The request failed. Your records are unchanged. Please retry.' : zod ? 'Invalid request.' : (e as Error).message}});
    }
  };
  const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  const kinds = (v: unknown) => typeof v === 'string' && v ? v.split(',').filter((k): k is Kind => (KINDS as string[]).includes(k)) : undefined;

  router.get('/connection', route(async (_req, _res, owner) => {
    const s = await getSettings(owner), spec = await getSpec(owner);
    return {state: s.configured && spec ? 'ok' : 'setup_incomplete', revision: s.revision, lastActivityAt: await lastActivity(owner), scopes: ALL_SCOPES};
  }));
  router.get('/settings', route(async (_req, _res, owner) => ({settings: await getSettings(owner)})));
  router.put('/settings', route(async (req, _res, owner) => ({settings: await putSettings(owner, Settings.parse(req.body))})));
  router.put('/availability', route(async (req, _res, owner) => ({availability: await putAvailability(owner, req.body?.availability ?? null)})));
  router.get('/spec', route(async (_req, _res, owner) => ({planner: await getSpec(owner)})));
  router.put('/spec', route(async (req, _res, owner) => ({planner: await saveSpec(owner, req.body?.spec)})));

  // 내 라이브러리: saved widgets, templates, skins and manifest widgets.
  router.get('/library', route(async (_req, _res, owner) => ({items: await listLibrary(owner)})));
  router.post('/library', route(async (req, res, owner) => { res.status(201); return {item: await saveLibrary(owner, req.body ?? {})}; }));
  router.patch('/library/:id', route(async (req, _res, owner) => ({item: await setLibraryState(owner, String(req.params.id), {enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined, approve: typeof req.body?.approve === 'boolean' ? req.body.approve : undefined, name: typeof req.body?.name === 'string' ? req.body.name : undefined})})));
  router.delete('/library/:id', route(async (req, _res, owner) => deleteLibrary(owner, String(req.params.id))));
  // Developer tokens (made in the lit menu) and publishing a widget from the command line.
  router.get('/dev/tokens', route(async (_req, _res, owner) => ({tokens: await listDevTokens(owner)})));
  router.post('/dev/tokens', route(async (req, res, owner) => { res.status(201); return createDevToken(owner, String(req.body?.label ?? '')); }));
  router.delete('/dev/tokens/:id', route(async (req, _res, owner) => revokeDevToken(owner, String(req.params.id))));
  router.post('/dev/widgets', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const token = /^Bearer\s+(litdev_[\w-]+)$/.exec(req.get('authorization') ?? '')?.[1];
      if (!token) throw new WorkspaceError(401, 'Authorization: Bearer litdev_… 가 필요해요.');
      const owner = await ownerOfDevToken(token);
      if (limited(`litdev:${owner}`, 60)) throw new WorkspaceError(429, 'Please wait a minute.');
      // Published code is never approved automatically: the user approves it in lit (권한 확인).
      res.status(201).json({item: await saveLibrary(owner, {kind: 'custom', data: {manifest: req.body?.manifest ?? req.body}}, 'developer')});
    } catch (e) { res.status(e instanceof WorkspaceError ? e.status : 500).json({error: {message: e instanceof WorkspaceError ? e.message : 'Publish failed.'}}); }
  });

  router.get('/items', route(async (req, _res, owner) => {
    const basis = ['logical_day', 'due', 'occurred'].includes(String(req.query.basis)) ? req.query.basis as 'logical_day' : 'logical_day';
    return {basis, ...await listRecords(owner, {from: day(req.query.from), to: day(req.query.to), basis, kinds: kinds(req.query.kinds), cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined, limit: Number(req.query.limit) || undefined, includeDeleted: req.query.includeDeleted === 'true'})};
  }));
  router.post('/items', route(async (req, res, owner) => { res.status(201); return {item: await writeRecord(owner, null, req.body)}; }));
  router.put('/items/:id', route(async (req, _res, owner) => ({item: await writeRecord(owner, String(req.params.id), req.body)})));
  router.delete('/items/:id', route(async (req, _res, owner) => ({item: await deleteRecord(owner, String(req.params.id))})));
  router.get('/items/:id/history', route(async (req, _res, owner) => ({items: await recordHistory(owner, String(req.params.id))})));
  router.get('/changes', route(async (req, _res, owner) => changesSince(owner, Math.max(0, Number(req.query.since) || 0), Number(req.query.limit) || undefined)));

  // AI: naive goal → milestone drafts. Counted in the same daily AI limit and cost ledger as MOONS.
  // AI: naive goal → questions until it is concrete → goal + milestones with effort. Same daily AI limit and cost ledger as MOONS.
  router.post('/ai/goal', route(async (req, _res, owner) => {
    if (limited(`life-ai:${owner}`, 10)) throw new WorkspaceError(429, 'Please wait a minute.');
    return withAi(owner, () => planGoal(req.body ?? {}), {operator: await isOperator(accountId(req))});
  }));
  // The compact "right now" for chat consumers. ETag covers the data, not the clock: 304 means nothing was written.
  router.get('/now', route(async (req, res, owner) => {
    const settings = await getSettings(owner), at = new Date();
    const tag = `W/"${createHash('sha256').update(`${settings.revision}|${logicalDay(at, settings)}|${ALL_SCOPES.join(',')}`).digest('base64url').slice(0, 22)}"`;
    res.set({ETag: tag, 'Cache-Control': 'private, no-cache'});
    if (req.get('if-none-match') === tag) { res.status(304).end(); return undefined; }
    const spec = (await getSpec(owner))?.spec as PlannerSpec | undefined;
    return buildNow(await allRecords(owner), settings, at, {revision: settings.revision, scopes: ALL_SCOPES, lastActivityAt: await lastActivity(owner), modules: {sleep: !!spec && uses(spec, 'sleep'), condition: !!spec && uses(spec, 'condition'), timer: !!spec && uses(spec, 'timer')}});
  }));
  return router;
}

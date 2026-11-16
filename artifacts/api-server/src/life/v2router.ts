import {Router, json as body, type Request, type Response} from 'express';
import {v2} from '@workspace/life-contract';
import {evalSignal, itemView, periodRange, query, tidyReport, type SourceLike} from '@workspace/lit-core';
import {guest} from '../moons/lib/server/v5/workspace-store.ts';
import {WorkspaceError} from '../moons/lib/server/v5/types.ts';
import {limited} from '../moons/lib/server/http.ts';
import {getSettings, recordHistory} from './store.ts';
import {acceptSuggestion, ctxOf, deleteV2, listSuggestions, loadWorkspace, mergeProperties, previewRule, runMoment, saveV2, suggestDatabase, understand} from './v2.ts';

// /api/life/v2 — lit v2 (docs/lit/V2_DESIGN.md §2). Same session and store as v1; v1 keeps serving the old planner.
export function lifeV2Router(checkOrigin: (req: Request) => void) {
  const router = Router();
  router.use(body({limit: '500kb'}));
  const route = (fn: (req: Request, res: Response, owner: string) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.set('Cache-Control', 'no-store');
      checkOrigin(req);
      const owner = await guest(req, res);
      if (req.method !== 'GET' && limited(`life:${owner}`, 600)) throw new WorkspaceError(429, 'Please wait a minute.');
      const out = await fn(req, res, owner);
      if (out !== undefined) res.json({contractVersion: '2', ...out as object});
    } catch (e) {
      const zod = (e as Error)?.name === 'ZodError';
      const status = e instanceof WorkspaceError ? e.status : zod ? 400 : 500;
      if (status === 500) req.log.error({message: (e as Error).message}, 'Life v2 request failed');
      res.status(status).json({error: {message: status === 500 ? 'The request failed. Your records are unchanged. Please retry.' : zod ? 'Invalid request.' : (e as Error).message}});
    }
  };
  const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

  // Everything the user defined (not the items): properties, databases, lenses, signals, rules.
  router.get('/workspace', route(async (_req, _res, owner) => {
    const ws = await loadWorkspace(owner), s = await getSettings(owner);
    return {settings: {tz: s.tz, dayBoundary: s.dayBoundary}, today: (await ctxOf(owner)).today,
      properties: [...ws.properties.values()], databases: [...ws.databases.values()], lenses: [...ws.lenses.values()], signals: [...ws.signals.values()], rules: [...ws.rules.values()]};
  }));
  // Items with their computed values. A source (lens, databases, conditions) and an optional day range.
  router.post('/query', route(async (req, _res, owner) => {
    const ws = await loadWorkspace(owner), ctx = await ctxOf(owner);
    const src = v2.Source.parse(req.body?.source ?? {}) as SourceLike;
    const [from, to] = req.body?.period && (v2.PERIODS as readonly string[]).includes(req.body.period) ? periodRange(req.body.period, ctx.today) : [day(req.body?.from) ?? '0000-01-01', day(req.body?.to) ?? '9999-12-31'];
    const views = query(ws, src, ctx).map(x => itemView(ws, x, ctx)).filter(v => v.day >= from && v.day <= to);
    const limit = Math.min(2000, Math.max(1, Number(req.body?.limit) || 500));
    return {items: views.slice(0, limit), total: views.length};
  }));
  router.post('/records', route(async (req, res, owner) => { res.status(201); return saveV2(owner, null, req.body ?? {}); }));
  router.put('/records/:id', route(async (req, _res, owner) => saveV2(owner, String(req.params.id), req.body ?? {})));
  router.delete('/records/:id', route(async (req, _res, owner) => ({record: await deleteV2(owner, String(req.params.id))})));
  router.get('/records/:id/history', route(async (req, _res, owner) => ({items: await recordHistory(owner, String(req.params.id))})));

  router.post('/moments', route(async (req, _res, owner) => {
    const kind = req.body?.kind, at = String(req.body?.at ?? '');
    if (kind === 'dayStart') return runMoment(owner, {kind});
    if (kind === 'time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return runMoment(owner, {kind, at});
    throw new WorkspaceError(400, 'Unknown moment.');
  }));
  router.get('/rules/:id/preview', route(async (req, _res, owner) => ({plans: await previewRule(owner, String(req.params.id))})));
  router.get('/suggestions', route(async (_req, _res, owner) => ({plans: await listSuggestions(owner)})));
  router.post('/suggestions/accept', route(async (req, _res, owner) => acceptSuggestion(owner, String(req.body?.rule ?? ''), String(req.body?.item ?? ''))));
  router.get('/signals/:id', route(async (req, _res, owner) => evalSignal(await loadWorkspace(owner), String(req.params.id), await ctxOf(owner))));

  router.get('/tidy', route(async (_req, _res, owner) => tidyReport(await loadWorkspace(owner))));
  router.post('/properties/merge', route(async (req, _res, owner) => mergeProperties(owner, String(req.body?.from ?? ''), String(req.body?.into ?? ''))));
  router.post('/infer', route(async (req, _res, owner) => suggestDatabase(owner, Array.isArray(req.body?.items) ? req.body.items.map(String).slice(0, 500) : [])));
  router.post('/capture', route(async (req, _res, owner) => understand(owner, String(req.body?.line ?? '').slice(0, 2000))));
  return router;
}

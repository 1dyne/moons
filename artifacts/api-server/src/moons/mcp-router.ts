import express, {Router, type Request, type Response} from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {getOAuthProtectedResourceMetadataUrl, mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {requireBearerAuth} from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {checkOrigin} from './workspace-router';
import {guest} from './lib/server/v5/workspace-store.ts';
import {WorkspaceError} from './lib/server/v5/types.ts';
import {limited} from './lib/server/http.ts';
import {accountId} from './lib/server/v5/identity.ts';
import {clerkEnabled} from './lib/server/product-config.ts';
import {connectedClients, decideRequest, disconnectClient, pendingRequest, provider, publicBase, SCOPES} from './lib/server/mcp/oauth.ts';
import {GUIDE_VERSION, registerTools} from './lib/server/mcp/tools.ts';

// v8 4: the MOONS MCP server (Streamable HTTP, stateless) behind MOONS's own OAuth.
export function mcpRouter() {
  const router = Router();
  const base = publicBase(), resource = new URL(`${base}/mcp`);
  router.use(mcpAuthRouter({provider, issuerUrl: new URL(base), resourceServerUrl: resource, scopesSupported: SCOPES, resourceName: 'MOONS'}));
  const fail = (res: Response, e: unknown) => res.status(e instanceof WorkspaceError ? e.status : 500).json({error: {message: e instanceof WorkspaceError ? e.message : 'Connection request failed.'}});
  const signedIn = async (req: Request, res: Response) => {
    checkOrigin(req);
    // With accounts on, connecting an AI needs a signed-in account so the space is the person's own.
    if (clerkEnabled() && !accountId(req)) throw new WorkspaceError(401, 'Sign in to MOONS first.');
    return guest(req, res);
  };
  router.get('/api/oauth/requests/:id', async (req, res) => { try { res.set('Cache-Control', 'no-store').json(await pendingRequest(String(req.params.id))); } catch (e) { fail(res, e); } });
  router.post('/api/oauth/requests/:id', express.json(), async (req, res) => {
    try { const owner = await signedIn(req, res); res.json(await decideRequest(String(req.params.id), owner, req.body?.approve === true)); } catch (e) { fail(res, e); }
  });
  router.get('/api/oauth/clients', async (req, res) => { try { res.set('Cache-Control', 'no-store').json({clients: await connectedClients(await guest(req, res)), endpoint: resource.href}); } catch (e) { fail(res, e); } });
  router.post('/api/oauth/clients/:id/disconnect', async (req, res) => { try { checkOrigin(req); res.json(await disconnectClient(await guest(req, res), String(req.params.id))); } catch (e) { fail(res, e); } });
  router.all('/mcp', express.json({limit: '1mb'}), requireBearerAuth({verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource)}), async (req, res) => {
    const owner = (req as Request & {auth?: {extra?: {owner?: string}}}).auth?.extra?.owner ?? '';
    if (limited(`mcp:${owner}`, 120)) { res.status(429).json({jsonrpc: '2.0', error: {code: -32000, message: 'Too many requests. Wait a minute.'}, id: null}); return; }
    if (req.method !== 'POST') { res.status(405).set('Allow', 'POST').end(); return; }
    const server = new McpServer({name: 'MOONS', version: GUIDE_VERSION}, {instructions: 'MOONS: the user\'s knowledge base. Call moons_guide first. Anything entering the user\'s knowledge goes to the MOONS inbox for approval.'});
    registerTools(server);
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({jsonrpc: '2.0', error: {code: -32603, message: 'MOONS MCP failed.'}, id: null}); }
  });
  return router;
}

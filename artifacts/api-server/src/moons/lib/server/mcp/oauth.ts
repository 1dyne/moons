// v8 4.1: MOONS is its own OAuth 2.1 authorization server for the MOONS MCP (PKCE, dynamic client registration).
// The consent page is a MOONS page, so the person is whoever is signed in to MOONS; a token belongs to one space only.
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import type {Response} from 'express';
import type {OAuthServerProvider, AuthorizationParams} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {OAuthRegisteredClientsStore} from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {AuthInfo} from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest} from '@modelcontextprotocol/sdk/shared/auth.js';
import {InvalidGrantError, InvalidTokenError} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {json, q} from '../db.ts';
import {initV5} from '../v5/workspace-store.ts';
import {WorkspaceError} from '../v5/types.ts';

export const OAUTH_TABLES = [
  `create table if not exists oauth_clients(client_id text primary key,data jsonb not null,created_at timestamptz not null default now())`,
  `create table if not exists oauth_requests(id text primary key,client_id text not null,params jsonb not null,expires_at timestamptz not null)`,
  `create table if not exists oauth_codes(code_hash text primary key,client_id text not null,owner_id text not null,challenge text not null,redirect_uri text not null,scopes text not null,resource text,expires_at timestamptz not null,used boolean not null default false)`,
  `create table if not exists oauth_tokens(token_hash text primary key,kind text not null,client_id text not null,owner_id text not null,scopes text not null,resource text,expires_at timestamptz not null,revoked boolean not null default false,created_at timestamptz not null default now(),last_used_at timestamptz)`,
  `create index if not exists oauth_tokens_owner on oauth_tokens(owner_id,client_id)`,
];
export const SCOPES = ['moons'];
const ACCESS_SECONDS = 3600, REFRESH_DAYS = 60;
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

/** Where MOONS is reachable from outside (OAuth issuer and MCP resource). */
export function publicBase() {
  const explicit = process.env.MOONS_PUBLIC_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.PORT ?? 8080}`;
}

const clients: OAuthRegisteredClientsStore = {
  async getClient(id) {
    await initV5();
    return (await q<{data: OAuthClientInformationFull}>('select data from oauth_clients where client_id=$1', [id]))[0]?.data;
  },
  async registerClient(client) {
    await initV5();
    const full = {...client, client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000)} as OAuthClientInformationFull;
    await q('insert into oauth_clients(client_id,data) values($1,$2::jsonb)', [full.client_id, json(full)]);
    return full;
  },
};

async function issue(clientId: string, owner: string, scopes: string, resource: string | null): Promise<OAuthTokens> {
  const access = secret('mat'), refresh = secret('mrt');
  await q(`insert into oauth_tokens(token_hash,kind,client_id,owner_id,scopes,resource,expires_at) values($1,'access',$2,$3,$4,$5,now()+interval '${ACCESS_SECONDS} seconds'),($6,'refresh',$2,$3,$4,$5,now()+interval '${REFRESH_DAYS} days')`,
    [hash(access), clientId, owner, scopes, resource, hash(refresh)]);
  return {access_token: access, token_type: 'bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: scopes};
}

export const provider: OAuthServerProvider = {
  get clientsStore() { return clients; },
  /** The authorize step parks the request and sends the person to the MOONS consent page. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    await initV5();
    const id = randomUUID();
    await q(`insert into oauth_requests(id,client_id,params,expires_at) values($1,$2,$3::jsonb,now()+interval '15 minutes')`, [id, client.client_id,
      json({state: params.state, scopes: params.scopes?.length ? params.scopes : SCOPES, codeChallenge: params.codeChallenge, redirectUri: params.redirectUri, resource: params.resource?.href})]);
    res.redirect(`${publicBase()}/connect/${id}`);
  },
  async challengeForAuthorizationCode(_client, code) {
    const row = (await q<{challenge: string}>('select challenge from oauth_codes where code_hash=$1 and used=false and expires_at>now()', [hash(code)]))[0];
    if (!row) throw new InvalidGrantError('Invalid or expired authorization code.');
    return row.challenge;
  },
  async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
    const rows = await q<{owner_id: string; redirect_uri: string; scopes: string; resource: string | null}>(
      'update oauth_codes set used=true where code_hash=$1 and client_id=$2 and used=false and expires_at>now() returning owner_id,redirect_uri,scopes,resource', [hash(code), client.client_id]);
    const row = rows[0];
    if (!row) throw new InvalidGrantError('Invalid or expired authorization code.');
    if (redirectUri && redirectUri !== row.redirect_uri) throw new InvalidGrantError('Redirect URI does not match.');
    return issue(client.client_id, row.owner_id, row.scopes, row.resource);
  },
  async exchangeRefreshToken(client, refreshToken) {
    const rows = await q<{owner_id: string; scopes: string; resource: string | null}>(
      `update oauth_tokens set revoked=true where token_hash=$1 and kind='refresh' and client_id=$2 and revoked=false and expires_at>now() returning owner_id,scopes,resource`, [hash(refreshToken), client.client_id]);
    const row = rows[0];
    if (!row) throw new InvalidGrantError('Invalid refresh token.');
    return issue(client.client_id, row.owner_id, row.scopes, row.resource);
  },
  async verifyAccessToken(token): Promise<AuthInfo> {
    await initV5();
    const row = (await q<{client_id: string; owner_id: string; scopes: string; expires_at: string; resource: string | null}>(
      `update oauth_tokens set last_used_at=now() where token_hash=$1 and kind='access' and revoked=false and expires_at>now() returning client_id,owner_id,scopes,expires_at::text,resource`, [hash(token)]))[0];
    if (!row) throw new InvalidTokenError('Invalid or expired token.');
    return {token, clientId: row.client_id, scopes: row.scopes.split(' ').filter(Boolean), expiresAt: Math.floor(Date.parse(row.expires_at) / 1000),
      ...(row.resource ? {resource: new URL(row.resource)} : {}), extra: {owner: row.owner_id}};
  },
  async revokeToken(client, request: OAuthTokenRevocationRequest) {
    await q('update oauth_tokens set revoked=true where token_hash=$1 and client_id=$2', [hash(request.token), client.client_id]);
  },
};

// ---------- the consent page's API ----------
export async function pendingRequest(id: string) {
  const row = (await q<{client_id: string; params: {scopes: string[]; redirectUri: string}}>('select client_id,params from oauth_requests where id=$1 and expires_at>now()', [id]))[0];
  if (!row) throw new WorkspaceError(404, 'This connection request expired. Start again from your AI.');
  const client = await clients.getClient(row.client_id);
  return {clientName: client?.client_name ?? 'AI client', clientUri: client?.client_uri, redirectHost: new URL(row.params.redirectUri).host, scopes: row.params.scopes};
}
/** The signed-in person approves (or declines): a one-time code is bound to their space and they go back to the AI. */
export async function decideRequest(id: string, owner: string, approve: boolean) {
  const rows = await q<{client_id: string; params: {state?: string; scopes: string[]; codeChallenge: string; redirectUri: string; resource?: string}}>('delete from oauth_requests where id=$1 and expires_at>now() returning client_id,params', [id]);
  const row = rows[0];
  if (!row) throw new WorkspaceError(404, 'This connection request expired. Start again from your AI.');
  const target = new URL(row.params.redirectUri);
  if (row.params.state) target.searchParams.set('state', row.params.state);
  if (!approve) { target.searchParams.set('error', 'access_denied'); return {redirect: target.href}; }
  const code = secret('mac');
  await q(`insert into oauth_codes(code_hash,client_id,owner_id,challenge,redirect_uri,scopes,resource,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
    [hash(code), row.client_id, owner, row.params.codeChallenge, row.params.redirectUri, row.params.scopes.join(' '), row.params.resource ?? null]);
  target.searchParams.set('code', code);
  return {redirect: target.href};
}
/** Connected AIs for settings: one row per client with a live token; disconnecting revokes all of its tokens. */
export async function connectedClients(owner: string) {
  const rows = await q<{client_id: string; data: OAuthClientInformationFull; last: string | null; since: string}>(`select t.client_id,c.data,max(t.last_used_at)::text last,min(t.created_at)::text since from oauth_tokens t join oauth_clients c on c.client_id=t.client_id
    where t.owner_id=$1 and t.revoked=false and t.expires_at>now() group by t.client_id,c.data`, [owner]);
  return rows.map(r => ({clientId: r.client_id, name: r.data.client_name ?? 'AI client', lastUsedAt: r.last, connectedAt: r.since}));
}
export async function disconnectClient(owner: string, clientId: string) {
  await q('update oauth_tokens set revoked=true where owner_id=$1 and client_id=$2', [owner, clientId]);
  return {ok: true};
}

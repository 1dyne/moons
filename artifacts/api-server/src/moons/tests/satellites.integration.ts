import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {SCHEMA,q,newId,type Driver} from '../lib/server/db.ts';
import {initV5,loadWorkspace} from '../lib/server/v5/workspace-store.ts';
import {acceptRecord,changeStore,decideInbox,listInbox,rotateIntake,type Satellite} from '../lib/server/satellites/store.ts';
import {provider,decideRequest,connectedClients,disconnectClient} from '../lib/server/mcp/oauth.ts';
const memory=new PGlite();let owner:string,other:string;
before(async()=>{
 await memory.exec(SCHEMA);const driver:Driver={query:(s,p)=>memory.query(s,p) as ReturnType<Driver['query']>,transaction:fn=>memory.transaction(tx=>fn({query:(s,p)=>tx.query(s,p) as ReturnType<Driver['query']>}))};
 (globalThis as unknown as {__moonsDb:Promise<Driver>}).__moonsDb=Promise.resolve(driver);await initV5();owner=newId();other=newId();await q('insert into guests(id) values($1),($2)',[owner,other]);
 await changeStore(owner,s=>{s.satellites=[{id:'sat',name:'TEPS',icon:'Orbit',description:'',kind:'external',url:'https://x.example',embed:'auto',madeBy:{type:'ai'},planetIds:['p-learning'],show:true,agent:{mode:'off'},createdAt:'',updatedAt:''} as Satellite]});
});

test('a Satellite token adds records only to its own space; the button draft becomes a record note on approval', async()=>{
 const {token}=await rotateIntake(owner,'sat');
 await assert.rejects(rotateIntake(other,'sat'),/not found/);
 assert.deepEqual(await acceptRecord(token!,{id:'r1',kind:'note',title:'묶은 어휘',userText:['내가 쓴 문장.'],concepts:['affluent'],apply:'request'}),{accepted:true,duplicate:false,id:'r1'});
 assert.equal((await acceptRecord(token!,{id:'r1'})).duplicate,true);
 await assert.rejects(acceptRecord('msat_'+'x'.repeat(43),{id:'r2'}),/Invalid Satellite token/);
 assert.equal((await listInbox(other)).length,0);
 const [item]=await listInbox(owner);
 const r=await decideInbox(owner,item!.id,{action:'approve'});
 const note=(await loadWorkspace(owner)).store.entries.find(e=>e.id===r.entryId)!;
 assert.equal(note.kind,'record');assert.deepEqual(note.planetIds,['p-learning']);assert.equal(note.body,'내가 쓴 문장.\n묶은 어휘');
 await assert.rejects(decideInbox(owner,item!.id,{action:'approve'}),/Already decided/);
 await rotateIntake(owner,'sat',true);
 await assert.rejects(acceptRecord(token!,{id:'r3'}),/Invalid Satellite token/);
});

test('OAuth: a code is bound to the approving space, used once, and tokens can be refreshed and disconnected', async()=>{
 const client=await provider.clientsStore.registerClient!({client_name:'Claude',redirect_uris:['https://claude.ai/api/mcp/auth_callback'],token_endpoint_auth_method:'none'} as never);
 const res={redirect:(u:string)=>{res.to=u},to:''} as unknown as {redirect:(u:string)=>void;to:string};
 const verifier='v'.repeat(50),challenge=createHash('sha256').update(verifier).digest('base64url');
 await provider.authorize(client,{codeChallenge:challenge,redirectUri:'https://claude.ai/api/mcp/auth_callback',state:'s1',scopes:['moons']},res as never);
 const reqId=res.to.split('/connect/')[1]!;
 const back=new URL((await decideRequest(reqId,owner,true)).redirect);
 assert.equal(back.searchParams.get('state'),'s1');
 const code=back.searchParams.get('code')!;
 assert.equal(await provider.challengeForAuthorizationCode(client,code),challenge);
 const tokens=await provider.exchangeAuthorizationCode(client,code,verifier,'https://claude.ai/api/mcp/auth_callback');
 await assert.rejects(provider.exchangeAuthorizationCode(client,code,verifier),/Invalid or expired/);
 const info=await provider.verifyAccessToken(tokens.access_token);
 assert.equal(info.extra?.owner,owner);
 const next=await provider.exchangeRefreshToken(client,tokens.refresh_token!);
 await assert.rejects(provider.exchangeRefreshToken(client,tokens.refresh_token!),/Invalid refresh/);
 assert.equal((await connectedClients(owner)).length,1);
 await disconnectClient(owner,client.client_id);
 await assert.rejects(provider.verifyAccessToken(next.access_token),/Invalid or expired/);
 await assert.rejects(decideRequest(reqId,owner,true),/expired/);
});

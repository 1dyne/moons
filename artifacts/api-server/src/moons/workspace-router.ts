import {Router,json as jsonBody,type IRouter,type Request,type Response} from 'express';
import multer from 'multer';
import {GetWorkspaceResponse,SaveWorkspaceBody,WorkspaceActionBody} from '@workspace/api-zod';
import {guest,loadWorkspace,persistWorkspace,validateStore,locked} from './lib/server/v5/workspace-store';
import {action,materialEntry,transcribeAudio} from './lib/server/v5/workspace-actions';
import {saveObject,readObject} from './lib/server/v5/storage';
import {WorkspaceError} from './lib/server/v5/types';
import {limited,isAdmin} from './lib/server/http';
import {refreshNotifications} from './lib/server/v5/notifications';
import {q,newId} from './lib/server/db';
import {runDaily} from './lib/server/v5/daily';
import {ownsRecording} from './lib/server/v5/claim';
import {applyDeviceChanges,parseOps} from './lib/server/v5/sync';
import {draftFormFromPhoto} from './lib/server/v5/form-photo';
import {extractPdf} from './lib/server/v5/pdf-material';
import {createShare,listShares,readEvents,readShare,revokeShare} from './lib/server/v5/shares';
import {initV5} from './lib/server/v5/workspace-store';
import {aiStatus,isOperator,removeKey,saveKey,setModels,usageReport,withAi} from './lib/server/v5/ai-access';
import {decideImpostor,impostorDetail,impostorNodeIds} from './lib/server/v5/impostor';
import {addOriginal,createTeam,invite,join,myTeams,shareAnswer,takeOriginal,teamView,unshare} from './lib/server/v5/teams';
import {accountId} from './lib/server/v5/identity';
import {readNotation} from './lib/server/v5/notation';
import {projectsRouter} from './projects-router';
import {satellitesRouter} from './satellites-router';

const router:IRouter=Router();
const HAND_MODEL_URL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const parse=jsonBody({limit:'6mb'});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:5}});
const photoUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}});
router.get('/assets/hand-landmarker',async(req,res)=>{
 try{
  // Off Replit, hand control uses MediaPipe's published model.
  if(!process.env.PUBLIC_OBJECT_SEARCH_PATHS){res.redirect(302,HAND_MODEL_URL);return}
  const root=process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(',')[0]?.trim().replace(/^\//,'');
  if(!root){res.status(503).json({error:{message:'Hand-control model storage is not configured.'}});return}
  const data=await readObject(`${root}/assets/moons-hand-landmarker-v1.task`);
  res.set({'Content-Type':'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable'}).send(data);
 }catch(error){req.log.error({message:(error as Error).message},'Hand model unavailable');res.status(503).json({error:{message:'Hand controls are unavailable. Mouse and touch still work.'}})}
});
export function checkOrigin(req:Request) {
 const origin=req.get('origin');
 if(origin){let host='';try{host=new URL(origin).host}catch{throw new WorkspaceError(403,'Invalid request origin.')}
  if(![req.get('host'),req.get('x-forwarded-host')].includes(host))throw new WorkspaceError(403,'Cross-origin changes are not allowed.');
 }
}
function route(handler:(req:Request,res:Response)=>Promise<void>){return async(req:Request,res:Response)=>{try{res.set('Cache-Control','no-store');await handler(req,res)}catch(error){
 const status=error instanceof WorkspaceError?error.status:(error as Error).name==='ZodError'?400:500;
 req.log.error({message:(error as Error).message},'MOONS workspace request failed');
 res.status(status).json({error:{code:status===409?'CONFLICT':'WORKSPACE_ERROR',message:status===500?'The request failed. Your original data is preserved. Please retry.':status===400&&(error as Error).name==='ZodError'?'Invalid workspace request.':(error as Error).message}});
 }}}
router.get('/workspace',route(async(req,res)=>{
 const owner=await guest(req,res);
 const state=await loadWorkspace(owner);
 res.json(GetWorkspaceResponse.parse({guestId:owner,...state}));
}));
router.put('/workspace',parse,route(async(req,res)=>{
 checkOrigin(req);const input=SaveWorkspaceBody.parse(req.body);const owner=await guest(req,res);
 await locked(owner,async()=>{const current=await loadWorkspace(owner);if(input.revision!==current.revision)throw new WorkspaceError(409,'This space changed in another tab. Reload before saving.');
  const store=validateStore(input.store,current.store);
  res.json(await persistWorkspace(owner,input.revision,store));
 });
}));
router.post('/workspace/ops',parse,route(async(req,res)=>{
 checkOrigin(req);const input=parseOps(req.body);const owner=await guest(req,res);
 res.json(await locked(owner,()=>applyDeviceChanges(owner,input)));
}));
router.post('/workspace/actions',parse,route(async(req,res)=>{
 checkOrigin(req);const input=WorkspaceActionBody.parse(req.body);const owner=await guest(req,res);
 if(limited(`workspace:${owner}`,30))throw new WorkspaceError(429,'Please wait a minute before sending more requests.');
 await locked(owner,async()=>{
  const current=await loadWorkspace(owner);if(input.revision!==current.revision)throw new WorkspaceError(409,'This space changed in another tab. Reload before retrying.');
  const store=structuredClone(current.store);
  const usesAi=['analyze','compare','chat','concepts','question_ai','chat_note','explore_map'].includes(input.kind);
  const result=usesAi?await withAi(owner,()=>action(owner,store,input.kind,input.payload),{operator:await isOperator(accountId(req))}):await action(owner,store,input.kind,input.payload);
  const planted=input.kind==='analyze'?await impostorNodeIds(owner):undefined;
  const response=await persistWorkspace(owner,current.revision,validateStore(store,current.store,planted));
  if(input.kind==='import'&&'importHash' in result&&result.importHash)await q('insert into workspace_imports(owner_id,content_hash) values($1,$2) on conflict do nothing',[owner,result.importHash]);
  res.json({...response,result});
 });
}));
router.post('/personal/material-audio',upload.single('file'),route(async(req,res)=>{
 checkOrigin(req);const owner=await guest(req,res);
 if(limited(`audio:${owner}`,4))throw new WorkspaceError(429,'Please wait before uploading another recording.');
 if(!req.file)throw new WorkspaceError(400,'Choose a recording to upload.');
 await locked(owner,async()=>{
  const current=await loadWorkspace(owner);
  if(Number(req.body.revision)!==current.revision)throw new WorkspaceError(409,'This space changed before the upload. Reload and retry.');
  const transcript=await withAi(owner,()=>transcribeAudio(req.file!.buffer,req.file!.originalname,req.file!.mimetype),{operator:await isOperator(accountId(req))});
  const objectPath=await saveObject(owner,newId(),req.file!.buffer,req.file!.mimetype);
  const store=structuredClone(current.store);
  const result=await materialEntry(store,{adapter:'audio',title:req.body.title||req.file!.originalname,...transcript,objectPath,mime:req.file!.mimetype,defaultPlanet:req.body.defaultPlanet},true);
  res.json({...await persistWorkspace(owner,current.revision,validateStore(store,current.store)),result});
 });
}));
// PDF materials (v7 6.4): the file is kept, its text layer becomes the original, every sentence keeps its page.
router.post('/personal/material-pdf',upload.single('file'),route(async(req,res)=>{
 checkOrigin(req);const owner=await guest(req,res);
 if(limited(`pdf:${owner}`,6))throw new WorkspaceError(429,'Please wait before uploading another PDF.');
 if(!req.file)throw new WorkspaceError(400,'Choose a PDF to upload.');
 if(req.file.mimetype!=='application/pdf'&&!/\.pdf$/i.test(req.file.originalname))throw new WorkspaceError(400,'Only PDF files for now.');
 const extracted=await extractPdf(req.file.buffer).catch(e=>{if(e instanceof WorkspaceError)throw e;throw new WorkspaceError(422,'This PDF could not be read.')});
 await locked(owner,async()=>{
  const current=await loadWorkspace(owner);
  if(Number(req.body.revision)!==current.revision)throw new WorkspaceError(409,'This space changed before the upload. Reload and retry.');
  const objectPath=await saveObject(owner,newId(),req.file!.buffer,'application/pdf');
  const store=structuredClone(current.store);
  const name=Buffer.from(req.file!.originalname,'latin1').toString('utf8').replace(/\.pdf$/i,'');
  const result=await materialEntry(store,{adapter:'pdf',title:req.body.title||extracted.title||name,text:extracted.text.slice(0,60000),sentencePages:extracted.sentencePages,objectPath,mime:'application/pdf',defaultPlanet:req.body.defaultPlanet},true);
  res.json({...await persistWorkspace(owner,current.revision,validateStore(store,current.store)),result});
 });
}));
router.post('/forms/from-photo',photoUpload.single('image'),route(async(req,res)=>{
 checkOrigin(req);const owner=await guest(req,res);
 if(limited(`form-photo:${owner}`,6))throw new WorkspaceError(429,'Please wait a minute before reading another photo.');
 if(!req.file)throw new WorkspaceError(400,'Choose a photo first.');
 const file=req.file;res.json({draft:await withAi(owner,()=>draftFormFromPhoto(file.buffer,file.mimetype),{operator:await isOperator(accountId(req))})});
}));
router.get('/workspace/events',route(async(req,res)=>{
 const owner=await guest(req,res);
 const after=Math.max(0,Number(req.query.after)||0),limit=Math.min(5000,Math.max(1,Number(req.query.limit)||2000));
 res.json(await readEvents(owner,after,limit));
}));
router.get('/ai/status',route(async(req,res)=>{res.json(await aiStatus(await guest(req,res),await isOperator(accountId(req))))}));
// Operators only: the model for each step, and what AI has cost.
async function operator(req:Request,res:Response){const owner=await guest(req,res);if(!await isOperator(accountId(req)))throw new WorkspaceError(403,'Only operator accounts can do this.');return owner}
router.put('/ai/models',parse,route(async(req,res)=>{checkOrigin(req);const owner=await operator(req,res);await setModels(owner,req.body?.models);res.json(await aiStatus(owner,true))}));
router.get('/ai/usage',route(async(req,res)=>{const owner=await operator(req,res);res.json(await usageReport(owner,Number(req.query.days)||30))}));
router.put('/ai/key',parse,route(async(req,res)=>{checkOrigin(req);const owner=await guest(req,res);
 if(limited(`ai-key:${owner}`,10))throw new WorkspaceError(429,'Please wait a minute.');
 await saveKey(owner,req.body?.provider,req.body?.key);res.json(await aiStatus(owner))}));
router.delete('/ai/key',route(async(req,res)=>{checkOrigin(req);const owner=await guest(req,res);await removeKey(owner);res.json(await aiStatus(owner))}));
// Beta feedback: only what the user typed and the page they were on. Read by the operator with ADMIN_TOKEN.
router.post('/feedback',parse,route(async(req,res)=>{checkOrigin(req);const owner=await guest(req,res);
 if(limited(`feedback:${owner}`,10))throw new WorkspaceError(429,'Please wait a minute.');
 const text=typeof req.body?.text==='string'?req.body.text.trim().slice(0,4000):'';if(!text)throw new WorkspaceError(400,'Write your feedback first.');
 const page=typeof req.body?.page==='string'?req.body.page.slice(0,200):null;
 await q('insert into feedback(id,owner_id,text,page) values($1,$2,$3,$4)',[newId(),owner,text,page]);res.json({ok:true})}));
// Temporary, while analysis quality is being tuned (ANALYSIS_REVIEW=off turns it off). Only when the user
// presses "Send for review" on one structure: that note's text, its analysis and the symbols that applied.
export const analysisReviewOn=()=>process.env.ANALYSIS_REVIEW!=='off';
router.post('/analysis-review',parse,route(async(req,res)=>{checkOrigin(req);const owner=await guest(req,res);
 if(!analysisReviewOn())throw new WorkspaceError(404,'Analysis review is closed.');
 if(limited(`review:${owner}`,20))throw new WorkspaceError(429,'Please wait a minute.');
 const {store}=await loadWorkspace(owner);
 const entry=store.entries.find(e=>e.id===req.body?.entryId);
 if(!entry?.analysis)throw new WorkspaceError(404,'This note has no structure to review.');
 const comment=typeof req.body?.comment==='string'?req.body.comment.trim().slice(0,4000):'';
 const notation=readNotation(store);
 const payload={entryId:entry.id,title:entry.title??null,kind:entry.kind,body:entry.body,sentences:entry.sentences,analysis:entry.analysis,comparison:entry.comparison??null,notation,language:store.settings?.language??'ko'};
 await q('insert into feedback(id,owner_id,text,page,payload) values($1,$2,$3,$4,$5::jsonb)',[newId(),owner,comment||'(no comment)','analysis-review',JSON.stringify(payload)]);
 res.json({ok:true})}));
router.get('/admin/feedback',route(async(req,res)=>{
 const auth=new Headers();auth.set('x-admin-token',req.get('x-admin-token')??'');
 if(!isAdmin(new Request('http://localhost',{headers:auth})))throw new WorkspaceError(401,'An admin token is required.');
 res.json({feedback:req.query.reviews?await q("select id,text,page,payload,created_at::text from feedback where page='analysis-review' order by created_at desc limit 50"):await q('select id,text,page,created_at::text from feedback order by created_at desc limit 500')})}));
router.get('/impostors/:id',route(async(req,res)=>{res.json(await impostorDetail(await guest(req,res),String(req.params.id)))}));
router.post('/impostors/:id/decide',parse,route(async(req,res)=>{
 checkOrigin(req);const owner=await guest(req,res);
 await locked(owner,async()=>{
  const current=await loadWorkspace(owner);const store=structuredClone(current.store);
  const result=await decideImpostor(owner,store,String(req.params.id),req.body?.verdict,req.body?.comment);
  res.json({...await persistWorkspace(owner,current.revision,validateStore(store,current.store)),result});
 });
}));
// Team spaces need an account: an invite has to reach a person, not a browser.
async function teamUser(req:Request,res:Response){
 const user=accountId(req);if(!user)throw new WorkspaceError(401,'Sign in to use team spaces.');
 const owner=await guest(req,res);const store=(await loadWorkspace(owner)).store;const profile=(store.profile??{}) as {displayName?:string;username?:string};
 return {user,owner,display:profile.displayName?.trim()||profile.username?.trim()||''};
}
router.get('/teams',route(async(req,res)=>{const {user}=await teamUser(req,res);res.json({teams:await myTeams(user)})}));
router.post('/teams',parse,route(async(req,res)=>{checkOrigin(req);const u=await teamUser(req,res);res.json(await createTeam(u.user,u.display,req.body??{}))}));
router.get('/teams/:id',route(async(req,res)=>{const {user}=await teamUser(req,res);res.json(await teamView(user,String(req.params.id)))}));
router.post('/teams/:id/invites',route(async(req,res)=>{checkOrigin(req);const {user}=await teamUser(req,res);res.json(await invite(user,String(req.params.id)))}));
router.post('/teams/join/:token',route(async(req,res)=>{checkOrigin(req);const u=await teamUser(req,res);res.json(await join(u.user,u.display,String(req.params.token)))}));
router.post('/teams/:id/originals',parse,route(async(req,res)=>{checkOrigin(req);const {user}=await teamUser(req,res);res.json(await addOriginal(user,String(req.params.id),req.body??{}))}));
router.post('/teams/:id/originals/:oid/take',route(async(req,res)=>{checkOrigin(req);const {user,owner}=await teamUser(req,res);
 await locked(owner,async()=>{const current=await loadWorkspace(owner);const store=structuredClone(current.store);
  const result=await takeOriginal(user,String(req.params.id),String(req.params.oid),store);
  res.json({...await persistWorkspace(owner,current.revision,validateStore(store,current.store)),result})})}));
router.post('/teams/:id/shares',parse,route(async(req,res)=>{checkOrigin(req);const {user,owner}=await teamUser(req,res);
 res.json(await shareAnswer(user,String(req.params.id),req.body?.entryId,(await loadWorkspace(owner)).store))}));
router.delete('/teams/:id/shares/:oid',route(async(req,res)=>{checkOrigin(req);const {user}=await teamUser(req,res);await unshare(user,String(req.params.id),String(req.params.oid));res.json({ok:true})}));
router.get('/shares',route(async(req,res)=>{res.json({shares:await listShares(await guest(req,res))})}));
router.post('/shares',parse,route(async(req,res)=>{
 checkOrigin(req);const owner=await guest(req,res);
 if(limited(`share:${owner}`,20))throw new WorkspaceError(429,'Please wait a minute before creating more links.');
 res.json(await createShare(owner,req.body??{}));
}));
router.delete('/shares/:token',route(async(req,res)=>{checkOrigin(req);await revokeShare(await guest(req,res),String(req.params.token));res.json({ok:true})}));
// Public and read-only: no guest cookie is issued here.
router.get('/public/shares/:token',route(async(req,res)=>{
 await initV5();
 if(limited(`share-read:${req.ip}`,120))throw new WorkspaceError(429,'Too many requests.');
 res.set('X-Robots-Tag','noindex').json(await readShare(String(req.params.token)));
}));
router.get(['/personal/material-audio/:id','/personal/material-file/:id'],route(async(req,res)=>{
 const owner=await guest(req,res),state=await loadWorkspace(owner);
 const entry=state.store.entries.find(e=>e.id===req.params.id);
  if(!entry||typeof entry.meta?.objectPath!=='string'||!await ownsRecording(owner,entry.meta.objectPath))throw new WorkspaceError(404,'Recording not found.');
 const data=await readObject(entry.meta.objectPath);
 res.set('Content-Type',typeof entry.meta.mime==='string'?entry.meta.mime:'audio/mpeg').send(data);
}));
router.post('/cron/daily',route(async(req,res)=>{
 const auth=new Headers();auth.set('x-admin-token',req.get('x-admin-token')??'');
 if(!isAdmin(new Request('http://localhost',{headers:auth})))throw new WorkspaceError(401,'An admin token is required.');
 const result=await runDaily();req.log.info(result,'MOONS daily KST run');res.json(result);
}));
router.use(projectsRouter(checkOrigin));
router.use(satellitesRouter(checkOrigin));
export default router;

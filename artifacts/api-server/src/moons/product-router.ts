import {Router,json as parseJson,type Request,type Response} from 'express';
import {clerkClient} from '@clerk/express';
import {cookieIdentity,guest,initV5} from './lib/server/v5/workspace-store';
import {accountId} from './lib/server/v5/identity';
import {claimWorkspace} from './lib/server/v5/claim';
import {checkOrigin} from './workspace-router';
import {limited} from './lib/server/http';
import {q} from './lib/server/db';
import {WorkspaceError} from './lib/server/v5/types';
const router=Router(),parse=parseJson({limit:'8kb'});
function route(fn:(req:Request,res:Response)=>Promise<void>){return async(req:Request,res:Response)=>{
 try{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});await initV5();await fn(req,res)}
 catch(e){const status=e instanceof WorkspaceError?e.status:500;req.log.error({status},'Product request failed');res.status(status).json({error:{message:status===500?'The request failed. Your data is preserved.':(e as Error).message}})}
}}
router.get('/account/status',route(async(req,res)=>{
 const user=accountId(req);
 const owned=user?await q('select owner_id from user_workspaces where user_id=$1',[user]):[];
 res.json({signedIn:!!user,claimed:owned.length>0});
}));
router.post('/account/claim',parse,route(async(req,res)=>{
 checkOrigin(req);
 const user=accountId(req);if(!user)throw new WorkspaceError(401,'Sign in first.');
 if(limited(`claim:${user}`,10))throw new WorkspaceError(429,'Please wait before trying again.');
 const profile=await clerkClient.users.getUser(user);
 const email=profile.emailAddresses.find(e=>e.id===profile.primaryEmailAddressId&&e.verification?.status==='verified')?.emailAddress;
 if(!email)throw new WorkspaceError(403,'A verified email address is required.');
 const source=cookieIdentity(req.headers.cookie)??await guest(req,res);
 res.json(await claimWorkspace(user,email,source));
}));
export default router;

import type {WorkspaceApi} from './workspace-client';
import {tr} from './i18n.ts';

export function uploadRecording(ws:WorkspaceApi,file:File,title:string,defaultPlanet?:string){
 return ws.upload(async revision=>{
  const form=new FormData();form.append('file',file);form.append('revision',String(revision));form.append('title',title);
  if(defaultPlanet)form.append('defaultPlanet',defaultPlanet);
  const response=await fetch(`${import.meta.env.BASE_URL}api/personal/material-audio`,{method:'POST',body:form,credentials:'same-origin'});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(body?.error?.message??body?.error??tr('Upload failed. Your recording has not been saved; retry with the preview below.')),{status:response.status});
  if(!body?.store||!Number.isFinite(body.revision))throw new Error(tr('The server did not return a saved recording. Reload before retrying.'));
  return body;
 });
}

/** A PDF: the server keeps the file and reads its text layer with page numbers. */
export function uploadPdf(ws:WorkspaceApi,file:File,title:string,defaultPlanet?:string){
 return ws.upload(async revision=>{
  const form=new FormData();form.append('file',file);form.append('revision',String(revision));form.append('title',title);
  if(defaultPlanet)form.append('defaultPlanet',defaultPlanet);
  const response=await fetch(`${import.meta.env.BASE_URL}api/personal/material-pdf`,{method:'POST',body:form,credentials:'same-origin'});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(body?.error?.message??body?.error??tr('Upload failed. The PDF has not been saved.')),{status:response.status});
  if(!body?.store||!Number.isFinite(body.revision))throw new Error(tr('The server did not return a saved PDF. Reload before retrying.'));
  return body;
 });
}
export const isPdf=(f:File)=>f.type==='application/pdf'||/\.pdf$/i.test(f.name);

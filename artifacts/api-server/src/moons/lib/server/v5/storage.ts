import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {WorkspaceError} from './types.ts';

// STORAGE_DIR (a mounted volume, e.g. Railway) stores files on disk.
// PRIVATE_OBJECT_DIR is the older Replit App Storage bucket and is still readable.
const LOCAL='local:';
const safe=(part:string)=>{if(!/^[A-Za-z0-9._-]+$/.test(part))throw new WorkspaceError(400,'Invalid file name.');return part};

export async function saveObject(owner:string,name:string,data:Buffer,mime:string) {
 const root=process.env.STORAGE_DIR;
 if(root){
  const rel=path.posix.join('moons',safe(owner),safe(name));
  const file=path.join(root,rel);
  await mkdir(path.dirname(file),{recursive:true});
  await writeFile(file,data);
  return LOCAL+rel;
 }
 const dir=process.env.PRIVATE_OBJECT_DIR;
 if(!dir)throw new WorkspaceError(503,'Persistent file storage is not configured.');
 const {objectStorageClient}=await import('../../../../lib/objectStorage');
 const [bucket,...prefix]=dir.replace(/^\//,'').split('/');
 const key=[...prefix,'moons',owner,name].join('/');
 await objectStorageClient.bucket(bucket!).file(key).save(data,{resumable:false,metadata:{contentType:mime}});
 return `${bucket}/${key}`;
}
export async function readObject(stored:string) {
 if(stored.startsWith(LOCAL)){
  const root=process.env.STORAGE_DIR;
  if(!root)throw new WorkspaceError(503,'Persistent file storage is not configured.');
  const rel=stored.slice(LOCAL.length);
  const file=path.resolve(root,rel);
  if(!file.startsWith(path.resolve(root)+path.sep))throw new WorkspaceError(400,'Invalid file path.');
  return readFile(file);
 }
 const {objectStorageClient}=await import('../../../../lib/objectStorage');
 const [bucket,...rest]=stored.split('/');
 return (await objectStorageClient.bucket(bucket!).file(rest.join('/')).download())[0];
}

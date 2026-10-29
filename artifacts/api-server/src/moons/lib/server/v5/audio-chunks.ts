import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {transcribeTimed} from '../ai/openai.ts';
type Timed={text:string;segments:{start:number;end:number;text:string}[];duration:number};
export const AUDIO_CHUNK_SECONDS=120;
export async function command(binary:string,args:string[]) {
 return new Promise<void>((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});let failure='';
  child.stderr.on('data',data=>{failure=(failure+String(data)).slice(-2000)});
  const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Audio preparation timed out. Original recording is preserved.'))},120000);
  child.on('error',()=>{clearTimeout(timeout);reject(new Error('Audio preparation requires ffmpeg. Original recording is preserved.'))});
  child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('The audio track could not be decoded. Original recording is preserved.'))});
 });
}
export async function transcribeChunks(data:Buffer,transcribe:(audio:Blob,name:string)=>Promise<Timed>=transcribeTimed) {
 const directory=await mkdtemp(path.join(tmpdir(),'moons-audio-'));
 try{
  const input=path.join(directory,'input'),list=path.join(directory,'segments.csv');
  await writeFile(input,data);
  // Decode/re-encode: slicing container bytes does NOT create playable chunks.
  // Block network protocols in untrusted uploaded playlists/containers.
  await command('ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',input,'-map','0:a:0','-vn','-ac','1','-ar','16000','-c:a','libopus','-b:a','48k','-f','segment','-segment_time',String(AUDIO_CHUNK_SECONDS),'-reset_timestamps','1','-segment_list_type','csv','-segment_list',list,path.join(directory,'part-%04d.ogg')]);
  const manifest=(await readFile(list,'utf8')).trim().split('\n').map(line=>{
   const m=/part-(\d{4})\.ogg,(-?[\d.]+),(-?[\d.]+)$/.exec(line.replaceAll('"',''));
   if(!m)throw new Error('Audio chunk manifest is invalid.');
   return {file:`part-${m[1]}.ogg`,start:Math.max(0,Number(m[2])),end:Number(m[3])};
  });
  if(!manifest.length)throw new Error('No audio track found.');
  const segments:Timed['segments']=[],text:string[]=[];
  for(const part of manifest){
   const bytes=await readFile(path.join(directory,part.file));
   const result=await transcribe(new Blob([new Uint8Array(bytes)],{type:'audio/ogg'}),part.file);
   text.push(result.text.trim());
   for(const segment of result.segments)segments.push({...segment,start:part.start+segment.start,end:Math.min(part.end,part.start+segment.end)});
  }
  return {text:text.join('\n'),segments,duration:manifest.at(-1)!.end,chunkCount:manifest.length,chunkSeconds:AUDIO_CHUNK_SECONDS};
 }finally{await rm(directory,{recursive:true,force:true})}
}

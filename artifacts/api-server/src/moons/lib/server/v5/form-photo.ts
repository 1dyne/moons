import {ai} from '../ai/index.ts';
import {WorkspaceError} from './types.ts';

// Photo of a paper planner/notebook page → a form draft (blocks only). The draft is returned
// to the browser and is not saved: the user checks every block first (principle 2).
const KINDS=['text','longtext','checklist','steps','estimate','date','time','scale','select','planet','link'] as const;
export type FormDraft={name:string;blocks:{kind:typeof KINDS[number];label:string;options:string[]}[]};

const SYSTEM=`You read a photo of a paper page someone uses repeatedly (a daily planner, study log, meeting note, habit tracker).
Describe the page's reusable STRUCTURE as form blocks, so they can fill the same form digitally.
Rules:
- Use the labels printed or handwritten on the page, in the page's own language. Do not translate.
- Do not copy the person's filled-in content into labels. Options may list fixed choices printed on the page, or the default rows of a checklist/step list.
- Kinds: text (one line), longtext (several lines), checklist (tick boxes), steps (an ordered sequence), estimate (planned minutes/duration),
  date, time, scale (1-10 rating or levels), select (one of fixed choices), planet (a category or topic the entry belongs to), link (URL).
- Keep the order of the page. 1 to 20 blocks. Name the form briefly after what the page is (e.g. the printed title).
- If the image is not a page with structure, return a single longtext block named after what you see.`;

const SCHEMA={type:'object',additionalProperties:false,required:['name','blocks'],properties:{
 name:{type:'string'},
 blocks:{type:'array',items:{type:'object',additionalProperties:false,required:['kind','label','options'],properties:{
  kind:{type:'string',enum:[...KINDS]},label:{type:'string'},options:{type:'array',items:{type:'string'}}}}},
}};

export async function draftFormFromPhoto(image:Buffer,mime:string):Promise<FormDraft>{
 if(!/^image\/(png|jpe?g|webp|heic|heif|gif)$/i.test(mime))throw new WorkspaceError(400,'Upload a photo (PNG, JPEG, WebP or HEIC).');
 const {data}=await ai().json<FormDraft>({name:'moons_form_from_photo',system:SYSTEM,user:'Draft the form for this page.',schema:SCHEMA,tier:'fast',images:[{mime,base64:image.toString('base64')}]});
 const blocks=(data.blocks??[]).filter(b=>KINDS.includes(b.kind)&&typeof b.label==='string'&&b.label.trim()).slice(0,20)
  .map(b=>({kind:b.kind,label:b.label.trim().slice(0,80),options:(b.options??[]).filter(o=>typeof o==='string'&&o.trim()).slice(0,20).map(o=>o.trim().slice(0,80))}));
 if(!blocks.length)throw new WorkspaceError(422,'No form structure was found in this photo.');
 return {name:(data.name??'').trim().slice(0,40),blocks};
}

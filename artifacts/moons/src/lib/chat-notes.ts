// v7 4.7 / 5.5: chat notes, conversation artifacts and exploration maps.
import type {Entry,Store} from './model.ts';
import {newBlock,type BlockKind,type FormTemplate} from './forms.ts';

export type ChatNote={chatId:string;summary:string;revisit:{text:string;ref?:string}[];study:{conceptIds:string[];questions:string[]};artifacts:string[]};
export type Artifact={id:string;chatId:string;name:string;type:'form'|'outline'|'checklist'|'text';content:string;fields?:{label:string;kind:BlockKind;options?:string[]}[];createdAt:string;formId?:string};
export type MapConcept={conceptId?:string;name:string;state:'known'|'heard'|'new';layer:'user'|'material'|'ai';ref?:{entryId:string;sentence:number};confirmed?:boolean};
export type ExploreMap={id:string;chatId:string;goal:string;target:string;units:{name:string;concepts:MapConcept[]}[];confirmedAt?:string;createdAt:string};

export const chatNoteOf=(e:Entry)=>(e as Entry&{chat?:ChatNote}).chat;
export const artifactsOf=(s:Store)=>s.artifacts??[];
export const exploreMapsOf=(s:Store)=>s.exploreMaps??[];
/** "!" on a map concept: MOONS's knowledge with no source, until the user confirms it (v7 5.6). */
export const mapNeedsCheck=(c:MapConcept)=>c.layer==='ai'&&!c.ref&&!c.confirmed;
export const canConfirmMap=(m:ExploreMap)=>!m.units.some(u=>u.concepts.some(mapNeedsCheck));

/** A form drafted in a conversation, registered as one of the user's forms. */
export function formFromArtifact(a:Artifact,position:number):FormTemplate{
  const now=new Date().toISOString();
  const blocks=(a.fields?.length?a.fields:[{label:a.name,kind:'longtext' as BlockKind}]).map(f=>({...newBlock(f.kind),label:f.label,...(f.options?.length?{options:f.options}:{})}));
  return {id:crypto.randomUUID(),name:a.name.slice(0,40),icon:'ClipboardList',blocks,position,source:'manual',createdAt:now,updatedAt:now};
}
/** Neighbours not yet covered: other concepts in the same unit of a confirmed map, still new or only heard of. */
export function uncoveredNeighbours(s:Store,conceptId:string,name:string){
  const key=(x:string)=>x.toLowerCase().replace(/\s+/g,'');
  return exploreMapsOf(s).filter(m=>m.confirmedAt).flatMap(m=>m.units.filter(u=>u.concepts.some(c=>c.conceptId===conceptId||key(c.name)===key(name))).flatMap(u=>u.concepts.filter(c=>c.state!=='known'&&c.conceptId!==conceptId&&key(c.name)!==key(name))));
}

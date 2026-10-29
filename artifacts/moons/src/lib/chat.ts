import {tr} from './i18n.ts';
export type Profile={username:string;displayName:string};
/** comment: the MOONS comment (lib/structure.ts key) a node conversation is about. */
export type Origin={kind:'free'|'node'|'notification'|'warning'|'concept'|'question'|'galaxy';ref?:string;comment?:string};
/** v7 4.7: where a conversation started is what it is about. */
export type ChatTag={type:'entry'|'concept'|'question'|'galaxy';id?:string};
export type DraftNode={text:string;planetIds:string[];relation:'updates'|'contradicts'|'extends';originRef?:string};
export type TagProposal={planetId:string;name:string;evidence:string[]};
export type ChatMessage={id:string;role:'user'|'assistant';text:string;createdAt:string;savedEntryId?:string;refs?:string[];draftNode?:DraftNode;tagProposal?:TagProposal;materialSavedEntryId?:string};
export type ChatThread={id:string;title:string;createdAt:string;updatedAt:string;messages:ChatMessage[];contextIds:string[];draft:string;origin?:Origin;
  /** Set for the conversation attached to a side-by-side desk; its pinned notes follow the open panels. */
  desk?:string;tags?:ChatTag[];noteId?:string};
export const spaceName=(profile?:Profile)=>{const who=profile?.displayName.trim()||profile?.username.trim();return who?tr('{name}’s space',{name:who}):tr('My space')};
export const tagsFor=(o:Origin):ChatTag[]=>o.kind==='node'&&o.ref?[{type:'entry',id:o.ref}]:o.kind==='concept'&&o.ref?[{type:'concept',id:o.ref}]:o.kind==='question'&&o.ref?[{type:'question',id:o.ref}]:o.kind==='galaxy'?[{type:'galaxy'}]:[];
export function newChat(origin:Origin={kind:'free'},contextIds:string[]=[]):ChatThread{const now=new Date().toISOString();return {id:crypto.randomUUID(),title:tr('New chat'),createdAt:now,updatedAt:now,messages:[],contextIds,draft:'',origin,tags:tagsFor(origin)}}
export const chatsAbout=(chats:ChatThread[]|undefined,tag:ChatTag)=>(chats??[]).filter(c=>(c.tags??tagsFor(c.origin??{kind:'free'})).some(t=>t.type===tag.type&&t.id===tag.id));
export const userWords=(thread:ChatThread)=>thread.messages.filter(m=>m.role==='user').map(m=>m.text);
export const isUserSubstring=(thread:ChatThread,text:string)=>!!text.trim()&&userWords(thread).some(t=>t.includes(text));
export function appendMessage(thread:ChatThread,text:string):ChatThread{
  if(!text.trim())return thread;
  const now=new Date().toISOString();
  return {...thread,title:thread.messages.length||thread.title!=='New chat'?thread.title:text.trim().slice(0,48),updatedAt:now,draft:'',messages:[...thread.messages,{id:crypto.randomUUID(),role:'user',text:text.trim(),createdAt:now},{id:crypto.randomUUID(),role:'assistant',text:tr('AI is not connected yet. Your message and selected nodes are saved in this conversation.'),createdAt:now}]};
}
export function isChat(value:unknown):value is ChatThread{
  const t=value as ChatThread;return !!t&&typeof t.id==='string'&&typeof t.title==='string'&&typeof t.draft==='string'&&Array.isArray(t.contextIds)&&t.contextIds.every(id=>typeof id==='string')&&Array.isArray(t.messages)&&t.messages.every(m=>m&&typeof m.id==='string'&&['user','assistant'].includes(m.role)&&typeof m.text==='string');
}

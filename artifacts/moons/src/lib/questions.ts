// Question notes (v7 5.1): IBIS (question → candidate answers → grounds) plus the decision and what remains.
// The question is the title; why the user asked (their words) is the original body.
import {makeEntry,type Entry,type Store} from './model.ts';
import {conceptsOf,unfamiliar,type Concept} from './concepts.ts';
import {tr} from './i18n.ts';

export type QuestionStatus='open'|'working'|'tentative'|'closed';
export const questionStatuses:QuestionStatus[]=['open','working','tentative','closed'];
export const statusLabel:Record<QuestionStatus,string>={open:tr('Open'),working:tr('Working'),tentative:tr('Tentative'),closed:tr('Closed')};
export type Decision={chosen:string;reason:string;rejected:{option:string;why:string}[];by:'user'};
export type SubQuestion={id:string;text:string;status:QuestionStatus;materials:{entryIds:string[];conceptIds:string[]};decision?:Decision;layer:'user'|'ai';why?:string};
export type Question={why:string;status:QuestionStatus;subQuestions:SubQuestion[];answer?:{text:string;layer:'user'|'ai';at:string};origin?:{entryId:string;sentence:number}};
export type QuestionEntry=Entry&{question?:Question};

export const questionOf=(e:Entry)=>(e as QuestionEntry).question;
export const isQuestion=(e:Entry)=>e.kind==='question';

/** A new question note. The why (or, without one, the question itself) is the user's original. */
export function newQuestion(text:string,from?:{entryId?:string;concepts?:string[];card?:string;why?:string;sentence?:number}):QuestionEntry{
  const title=text.trim(),why=(from?.why??'').trim();
  const e=makeEntry(why||title,{kind:'question',title:title.slice(0,200),meta:{...(from?.entryId?{fromEntry:from.entryId}:{}),...(from?.card?{fromCard:from.card}:{})}}) as QuestionEntry;
  e.question={why,status:'open',subQuestions:[],...(from?.entryId!==undefined&&from.sentence!==undefined?{origin:{entryId:from.entryId,sentence:from.sentence}}:{})};
  if(from?.concepts?.length)(e.meta as Record<string,unknown>).concepts=from.concepts;
  return e;
}
export const newSub=(text:string,layer:'user'|'ai'='user',materials={entryIds:[] as string[],conceptIds:[] as string[]}):SubQuestion=>({id:crypto.randomUUID(),text:text.trim(),status:'open',materials,layer});

/** Materials of the whole question: its own concepts plus every sub-question's notes and concepts. */
export function materialsOf(e:Entry){
  const q=questionOf(e);const own=(e.meta?.concepts as string[]|undefined)??[];
  return {entryIds:[...new Set((q?.subQuestions??[]).flatMap(s=>s.materials.entryIds))],conceptIds:[...new Set([...own,...(q?.subQuestions??[]).flatMap(s=>s.materials.conceptIds)])]};
}
/** What remains is computed, never stored: open sub-questions and unfamiliar concepts among the materials. */
export function remaining(e:Entry,store:Store){
  const q=questionOf(e);const ids=materialsOf(e).conceptIds;
  const concepts:Concept[]=conceptsOf(store).filter(c=>ids.includes(c.id)&&unfamiliar(c));
  return {open:(q?.subQuestions??[]).filter(s=>s.status==='open'&&s.layer==='user'),concepts};
}
export const updateQuestion=(e:QuestionEntry,q:Question):QuestionEntry=>({...e,question:q});

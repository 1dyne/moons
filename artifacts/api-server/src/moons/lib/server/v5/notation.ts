import {randomUUID} from 'node:crypto';
import type {Entry,Store} from './types.ts';

// The user's own notation ("my symbols"). The words stay exactly as written; the dictionary only tells
// MOONS how to read them. Blank marks also become "to look up" signals, decided here without AI.
export type NotationRole='gap'|'memo'|'section'|'relation'|'emphasis'|'note';
export type Notation={id:string;symbol:string;meaning:string;role:NotationRole;scope?:{planetIds?:string[];formIds?:string[]}};
const ROLES:NotationRole[]=['gap','memo','section','relation','emphasis','note'];

const ROLE_RULE:Record<NotationRole,string>={
 gap:'사용자가 아직 모르는 개념이라 원문에서 찾아 채워야 하는 빈칸 표시다. 그 부분을 틀렸다고 보지 말고, 해당 노드는 비어 있는 곳(study 신호)으로 다룬다.',
 memo:'사용자가 자기 표현을 고치거나 덧붙이는 메모다. 본문 주장으로 세지 말고, 바로 앞 내용에 대한 사용자의 보충·수정으로 다룬다.',
 section:'구역 제목이다. 구조를 나눌 때 묶음의 기준으로 쓴다.',
 relation:'앞뒤 두 항목 사이의 관계 표시다. 두 노드를 잇는 근거로 쓴다.',
 emphasis:'사용자가 정확히 이 말이어야 한다고 강조한 핵심 용어다.',
 note:'뜻만 참고한다.',
};

export function readNotation(store:Store):Notation[]{
 const raw=(store as {notation?:unknown}).notation;
 return Array.isArray(raw)?raw.filter((n):n is Notation=>!!n&&typeof n.symbol==='string'&&n.symbol.trim()!==''&&typeof n.meaning==='string'&&ROLES.includes(n.role)):[];
}

/** Symbols that apply to this entry: global ones, plus those scoped to its planets or its form. */
export function notationFor(store:Store,entry:Pick<Entry,'planetIds'|'meta'>):Notation[]{
 const formId=typeof entry.meta?.formId==='string'?entry.meta.formId:undefined;
 return readNotation(store).filter(n=>{
  const p=n.scope?.planetIds??[],f=n.scope?.formIds??[];
  if(!p.length&&!f.length)return true;
  return p.some(id=>entry.planetIds.includes(id))||(!!formId&&f.includes(formId));
 });
}

export function notationPrompt(list:Notation[]):string{
 if(!list.length)return '';
 return `\n\n사용자 기호 사전 (사용자가 직접 정한 표기. 원문은 그대로 두고, 읽는 방법으로만 쓴다):\n${list.map(n=>`- "${n.symbol}": ${n.meaning} → ${ROLE_RULE[n.role]}`).join('\n')}`;
}

// "*[ctrl+F] 는 …", "* // = …": a line explaining one of the user's symbols. It is a note to MOONS, not content.
const LEGEND=/^\s*\*\s*(\S+?)\s*(?:는|은|=|:|→)(?:\s|$)/u;
/** Sentence numbers that are symbol explanations: a known symbol anywhere, or any symbol-like token in the opening lines. */
export function annotationLines(sentences:string[],list:Notation[]):Set<number>{
 const known=new Set(list.map(n=>n.symbol)),out=new Set<number>();
 sentences.forEach((s,i)=>{const m=s.match(LEGEND);if(m&&(known.has(m[1]!)||(i<8&&/[^\p{L}\p{N}\s]/u.test(m[1]!))))out.add(i)});
 return out;
}

/** Every sentence carrying a blank mark becomes an open "to look up" signal on the node built from it. */
export function gapSignals(sentences:string[],nodes:{id:string;source:number[]}[],list:Notation[],skip:Set<number>=new Set()){
 const gaps=list.filter(n=>n.role==='gap');
 const out:{id:string;nodeId:string;kind:'gap';reason:string;state:'open'}[]=[];
 for(const g of gaps)sentences.forEach((s,i)=>{
  if(skip.has(i)||!s.includes(g.symbol))return;
  const node=nodes.find(n=>n.source.includes(i));
  if(node&&!out.some(o=>o.nodeId===node.id))out.push({id:randomUUID(),nodeId:node.id,kind:'gap',reason:`${g.symbol} — ${g.meaning}`,state:'open'});
 });
 return out;
}

export function validateNotation(raw:unknown):boolean{
 return raw===undefined||(Array.isArray(raw)&&raw.length<=200&&raw.every(n=>!!n&&typeof n.id==='string'&&typeof n.symbol==='string'&&n.symbol.length<=40&&typeof n.meaning==='string'&&n.meaning.length<=300&&ROLES.includes(n.role)));
}

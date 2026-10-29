// v7 1.1 on the client: how far a note is known. The server sets it on structuring and comparing; the user
// confirms "I can explain this" here once enough of the note was kept against its original.
import type {Entry,Knowledge,Store} from './model.ts';
import {tr} from './i18n.ts';

export const knowledgeLabel:Record<Knowledge,string>={seen:tr('Came in'),organized:tr('Organised'),checked:tr('Checked'),explainable:tr('Can explain')};
export const explainBar=(s:Store)=>{const v=Number((s.settings as {explainableBar?:number}|undefined)?.explainableBar);return v>0&&v<=1?v:0.8};
export function keptShare(e:Entry){const items=(e.comparison?.items??[]).filter(i=>i.verdict!=='added');return items.length?items.filter(i=>i.verdict==='kept').length/items.length:0}
export function knowledgeOf(e:Entry,bar=0.8):Knowledge{
  const items=(e.comparison?.items??[]).filter(i=>i.verdict!=='added');
  if(e.comparison&&items.length)return keptShare(e)>=bar&&e.meta?.explainConfirmed?'explainable':'checked';
  return e.analysis?'organized':'seen';
}
/** The user may say they can explain it once the kept share reaches the bar. */
export const canConfirm=(e:Entry,bar:number)=>!!e.comparison&&keptShare(e)>=bar&&!e.meta?.explainConfirmed;
export const confirmExplain=(e:Entry,bar:number):Entry=>{const next={...e,meta:{...e.meta,explainConfirmed:new Date().toISOString()}};return {...next,knowledge:knowledgeOf(next,bar)}};

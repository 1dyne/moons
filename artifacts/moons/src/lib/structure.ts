// Structuring v2 on the client: the words for frames and relations, the structure-layer verdict,
// and MOONS's feedback gathered into one list of comments (spec §13).
import type {Analysis,Entry,StructureComparison,Verdict} from './model.ts';
import {frames,edgeRelations,soloLevels,textKinds,type EdgeRelation,type Frame,type Solo,type TextKind} from './thought.ts';
import {tr} from './i18n.ts';

export {frames,edgeRelations,soloLevels,textKinds};
export const frameLabel:Record<Frame,string>={list:tr('List'),sequence:tr('Sequence'),cause:tr('Cause → effect'),problem:tr('Problem → solution'),compare:tr('Comparison'),claim:tr('Claim → evidence')};
export const soloLabel:Record<Solo,string>={listed:tr('Listed'),linked:tr('Linked'),extended:tr('Extended to a principle')};
export const textKindLabel:Record<TextKind,string>={descriptive:tr('Explains'),normative:tr('Argues'),narrative:tr('Tells a story')};
export const relLabel:Record<EdgeRelation,string>={kind:tr('Kind'),part:tr('Part'),property:tr('Property'),example:tr('Example'),sequence:tr('Order'),cause:tr('Cause'),solution:tr('Solution'),use:tr('Use'),contrast:tr('Contrast')};
/** Lines are told apart by shape; the name shows when pressed. */
export type Glyph='arrow'|'line'|'dot'|'double'|'none';
export const relGlyph=(rel:EdgeRelation|null|undefined):Glyph=>!rel?'none':({kind:'line',part:'line',property:'dot',example:'dot',sequence:'arrow',cause:'arrow',solution:'arrow',use:'arrow',contrast:'double'} as const)[rel];

/** The parts a comparison speaks of: an outline's sections, or the whole note as 'all'. */
export const ALL='all';
export function frameOf(a:Analysis,section:string):Frame{return section===ALL?a.frame??'list':a.sections?.find(s=>s.id===section)?.frame??'list'}
export function sectionOfNode(a:Analysis,nodeId:string):string{return a.sections?.find(s=>s.nodeIds.includes(nodeId)||s.table?.rows.some(r=>r.item===nodeId||r.cells.includes(nodeId)))?.id??ALL}
/** A comparison made before the latest restructure speaks of sections that no longer exist. */
export const isStale=(st:StructureComparison,a:Analysis|undefined)=>!a||st.analysisCreatedAt!==a.createdAt;

/** Kept when the part is built the way the original builds it; no verdict when the original left no signal. */
export function structureVerdict(s:StructureComparison['sections'][number],mine:Frame):Verdict|null{
  if(s.skipped)return null;
  if(!s.original.length)return 'added';
  if(!s.origFrame)return null;
  return s.origFrame===mine?'kept':'shifted';
}

export type Op={kind:'frame';section:string;frame:Frame}|{kind:'rel';from:string;to:string;rel:EdgeRelation};
export type CommentKind='structure'|'relation'|'sentence'|'missing'|'check'|'study';
export type MoonComment={key:string;kind:CommentKind;section:string;nodeId?:string;text:string;quotes:number[];proposal?:{label:string;op:Op};status:'open'|'applied'|'kept';signalId?:string};
export const commentKindLabel:Record<CommentKind,string>={structure:tr('Build'),relation:tr('Line'),sentence:tr('Sentence'),missing:tr('Missing'),check:tr('Check this idea'),study:tr('Explore further')};

/** Every piece of MOONS feedback on a note: structuring signals, then the structure layer, then the sentence layer. */
export function buildComments(entry:Entry):MoonComment[]{
  const a=entry.analysis;if(!a)return [];
  const states=entry.commentStates??{},out:MoonComment[]=[];
  const state=(key:string)=>states[key]??'open';
  for(const s of a.signals)out.push({key:`sg:${s.id}`,kind:s.kind==='misunderstanding'?'check':'study',section:sectionOfNode(a,s.nodeId),nodeId:s.nodeId,text:s.reason,quotes:[],signalId:s.id,
    status:s.state==='open'?'open':s.state==='resolved'?'applied':'kept'});
  const c=entry.comparison,st=c?.structure;
  if(st&&!isStale(st,a)){
    const sections=new Set([ALL,...(a.sections??[]).map(s=>s.id)]),nodes=new Set(a.nodes.map(n=>n.id));
    for(const s of st.sections){
      const key=`st:${s.section}`,mine=frameOf(a,s.section);
      if(!sections.has(s.section)||!s.origFrame||(structureVerdict(s,mine)!=='shifted'&&!states[key]))continue;
      out.push({key,kind:'structure',section:s.section,text:s.note||tr('The original builds this part as {orig}. Your note reads it as {mine}.',{orig:frameLabel[s.origFrame],mine:frameLabel[mine]}),quotes:[...new Set(s.signals.map(g=>g.sentence))],
        proposal:{label:tr('Read this part as {frame}',{frame:frameLabel[s.origFrame]}),op:{kind:'frame',section:s.section,frame:s.origFrame}},status:state(key)});
    }
    for(const m of st.missed){const key=`sm:${m.original[0]}`;out.push({key,kind:'missing',section:ALL,text:m.note||tr('Your note does not cover this part of the original.'),quotes:m.original,status:state(key)})}
    for(const r of st.relations){
      const key=`rl:${r.from}:${r.to}`,edge=a.edges.find(e=>e.from===r.from&&e.to===r.to);
      if(!edge||!nodes.has(r.from)||(edge.rel===r.origRel&&!states[key]))continue;
      out.push({key,kind:'relation',section:sectionOfNode(a,r.from),nodeId:r.from,text:r.note||tr('The original ties these two as {rel}.',{rel:relLabel[r.origRel]}),quotes:r.original,
        proposal:{label:tr('Make this line {rel}',{rel:relLabel[r.origRel]}),op:{kind:'rel',from:r.from,to:r.to,rel:r.origRel}},status:state(key)});
    }
  }
  if(c){
    for(const it of c.items){
      if(it.verdict!=='shifted'&&it.verdict!=='missed')continue;
      const i=typeof it.answer==='number'?it.answer:-1;
      const node=i>=0?a.nodes.find(n=>n.source.includes(i)):undefined;
      const key=it.verdict==='shifted'?`ss:${i}`:`sx:${it.original[0]}`;
      if(it.verdict==='missed'&&out.some(o=>o.kind==='missing'&&o.quotes.includes(it.original[0])))continue;
      out.push({key,kind:it.verdict==='shifted'?'sentence':'missing',section:node?sectionOfNode(a,node.id):ALL,nodeId:node?.id,text:it.note,quotes:it.original,status:state(key)});
    }
  }
  return out;
}

/** Applies a proposal the user accepted. Their choice is marked as theirs so a restructure keeps it. */
export function applyOp(a:Analysis,op:Op):Analysis{
  if(op.kind==='frame')return op.section===ALL?{...a,frame:op.frame,frameBy:'user'}:{...a,sections:a.sections?.map(s=>s.id===op.section?{...s,frame:op.frame,frameBy:'user'}:s)};
  return {...a,edges:a.edges.map(e=>e.from===op.from&&e.to===op.to?{...e,rel:op.rel,relBy:'user'}:e)};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOp,buildComments,structureVerdict} from '../lib/structure.ts';
import {nodeText,renameNode,type Entry} from '../lib/model.ts';

const node=(id:string,text:string,source:number[])=>({id,text,role:'concept',source,empty:false,updates:[]});
function entry():Entry{
  return {id:'e1',kind:'dump',body:'',sentences:['제작','평가','오목한 물체','convex decomposition'],locked:true,createdAt:'t',status:'done',planetIds:[],
    analysis:{structure:'개요',model:'m',promptVersion:'p',createdAt:'a1',suggestedPlanets:[],
      nodes:[node('a','제작',[0]),node('b','평가',[1]),node('c','오목한 물체',[2]),node('d','convex decomposition',[3])],
      edges:[{from:'a',to:'b',rel:null},{from:'c',to:'d',rel:'cause'}],
      signals:[{id:'g1',nodeId:'d',kind:'study',reason:'근사가 무슨 뜻인지 확인해 보세요.',state:'open'}],
      sections:[{id:'sec1',heading:null,headingText:'단계',form:'diagram',nodeIds:['a','b'],table:null,frame:'list'},
        {id:'sec2',heading:null,headingText:'',form:'diagram',nodeIds:['c','d'],table:null,frame:'list'}]},
    comparison:{materialEntryId:'m1',materialTitle:'원문',summary:'',quotes:[],
      items:[{answer:0,verdict:'kept',original:[0],note:''},{answer:2,verdict:'shifted',original:[2],note:'원문은 감싸면 모양이 달라진다고 했어요.',shiftType:'condition_dropped'},{answer:-1,verdict:'missed',original:[5],note:'빠짐'}],
      structure:{analysisCreatedAt:'a1',textKind:'descriptive',missed:[{original:[5],frame:'compare',note:'원문은 측정값과 아닌 것을 나눠요.'}],
        relations:[{from:'c',to:'d',origRel:'solution',original:[3],note:'원문은 해결로 이어요.'}],
        sections:[{section:'sec1',heading:'단계',original:[0,1],origFrame:'sequence',signals:[{sentence:0,words:'먼저'}],note:'원문은 먼저 … 그다음으로 이어요.',skipped:false},
          {section:'sec2',heading:'',original:[2,3],origFrame:null,signals:[],note:'',skipped:false}]}}};
}

test('the structure verdict needs a signal, and a part not in the original is added', () => {
  const s={section:'x',heading:'',original:[1],origFrame:'sequence' as const,signals:[],note:'',skipped:false};
  assert.equal(structureVerdict(s,'sequence'),'kept');
  assert.equal(structureVerdict(s,'list'),'shifted');
  assert.equal(structureVerdict({...s,origFrame:null},'list'),null);
  assert.equal(structureVerdict({...s,original:[]},'list'),'added');
  assert.equal(structureVerdict({...s,skipped:true},'list'),null);
});

test('all MOONS feedback lands in one list, each comment on the part it is about', () => {
  const comments=buildComments(entry());
  assert.deepEqual(comments.map(c=>[c.kind,c.section]),[['study','sec2'],['structure','sec1'],['missing','all'],['relation','sec2'],['sentence','sec2']]);
  assert.ok(!comments.some(c=>c.key==='st:sec2')); // no signal in the original, so no structure comment
  assert.equal(comments.filter(c=>c.quotes.includes(5)).length,1); // the same missed sentence is not listed twice
});

test('applying a proposal marks the choice as the user\'s, and the comment stays as applied', () => {
  const e=entry();
  const c=buildComments(e).find(x=>x.kind==='structure')!;
  const next:Entry={...e,analysis:applyOp(e.analysis!,c.proposal!.op),commentStates:{[c.key]:'applied'}};
  assert.equal(next.analysis!.sections![0]!.frame,'sequence');
  assert.equal(next.analysis!.sections![0]!.frameBy,'user');
  assert.equal(buildComments(next).find(x=>x.key===c.key)?.status,'applied');
  const r=buildComments(e).find(x=>x.kind==='relation')!;
  const withRel=applyOp(e.analysis!,r.proposal!.op);
  assert.deepEqual(withRel.edges[1],{from:'c',to:'d',rel:'solution',relBy:'user'});
});

test('a comparison of an older structure gives no structure comments', () => {
  const e=entry();e.analysis!.createdAt='a2';
  assert.ok(!buildComments(e).some(c=>c.kind==='structure'||c.kind==='relation'));
});

test('renaming a node keeps the quote underneath, and the quote itself undoes it', () => {
  const a=entry().analysis!;
  const fixed=renameNode(a,'d','convex  decomposition (근사)');
  const n=fixed.nodes.find(x=>x.id==='d')!;
  assert.equal(n.text,'convex decomposition');
  assert.equal(nodeText(n),'convex decomposition (근사)');
  assert.equal(renameNode(fixed,'d','convex decomposition').nodes.find(x=>x.id==='d')!.edited,undefined);
  assert.equal(renameNode(fixed,'d','  ').nodes.find(x=>x.id==='d')!.edited,undefined);
});

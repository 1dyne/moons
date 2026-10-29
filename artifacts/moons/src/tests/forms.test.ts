import test from 'node:test';
import assert from 'node:assert/strict';
import {formFromDraft,makeFormEntry,missingRequired,newBlock,newForm,type FormTemplate} from '../lib/forms.ts';

function planner():FormTemplate{
  const f=newForm(0);
  const title={...newBlock('text'),label:'Today'};
  const steps={...newBlock('steps'),label:'Order'};
  const estimate={...newBlock('estimate'),label:'Minutes',required:true};
  const planet={...newBlock('planet'),label:'Planet'};
  return {...f,name:'Daily planner',blocks:[title,steps,estimate,planet]};
}

test('form entries hold only the words the user typed; labels and numbers live in meta', ()=>{
  const f=planner();const [title,steps,estimate,planet]=f.blocks;
  const e=makeFormEntry(f,{[title!.id]:'Read chapter 3',[steps!.id]:['Skim','Take notes'],[estimate!.id]:45,[planet!.id]:'p-learning'},'Felt slow today.')!;
  assert.equal(e.body,'Read chapter 3\nSkim\nTake notes\nFelt slow today.');
  assert.ok(!e.body.includes('Today')&&!e.body.includes('Minutes'));
  assert.deepEqual(e.planetIds,['p-learning']);
  assert.equal((e.meta as {values:Record<string,unknown>}).values[estimate!.id],45);
  assert.equal(e.title,'Read chapter 3');
  assert.ok(e.sentences.every(s=>e.body.includes(s)));
});

test('required blocks must be filled; an empty form makes no entry', ()=>{
  const f=planner();
  assert.deepEqual(missingRequired(f,{}),['Minutes']);
  assert.equal(makeFormEntry(f,{},''),null);
});

test('a numbers-only form still saves (estimate without words)', ()=>{
  const f=planner();const estimate=f.blocks[2]!;
  const e=makeFormEntry(f,{[estimate.id]:30},'')!;
  assert.equal(e.body,'');assert.deepEqual(e.sentences,[]);
});

test('photo drafts become manual-checkable forms; unknown kinds fall back to long text', ()=>{
  const f=formFromDraft({name:'Study log',blocks:[{kind:'steps',label:'Plan',options:['Read','Summarize']},{kind:'mystery',label:'Notes'}]},2);
  assert.equal(f.source,'photo');assert.equal(f.position,2);
  assert.deepEqual(f.blocks.map(b=>b.kind),['steps','longtext']);
  assert.deepEqual(f.blocks[0]!.options,['Read','Summarize']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptSpans,needsCheck,neighbours,unfamiliar,type Concept} from '../lib/concepts.ts';

const concept=(id:string,name:string,extra:Partial<Concept>={}):Concept=>({id,name,aliases:[],kind:'term',definition:[],relations:[],mentions:[],state:'seen',createdAt:'t',...extra});

test('concept names are underlined longest first and not inside other words', ()=>{
  const cs=[concept('a','ELK'),concept('b','ELK layered',{aliases:['계층형 레이아웃']}),concept('c','RL')];
  const parts=conceptSpans('ELK layered와 계층형 레이아웃, 그리고 CURL은 아니다.',cs);
  assert.deepEqual(parts.filter(p=>p.concept).map(p=>[p.text,p.concept!.id]),[['ELK layered','b'],['계층형 레이아웃','b']]);
  assert.equal(parts.map(p=>p.text).join(''),'ELK layered와 계층형 레이아웃, 그리고 CURL은 아니다.');
});

test('a "!" only for unconfirmed AI knowledge with no source', ()=>{
  assert.equal(needsCheck({layer:'ai'}),true);
  assert.equal(needsCheck({layer:'ai',confirmed:true}),false);
  assert.equal(needsCheck({layer:'ai',ref:{entryId:'e',sentence:0}}),false);
  assert.equal(needsCheck({layer:'material'}),false);
});

test('dwarf planet until the user explains it, and neighbours both ways', ()=>{
  const a=concept('a','A',{mentions:[{entryId:'e',sentence:0,by:'material',explains:true}],relations:[{to:'b',toName:'B',rel:'contrasts',layer:'ai'}]});
  const b=concept('b','B',{mentions:[{entryId:'e',sentence:1,by:'user',explains:true}]});
  assert.equal(unfamiliar(a),true);
  assert.equal(unfamiliar(b),false);
  assert.deepEqual(neighbours(b,[a,b]).map(n=>[n.other?.id,n.dir]),[['a','in']]);
});

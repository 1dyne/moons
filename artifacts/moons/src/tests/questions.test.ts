import test from 'node:test';
import assert from 'node:assert/strict';
import {materialsOf,newQuestion,newSub,remaining} from '../lib/questions.ts';
import type {Store} from '../lib/model.ts';

test('what remains is computed: open adopted sub-questions and unfamiliar material concepts', ()=>{
  const q=newQuestion('Moons 구조도는 왜 피상적으로 나올까?',{why:'비교 단계로 못 넘어감',entryId:'e',sentence:2});
  assert.equal(q.kind,'question');assert.equal(q.body,'비교 단계로 못 넘어감');assert.deepEqual(q.question!.origin,{entryId:'e',sentence:2});
  const a=newSub('정답 지도는?','user',{entryIds:['m'],conceptIds:['elk']}),b=newSub('비교는?'),c=newSub('AI 초안','ai');
  q.question!.subQuestions=[{...a,status:'tentative'},b,c];
  const store={version:1,entries:[q],planets:[],concepts:[
    {id:'elk',name:'ELK',aliases:[],kind:'tool',definition:[],relations:[],mentions:[{entryId:'m',sentence:0,by:'material'}],state:'seen',createdAt:'t'}]} as unknown as Store;
  assert.deepEqual(materialsOf(q),{entryIds:['m'],conceptIds:['elk']});
  const r=remaining(q,store);
  assert.deepEqual(r.open.map(s=>s.text),['비교는?']);
  assert.deepEqual(r.concepts.map(x=>x.id),['elk']);
  q.question!.subQuestions[1]={...b,status:'closed'};
  assert.equal(remaining(q,store).open.length,0);
});

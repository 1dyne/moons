import test from 'node:test';
import assert from 'node:assert/strict';
import {gapSignals,notationFor,notationPrompt,validateNotation,type Notation} from '../lib/server/v5/notation.ts';
import type {Store} from '../lib/server/v5/types.ts';

const dict:Notation[]=[
 {id:'1',symbol:'[ctrl+F]',meaning:'원문을 찾아 다시 채울 곳',role:'gap'},
 {id:'2',symbol:'//',meaning:'내 표현을 고치는 메모',role:'memo'},
 {id:'3',symbol:'diff.',meaning:'비교 대상',role:'relation',scope:{planetIds:['p-3d']}},
];
const store=(n:unknown)=>({version:1,entries:[],planets:[],notation:n}) as unknown as Store;

test('global symbols apply everywhere; scoped ones only to their planet or form', ()=>{
 const s=store(dict);
 assert.deepEqual(notationFor(s,{planetIds:[],meta:{}}).map(n=>n.id),['1','2']);
 assert.deepEqual(notationFor(s,{planetIds:['p-3d'],meta:{}}).map(n=>n.id),['1','2','3']);
});

test('the prompt names each symbol and how to read it; empty dictionary adds nothing', ()=>{
 const p=notationPrompt(dict.slice(0,2));
 assert.match(p,/\[ctrl\+F\]/);assert.match(p,/빈칸/);assert.match(p,/원문은 그대로/);
 assert.equal(notationPrompt([]),'');
});

test('each sentence with a blank mark opens one "to look up" signal on its node', ()=>{
 const sentences=['모양은 점, 면, 격자로 구분됨 [ctrl+F]','물리적 움직임','Rigid, Deformable, Articulated [ctrl+F]'];
 const nodes=[{id:'a',source:[0]},{id:'b',source:[1]},{id:'c',source:[2]}];
 const s=gapSignals(sentences,nodes,dict);
 assert.deepEqual(s.map(x=>x.nodeId),['a','c']);
 assert.ok(s.every(x=>x.kind==='gap'&&x.state==='open'&&x.reason.startsWith('[ctrl+F]')));
});

test('dictionary entries are validated', ()=>{
 assert.equal(validateNotation(undefined),true);
 assert.equal(validateNotation(dict),true);
 assert.equal(validateNotation([{id:'x',symbol:'*',meaning:'m',role:'magic'}]),false);
});

test('symbol explanations are notes to MOONS: excluded from structuring, signals and backfill', async () => {
 const {annotationLines}=await import('../lib/server/v5/notation.ts');
 const {verifyStructure}=await import('../lib/server/verify.ts');
 const s=['*[ctrl+F]는 원문에서 찾아 채울 곳', '* // = 내 메모', '<제작>', '* 모양 무엇인가 [ctrl+F]', '* 1단계: 모델링', ...Array.from({length:12},(_,i)=>`* 항목 ${i}`)];
 const skip=annotationLines(s,dict);
 assert.deepEqual([...skip],[0,1]);
 assert.deepEqual(gapSignals(s,[{id:'a',source:[0]},{id:'b',source:[3]}],dict,skip).map(g=>g.nodeId),['b']);
 const v=verifyStructure({structure:'지식나열',structure_reason:'',nodes:[{id:'x',text:'원문에서 찾아 채울 곳',role:'concept',group:null,source:[0],empty:false,hesitant:false},{id:'y',text:'<제작>',role:'concept',group:null,source:[2],empty:false,hesitant:false}],edges:[],signals:[],planets:[]},s,[],skip);
 assert.ok(v.ok);
 if(!v.ok)return;
 assert.ok(!v.value.nodes.some(n=>n.source.includes(0)||n.source.includes(1)));
 assert.equal(new Set(v.value.nodes.flatMap(n=>n.source)).size,s.length-2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {noteMarkdown,noteFileName,type Part} from '../lib/export.ts';
import {buildFrames,type LogEvent} from '../lib/replay.ts';
import type {Entry,Store} from '../lib/model.ts';

const entry=(id:string,body:string,extra:Partial<Entry>={}):Entry=>({id,kind:'dump',body,sentences:[body],planetIds:['p1'],createdAt:'2026-10-16T09:00:00.000Z',locked:true,status:'saved',...extra});
const store=(entries:Entry[],extra:Partial<Store>={}):Store=>({version:1,entries,planets:[{id:'p1',name:'Study',color:'#000000',position:{x:0,y:0},entryCount:0,openSignalRatio:0}],...extra});

test('markdown keeps the original words, frontmatter and only the chosen parts', ()=>{
  const a=entry('a','Retopology makes meshes light.',{title:'Retopology'});
  const memo=entry('m','Check edge flow.',{parentEntryId:'a',meta:{memo:true}});
  const s=store([a,memo],{confidence:[{id:'c',targetType:'node',targetId:'a',value:6,at:'2026-10-16T10:00:00.000Z'}]});
  const md=noteMarkdown(s,a,new Set<Part>(['original','memos']),new Set(['a']));
  assert.match(md,/^---\ntitle: "Retopology"\ncreated: 2026-10-16T09:00:00.000Z\nplanets: \["Study"\]/);
  assert.ok(md.includes('Retopology makes meshes light.'));
  assert.ok(md.includes('- Check edge flow.'));
  assert.ok(!md.includes('6/10'),'confidence was not chosen');
});

test('connections become [[links]] only for notes exported together', ()=>{
  const a=entry('a','A.',{title:'Alpha'}),b=entry('b','B.',{title:'Beta'}),c=entry('c','C.',{title:'Gamma'});
  const s=store([a,b,c],{links:[{id:'l1',from:'a',to:'b',relation:'extends',reason:'same idea',createdAt:''},{id:'l2',from:'a',to:'c',relation:'related',reason:'',createdAt:''}]});
  const md=noteMarkdown(s,a,new Set<Part>(['links']),new Set(['a','b']));
  assert.ok(md.includes('- extends: [[Beta]] — same idea'));
  assert.ok(md.includes('- related: Gamma'));
  assert.equal(noteFileName(entry('x','x',{title:'a/b: c?'})),'a b c.md');
});

test('replay rebuilds the space in time order and skips lost conflicts', ()=>{
  const ev=(seq:number,at:string,type:string,op:LogEvent['op']):LogEvent=>({seq,at,type,op});
  const e1=entry('e1','First.'),e2=entry('e2','Second.');
  const events=[
    ev(2,'2026-10-02T00:00:00Z','entries.created',{kind:'upsert',col:'entries',id:'e2',value:e2,base:null}),
    ev(1,'2026-10-01T00:00:00Z','entries.created',{kind:'upsert',col:'entries',id:'e1',value:e1,base:null}),
    ev(3,'2026-10-03T00:00:00Z','conflict.kept_newer',{kind:'remove',col:'entries',id:'e1',base:'x'}),
    ev(4,'2026-10-04T00:00:00Z','settings.set',{kind:'set',field:'settings',value:{},base:null}),
  ];
  const frames=buildFrames(events);
  assert.equal(frames.length,2);
  assert.deepEqual(frames[0]!.store.entries.map(e=>e.id),['e1']);
  assert.deepEqual(frames[1]!.store.entries.map(e=>e.id),['e1','e2']);
});

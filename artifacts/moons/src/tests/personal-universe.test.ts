import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialStore,makeEntry,parseStore} from '../lib/model.ts';
import {arrangePlanets,defaultCamera,DWARF_ID,spaceStore} from '../lib/universe.ts';
import {planetPoint3,toUniverseDTO} from '../lib/personal-universe.ts';

function fixture(){
 const store=initialStore();store.entries=[];
 const [a,b]=store.planets;
 store.entries=[makeEntry('Shared original',{planetIds:[a.id,b.id]}),makeEntry('Unclassified original'),makeEntry('An explicit update',{planetIds:[a.id]})];
 store.entries[2].parentEntryId=store.entries[0].id;
 store.entries[2].relation='updates';
 const derived=spaceStore(store);
 const state={planetIds:derived.planets.map(p=>p.id),positions:arrangePlanets(derived.planets,derived.entries),camera:{...defaultCamera}};
 return {store,state,a,b};
}
test('personal 3D adapter uses actual personal entries only and never changes their originals',()=>{
 const {store,state}=fixture(),before=JSON.stringify(store);
 const data=toUniverseDTO(store,state,'guest-a');
 assert.equal(data.thoughts.length,3);
 assert.equal(new Set(data.thoughts.map(t=>t.id)).size,3);
 assert.deepEqual(new Set(data.thoughts.map(t=>t.id)),new Set(store.entries.map(e=>e.id)));
 assert.equal(data.space.id,'personal-guest-a');
 assert.equal(JSON.stringify(store),before);
});
test('Dwarf Planet and planet filters do not duplicate shared notes or leak hidden records',()=>{
 const {store,state,a}=fixture();
 const dwarf=toUniverseDTO(store,{...state,planetIds:[DWARF_ID]},'guest-a');
 assert.deepEqual(dwarf.thoughts.map(t=>t.id),[store.entries[1].id]);
 const filtered=toUniverseDTO(store,{...state,planetIds:[a.id]},'guest-a');
 assert.equal(filtered.thoughts.length,2);
 assert.ok(!filtered.thoughts.some(t=>t.id===store.entries[1].id));
});
test('relationships are actual saved updates, never invented between unrelated stars',()=>{
 const {store,state}=fixture(),data=toUniverseDTO(store,state,'guest-a');
 assert.equal(data.links.length,1);
 assert.equal(data.links[0].a,store.entries[0].id);
 assert.equal(data.links[0].b,store.entries[2].id);
});
test('server-backed 3D positions override old 2D placements deterministically',()=>{
 const {state,a}=fixture();
 const placed={...state,positions3D:{[a.id]:[12,8,-4] as [number,number,number]}};
 assert.deepEqual(planetPoint3(a.id,placed),[12,8,-4]);
 assert.deepEqual(planetPoint3(a.id,state),planetPoint3(a.id,state));
});
test('optional 3D view state survives the existing JSON backup parser',()=>{
 const {store,state,a}=fixture();
 const pose={position:[0,0,120],target:[0,0,0]};
 store.universe={...state,positions3D:{[a.id]:[12,8,-4]},camera3D:pose} as typeof store.universe;
 const loaded=parseStore(JSON.stringify(store));
 assert.deepEqual(loaded.universe?.positions3D,store.universe.positions3D);
});

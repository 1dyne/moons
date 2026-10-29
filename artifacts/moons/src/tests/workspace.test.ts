import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialStore,makeEntry,parseStore} from '../lib/model.ts';
import {appendMessage,newChat,spaceName} from '../lib/chat.ts';
import {captureBaseline,spaceStore,DWARF_ID} from '../lib/universe.ts';

test('Dwarf Planet is a derived group; it never mutates original classification',()=>{
  const original=initialStore(),memo=makeEntry('A new idea'),tagged=makeEntry('A classified idea',{planetIds:[original.planets[0].id]});
  const source={...original,entries:[memo,tagged]},projected=spaceStore(source);
  assert.deepEqual(memo.planetIds,[]);assert.deepEqual(projected.entries[0].planetIds,[DWARF_ID]);
  assert.deepEqual(projected.entries[1].planetIds,tagged.planetIds);assert.equal(projected.planets.at(-1)?.entryCount,1);
  assert.equal(source.planets.some(p=>p.id===DWARF_ID),false);
});
test('relationship baseline remains immutable when the live map moves',()=>{
  const positions={a:{x:0,y:0},b:{x:3,y:4},c:{x:0,y:10},[DWARF_ID]:{x:30,y:30}};
  const baseline=captureBaseline(Object.keys(positions),positions);
  assert.equal(baseline.distances.find(d=>d.a==='a'&&d.b==='b')?.distance,5);
  assert.equal(baseline.distances.find(d=>d.a==='a'&&d.b==='c')?.relative,1);
  assert.equal(baseline.planetIds.includes(DWARF_ID),false);
  positions.b.x=100;assert.equal(baseline.positions.b.x,3);
});
test('conversations retain independent messages, drafts and pinned nodes across reload',()=>{
  let a={...newChat(),contextIds:['node-a'],draft:'Draft A'},b={...newChat(),contextIds:['node-b'],draft:'Draft B'};
  a=appendMessage(a,'First conversation');
  const loaded=parseStore(JSON.stringify({...initialStore(),chats:[a,b],activeChatId:b.id,profile:{username:'account-id',displayName:'River'}}));
  assert.equal(loaded.activeChatId,b.id);assert.equal(loaded.chats?.[0].messages[0].text,'First conversation');
  assert.equal(loaded.chats?.[0].draft,'');assert.equal(loaded.chats?.[1].draft,'Draft B');
  assert.deepEqual(loaded.chats?.[1].contextIds,['node-b']);assert.equal(loaded.chats?.[1].messages.length,0);
  assert.equal(spaceName(loaded.profile),'River’s space');assert.equal(spaceName({username:'account-id',displayName:''}),'account-id’s space');
});
test('malformed chat history does not prevent existing notes from loading',()=>{
  const entry=makeEntry('Preserve me');const loaded=parseStore(JSON.stringify({...initialStore(),entries:[entry],chats:[{id:'bad'}]}));
  assert.equal(loaded.entries[0].body,'Preserve me');assert.deepEqual(loaded.chats,[]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialStore,makeEntry,parseStore,withStats} from '../lib/model.ts';
import {arrangePlanets,defaultCamera,notePositions,planetRadius,planetSimilarities,visibleEntries,zoomAt} from '../lib/universe.ts';

test('a shared note appears once, and the selected planets determine its visibility',()=>{
  const entries=[makeEntry('shared',{planetIds:['a','b']}),makeEntry('only b',{planetIds:['b']}),makeEntry('unclassified')];
  assert.equal(visibleEntries(entries,['a','b']).length,2);
  assert.deepEqual(visibleEntries(entries,['a']),[entries[0]]);
  assert.deepEqual(visibleEntries(entries,[]),[]);
});
test('similar planets settle closer than unrelated ones, deterministically',()=>{
  const planets=initialStore().planets;
  const entries=[makeEntry('design systems typography interface',{planetIds:[planets[0].id]}),makeEntry('design systems typography interface',{planetIds:[planets[1].id]}),makeEntry('cooking recipe vegetables soup',{planetIds:[planets[2].id]})];
  const layout=arrangePlanets(planets,entries);
  const distance=(a:number,b:number)=>Math.hypot(layout[planets[a].id].x-layout[planets[b].id].x,layout[planets[a].id].y-layout[planets[b].id].y);
  assert.ok(distance(0,1)<distance(0,2));
  assert.deepEqual(layout,arrangePlanets(planets,entries));
  assert.equal(planetSimilarities(planets,entries)[0].similarity,1);
});
test('zoom preserves the world coordinate under the cursor and is bounded',()=>{
  const camera={x:40,y:-25,zoom:.8},point={x:140,y:80},next=zoomAt(camera,point,2.5);
  assert.ok(Math.abs((point.x-next.x)/next.zoom-(point.x-camera.x)/camera.zoom)<1e-8);
  assert.ok(Math.abs((point.y-next.y)/next.zoom-(point.y-camera.y)/camera.zoom)<1e-8);
  assert.equal(zoomAt(camera,point,100).zoom,4);
});
test('views round-trip without freezing note membership, older stores still load',()=>{
  const original=initialStore(),p=original.planets[0];
  const view={id:'v',name:'Learning',planetIds:[p.id],positions:{[p.id]:{x:120,y:-70}},camera:{x:25,y:35,zoom:1.8}};
  const loaded=parseStore(JSON.stringify({...original,views:[view],universe:{...view,activeViewId:'v'}}));
  assert.deepEqual(loaded.views,[view]);assert.equal(loaded.universe?.camera.zoom,1.8);
  const later=makeEntry('added after saving',{planetIds:[p.id]});
  assert.equal(visibleEntries([later],loaded.views![0].planetIds).length,1);
  assert.deepEqual(parseStore(JSON.stringify(original)).entries,[]);
  const corrupt=parseStore(JSON.stringify({...original,universe:{camera:{}},views:[{...view,camera:{...defaultCamera,zoom:NaN}}]}));
  assert.equal(corrupt.universe,undefined);assert.deepEqual(corrupt.views,[]);
});
test('planet growth reflects all assigned notes and every visible note has one position',()=>{
  const base=initialStore(),ids=base.planets.map(p=>p.id),entries=Array.from({length:30},(_,i)=>makeEntry(`note ${i}`,{planetIds:i%2?[ids[0],ids[1]]:[ids[0]]}));
  const store=withStats({...base,entries}),positions=arrangePlanets(store.planets,entries);
  assert.equal(store.planets[0].entryCount,30);assert.ok(planetRadius(30)>planetRadius(1));
  assert.equal(Object.keys(notePositions(entries,store.planets,positions)).length,30);
});

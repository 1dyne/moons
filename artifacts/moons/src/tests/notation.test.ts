import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLegend,examples} from '../lib/notation.ts';

const dump=`* [ctrl+F] 는 개념어가 익숙하지 않아 원문을 찾아 다시 채워넣어야 하는 부분을 의미

descriptive / 주제 : 3D 표현을 시뮬레이션 에셋으로 만드는 단계
* 시각 <-> 쪼개짐, 뒤집힘, 붇연스러움
* 충돌은 하는데 보이는 모양과 어긋남`;

test('a legend line at the top of a dump is offered as a symbol; content bullets are not', ()=>{
  const found=detectLegend(dump,[]);
  assert.equal(found.length,1);
  assert.equal(found[0]!.symbol,'[ctrl+F]');
  assert.equal(found[0]!.role,'gap');
  assert.match(found[0]!.meaning,/원문을 찾아 다시 채워넣어야 하는 부분/);
});

test('symbols already in the dictionary are not offered again', ()=>{
  assert.equal(detectLegend(dump,[{id:'x',symbol:'[ctrl+F]',meaning:'m',role:'gap'}]).length,0);
});

test('the six examples cover the user notation and are editable rows with ids', ()=>{
  const ex=examples();
  assert.deepEqual(ex.map(e=>e.symbol),['[ctrl+F]','//','<…>','<->','diff.','**…**']);
  assert.equal(new Set(ex.map(e=>e.id)).size,6);
});

test('a legend written without a space before the particle is still found', () => {
  const found = detectLegend('*[ctrl+F]는 원문에서 찾아 채울 곳\n* 충돌은 하는데 문제', []);
  assert.deepEqual(found.map(f => f.symbol), ['[ctrl+F]']);
});

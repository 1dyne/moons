import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {defaultTiles,initialStore,makeEntry,type Store} from '../src/lib/model';

// Real browser capture; transcription/storage replies are fixtures, not paid AI calls.
test.use({launchOptions:{
 executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),
 args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],
}});

async function workspace(page:Page,{failOnce=false}={}){
 let store:Store=initialStore(),revision=1,uploads=0,audio=Buffer.alloc(0);
 store.entries=[];
 await page.route('**/api/workspace',async route=>{
  if(route.request().method()==='PUT'){store=route.request().postDataJSON().store;revision++}
  await route.fulfill({json:{store,revision}});
 });
 await page.route('**/api/workspace/actions',route=>route.fulfill({json:{store,revision}}));
 await page.route('**/api/personal/material-audio',async route=>{
  uploads++;
  const request=route.request(),body=request.postDataBuffer()!;
  expect(request.method()).toBe('POST');
  const boundary=request.headers()['content-type'].split('boundary=')[1];
  const fileHeader=body.indexOf(Buffer.from('name="file"'));
  expect(fileHeader).toBeGreaterThan(-1);
  const start=body.indexOf(Buffer.from('\r\n\r\n'),fileHeader)+4;
  const end=body.indexOf(Buffer.from(`\r\n--${boundary}`),start);
  audio=body.subarray(start,end);
  expect(audio.length).toBeGreaterThan(1000);
  expect(body.toString('latin1')).toContain(`name="revision"\r\n\r\n${revision}`);
  if(failOnce&&uploads===1){await route.fulfill({status:503,json:{error:{message:'Temporary upload failure. Please retry.'}}});return}
  const entry=makeEntry('Recorded words for the recording test.',{kind:'media'});
  entry.id='recorded-original';entry.anchors=[{kind:'time',seconds:0}];
  entry.meta={source:'Voice recording',mime:'audio/webm',objectPath:'test-only-recording'};
  store={...store,entries:[...store.entries,entry]};revision++;
  await route.fulfill({json:{store,revision,result:{entryId:entry.id}}});
 });
 await page.route('**/api/personal/material-audio/recorded-original',route=>route.fulfill({body:audio,contentType:'audio/webm'}));
 await page.addInitScript(()=>{
  const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  (window as any).__recordingTracks=[];
  navigator.mediaDevices.getUserMedia=async constraints=>{
   const stream=await native(constraints);(window as any).__recordingTracks.push(...stream.getTracks());return stream;
  };
 });
 return {uploads:()=>uploads,store:()=>store};
}

test('record, preview, failed upload retry, saved original and stopped microphone',async({page})=>{
 const state=await workspace(page,{failOnce:true});
 await page.goto('/');
 await page.getByRole('button',{name:'Record audio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Stop recording',exact:true})).toBeVisible();
 await page.waitForTimeout(1800);
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await expect(page.getByLabel('Recording preview')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__recordingTracks.every((t:MediaStreamTrack)=>t.readyState==='ended'))).toBe(true);
 await page.getByRole('button',{name:'Save recording',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Temporary upload failure');
 await expect(page.getByLabel('Recording preview')).toBeVisible();
 await page.getByRole('button',{name:'Save recording',exact:true}).click();
 await expect.poll(()=>state.uploads()).toBe(2);
 await expect.poll(()=>state.store().entries.length).toBe(1);
 await expect(page.getByLabel('Recording preview')).toHaveCount(0);
 await page.goto('/entries/recorded-original/original');
 await expect(page.locator('#recording-recorded-original')).toBeVisible();
 await expect(page.locator('#recording-recorded-original')).toHaveAttribute('src',/api\/personal\/material-audio\/recorded-original/);
});

test('a blocked microphone shows an error and does not upload anything',async({page})=>{
 const state=await workspace(page);
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Blocked','NotAllowedError'))});
 await page.goto('/');
 await page.getByRole('button',{name:'Record audio',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Microphone access was blocked');
 await expect(page.getByRole('button',{name:'Record audio',exact:true})).toBeEnabled();
 expect(state.uploads()).toBe(0);
});

test('Material tiles also record directly and switch to the audio adapter',async({page})=>{
 const state=await workspace(page);
 const tile=(state.store().tiles??defaultTiles())[0];
 expect(tile).toBeTruthy();
 await page.goto(`/media/${tile.id}`);
 await page.getByRole('button',{name:'Record audio',exact:true}).click();
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Stop recording',exact:true}).click();
 await expect(page.getByLabel('Recording preview')).toBeVisible();
 await expect(page.getByRole('button',{name:'SEND',exact:true})).toBeEnabled();
 expect(state.uploads()).toBe(0);
});

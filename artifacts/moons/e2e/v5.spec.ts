import {test,expect,type APIRequestContext} from '@playwright/test';
const root='http://localhost:80';
async function workspace(request:APIRequestContext){const r=await request.get('/api/workspace');expect(r.status()).toBe(200);return r.json()}
async function action(request:APIRequestContext,kind:string,payload:Record<string,unknown>){
 for(let attempt=0;attempt<3;attempt++){
  const state=await workspace(request);
  const r=await request.post('/api/workspace/actions',{data:{revision:state.revision,kind,payload}});
  if(r.status()===409&&attempt<2)continue;
  expect(r.status(),await r.text()).toBe(200);return r.json();
 }
 throw Error('Workspace stayed in conflict.');
}

test('v5 guest data survives reload, stays isolated and imports only on request',async({page,browser})=>{
 await page.goto('/');
 const input=page.getByRole('textbox',{name:'Write a spark'});
 await expect(input).toBeVisible();
 const text=`I feel anxious about presenting, but I want to try one small prototype. ${crypto.randomUUID()}`;
 await input.fill(text);await input.press('Enter');
 await expect(input).toHaveValue('');
 await expect.poll(async()=>(await workspace(page.request)).store.entries.some((e:{body:string})=>e.body===text)).toBe(true);
 const state=await workspace(page.request);
 const entry=state.store.entries.find((e:{body:string})=>e.body===text);
 await page.goto(`/entries/${entry.id}/original`);
 await expect(page.getByText(text,{exact:true}).first()).toBeVisible();
 await page.reload();await expect(page.getByText(text,{exact:true}).first()).toBeVisible();
 const stranger=await browser.newContext({baseURL:root});
 const other=await workspace(stranger.request);
 expect(other.guestId).not.toBe(state.guestId);expect(other.store.entries).toEqual([]);
 const foreign=await stranger.request.post('/api/workspace/actions',{data:{revision:other.revision,kind:'analyze',payload:{entryId:entry.id}}});
 expect(foreign.status()).toBe(404);
 const forged=await stranger.request.get(`/api/entries/${entry.id}/check-scan`);
 expect(forged.status()).toBe(404);
 await stranger.close();
 const latest=await workspace(page.request);
 const original=structuredClone(latest.store);
 const modified=structuredClone(latest.store);modified.entries.find((e:{id:string})=>e.id===entry.id).body='Rewritten original';
 const rewritten=await page.request.put('/api/workspace',{data:{revision:latest.revision,store:modified}});
 expect(rewritten.status()).toBe(400);
 const stale=await page.request.put('/api/workspace',{data:{revision:-1,store:original}});
 expect([400,409]).toContain(stale.status());
 const before=await workspace(page.request);
 await action(page.request,'import',{backup:before.store});
 const imported=await action(page.request,'import',{backup:before.store});
 expect(imported.result.duplicate).toBe(true);
 expect(imported.store.entries.filter((e:{id:string})=>e.id===entry.id)).toHaveLength(1);
 const privateUrl=await page.request.post('/api/workspace/actions',{data:{revision:imported.revision,kind:'material',payload:{adapter:'url',url:'http://127.0.0.1/admin'}}});
 expect(privateUrl.status()).toBe(400);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await expect(input).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.goto('/now?demo=spy');
 await expect(page.locator('#now-text')).toBeDisabled();
 await expect(page.getByRole('checkbox')).toBeVisible();
});

test('v5 live AI structures sources, compares four states and grounds chat',async({page})=>{
 test.skip(process.env.RUN_LIVE_AI_TESTS!=='1','Opt-in: calls the configured paid OpenAI API');
 test.setTimeout(240000);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'Write a spark'})).toBeVisible();
 const source='Small prototypes can reveal user needs. Small prototypes help us collect early feedback. A prototype is useful when we ask users a concrete question. Feedback is not proof that every user agrees.';
 const material=await action(page.request,'material',{adapter:'dump',title:'Prototype original',text:source,defaultPlanet:'p-learning'});
 const originalId=material.result.entryId;
 let state=await workspace(page.request);
 const id=crypto.randomUUID(),body='Small prototypes help us collect early feedback. Every user will agree with the prototype. I feel anxious about showing my prototype.';
 state.store.entries.unshift({id,kind:'dump',body,sentences:['Small prototypes help us collect early feedback.','Every user will agree with the prototype.','I feel anxious about showing my prototype.'],locked:true,createdAt:new Date().toISOString(),status:'saved',planetIds:['p-learning']});
 state.store.chats=[{id:'v5-chat',title:'Prototype chat',contextIds:[id],draft:'',origin:{kind:'node',ref:id},messages:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
 expect((await page.request.put('/api/workspace',{data:{revision:state.revision,store:state.store}})).status()).toBe(200);
 const analyzed=await action(page.request,'analyze',{entryId:id});
 const analysis=analyzed.store.entries.find((e:{id:string})=>e.id===id).analysis;
 expect(analysis.nodes.length).toBeGreaterThan(0);
 for(const n of analysis.nodes){if(n.empty)continue;expect(body).toContain(n.text);expect((n.emotions??[]).length).toBeLessThanOrEqual(2);for(const em of n.emotions??[])expect(n.text).toContain(em.evidence)}
 const compared=await action(page.request,'compare',{entryId:id,originalId});
 expect(compared.result.comparison.items.every((i:{verdict:string})=>['kept','shifted','added','missed'].includes(i.verdict))).toBe(true);
 await action(page.request,'chat',{chatId:'v5-chat',text:'I am not saying everyone will agree. I want to test one small prototype first. What changed from my earlier words?'});
 state=await workspace(page.request);
 const reply=state.store.chats[0].messages.at(-1);
 expect(reply.role).toBe('assistant');expect(reply.refs).toContain(id);
 if(reply.draftNode)expect('I am not saying everyone will agree. I want to test one small prototype first. What changed from my earlier words?').toContain(reply.draftNode.text);
 const saved=await action(page.request,'material',{adapter:'ai_chat',text:reply.text,title:'MOONS response'});
 const aiMaterial=saved.store.entries.find((e:{id:string})=>e.id===saved.result.entryId);
 expect(aiMaterial.kind).toBe('media');expect(aiMaterial.meta.source).toContain('AI material');
 await page.goto(`/entries/${id}/compare`);
 await expect(page.getByText('COMPARED WITH',{exact:true})).toBeVisible();
 await page.goto('/chat');await expect(page.getByText(reply.text,{exact:true})).toBeVisible();
});

test('demo consent, private scan, mandatory checks and immediate reveal are enforced',async({page,browser})=>{
 test.skip(process.env.RUN_LIVE_AI_TESTS!=='1','Opt-in: calls the configured paid OpenAI API');
 test.setTimeout(240000);
 await page.goto('/now?demo=spy');
 await expect(page.getByRole('checkbox')).toBeVisible();
 const missing=await page.request.post('/api/spaces/hackathon-1014/entries',{data:{text:'A small prototype could help.',demoSpy:true}});
 expect(missing.status()).toBe(400);
 await page.getByRole('checkbox').check();
 const text='I want to show a small prototype to one user first. I feel nervous, but their feedback could tell me what to change.';
 await page.locator('#now-text').fill(text);
 const sent=page.waitForResponse(r=>r.url().includes('/api/spaces/')&&r.request().method()==='POST');
 await page.locator('button[type="submit"]').click();
 const created=await sent;expect(created.status(),await created.text()).toBe(201);
 const {id}=await created.json();
 try{
  await expect.poll(async()=>(await(await page.request.get(`/api/entries/${id}`)).json()).status,{timeout:150000,intervals:[2000]}).toBe('done');
  const raw=await page.request.get(`/api/entries/${id}/check-scan`);expect(raw.status(),await raw.text()).toBe(200);
  const scan=await raw.json();
  expect(scan.required).toBe(true);expect(scan.revealed).toBe(false);
  expect(JSON.stringify(scan)).not.toMatch(/isSpy|spyKind|nearNode/);
  const stranger=await browser.newContext({baseURL:root});await workspace(stranger.request);
  expect((await stranger.request.get(`/api/entries/${id}/check-scan`)).status()).toBe(404);await stranger.close();
  expect((await page.request.post(`/api/entries/${id}/reveal`,{data:{}})).status()).toBe(409);
  expect((await page.request.post(`/api/entries/${id}/add-to-moons`,{data:{}})).status()).toBe(409);
  for(const n of scan.nodes)expect((await page.request.post(`/api/entries/${id}/intent`,{data:{targetType:'node',targetId:n.id,verdict:'agree'}})).status()).toBe(200);
  for(const e of scan.emotions)expect((await page.request.post(`/api/entries/${id}/intent`,{data:{targetType:'emotion',targetId:e.id,verdict:'mean',comment:'This is my check.'}})).status()).toBe(200);
  const reveal=await page.request.post(`/api/entries/${id}/reveal`,{data:{}});expect(reveal.status()).toBe(200);
  const spies=(await reveal.json()).spies;
  expect(spies.length).toBeGreaterThanOrEqual(1);expect(spies.length).toBeLessThanOrEqual(2);
  for(const s of spies)expect(text).not.toContain(s.text);
  const saved=await page.request.post(`/api/entries/${id}/add-to-moons`,{data:{}});expect(saved.status(),await saved.text()).toBe(200);
  const personalId=(await saved.json()).personalId;
  const state=await workspace(page.request),personal=state.store.entries.find((e:{id:string})=>e.id===personalId);
  expect(personal.body).toBe(text);
  expect(personal.analysis.nodes.every((n:{text:string;empty:boolean})=>n.empty||text.includes(n.text))).toBe(true);
  await page.reload();
  await expect(page.getByText('There was a spy in this scan.',{exact:true})).toBeVisible();
 }finally{
  if(process.env.ADMIN_TOKEN)await page.request.patch(`/api/admin/entries/${id}`,{headers:{'x-admin-token':process.env.ADMIN_TOKEN},data:{hidden:true}});
 }
});

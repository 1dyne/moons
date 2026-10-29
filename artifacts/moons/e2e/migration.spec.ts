import {test, expect} from '@playwright/test';

test('personal spark keeps its original text across navigation and reload', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const text = `Migration check ${crypto.randomUUID()}`;
  await page.goto('/');
  await page.getByRole('textbox', {name: 'Write a spark'}).fill(text);
  await page.getByRole('button', {name: 'Save spark', exact: true}).click();
  await expect.poll(async()=>{const r=await page.request.get('/api/workspace');return (await r.json()).store.entries.some((e:{body:string})=>e.body===text)}).toBe(true);
  const entryId=(await(await page.request.get('/api/workspace')).json()).store.entries.find((e:{body:string})=>e.body===text).id as string;
  await page.getByRole('button', {name: 'Menu', exact: true}).click();
  await page.getByRole('navigation').getByRole('button', {name: 'Nodes'}).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByText(text, {exact: true})).toBeVisible();
  await page.getByText(text, {exact: true}).click();
  await expect(page).toHaveURL(new RegExp(`/entries/${entryId}/original$`));
  await page.reload();
  await expect(page.getByText(text, {exact: true})).toBeVisible();
  await page.screenshot({path: '../../generated-artifacts/moons-original.jpg'});
  await page.goto('/chat');
  await expect(page.locator('main')).toBeVisible();
  await page.goto('/media/book');
  await expect(page.locator('main')).toBeVisible();
  expect(errors).toEqual([]);
});

test('event pages, errors, QR and administrator gate retain their behavior', async ({page, request}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/now', '/live', '/universe', '/admin']) {
    await page.goto(route);
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page).toHaveTitle(/MOONS/);
  }
  const universe = await request.get('/api/spaces/hackathon-1014/universe');
  expect(universe.status()).toBe(200);
  const body = await universe.json();
  expect(body.space.questions.length).toBeGreaterThan(0);
  expect(Array.isArray(body.thoughts)).toBe(true);
  expect((await request.get('/api/admin/entries')).status()).toBe(401);
  expect((await request.get('/api/entries/not-found')).status()).toBe(404);
  const qr = await request.get('/api/qr?url=https%3A%2F%2Fexample.com%2Fnow');
  expect(qr.status()).toBe(200);
  expect(await qr.text()).toContain('<svg');
  const invalid = await request.post('/api/spaces/hackathon-1014/entries', {
    data: {text: ''},
  });
  expect(invalid.status()).toBe(400);
  await page.goto('/now');
  await page.screenshot({path: '../../generated-artifacts/moons-now.jpg'});
  expect(errors).toEqual([]);
});

test('phone layout renders the original capture and event pages', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await expect(page.getByRole('textbox', {name: 'Write a spark'})).toBeVisible();
  await page.goto('/now');
  await expect(page.locator('#now-text')).toBeVisible();
  await expect(page.getByRole('button', {name: 'Scan it'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('live event analysis, decisions and admin moderation work with configured credentials', async ({page, request}) => {
  test.skip(process.env.RUN_LIVE_AI_TESTS !== '1', 'Opt-in: calls the original paid OpenAI API');
  test.setTimeout(240000);
  if (!process.env.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN must be configured for this live check');
  const text = '파이어사이드 챗에서 작은 기능부터 실제 사용자에게 보여주라는 말이 기억에 남았어요. 완벽하게 만들기보다 먼저 피드백을 받아보고 싶어요.';
  const nickname = `port-check-${crypto.randomUUID().slice(0, 8)}`;
  await page.goto('/now');
  await page.locator('#now-text').fill(text);
  // Server-owned cookie identity, never the legacy browser participant ID.
  const sentResponse = page.waitForResponse(response =>
    response.url().includes('/api/spaces/') && response.request().method() === 'POST',
  );
  await page.getByRole('button', {name: 'Scan it'}).click();
  const sent = await sentResponse;
  expect(sent.status()).toBe(201);
  const {id} = await sent.json();
  let decisionId: string | undefined;
  const auth = {'x-admin-token': process.env.ADMIN_TOKEN};
  try {
    await expect(page).toHaveURL(new RegExp(`/t/${id}\\?scan=1`));
    await expect.poll(async () => {
      const response = await request.get(`/api/entries/${id}`);
      return (await response.json()).status;
    }, {timeout: 150000, intervals: [2000]}).toBe('done');
    await expect(page.getByRole('heading', {name: 'Here is the shape of what you took in'})).toBeVisible({timeout: 10000});
    await expect(page.getByRole('region', {name: 'Structure of the thought'})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', {name: 'Here is the shape of what you took in'})).toBeVisible();
    const result = await (await request.get(`/api/entries/${id}`)).json();
    expect(result.body).toBe(text);
    expect(result.analysis.model).not.toBe('mock');
    expect(result.analysis.nodes.length).toBeGreaterThan(0);
    await page.screenshot({path: '../../generated-artifacts/moons-live-analysis.jpg'});
    await page.goto('/live');
    await expect.poll(async () => {
      const universe = await (await request.get('/api/spaces/hackathon-1014/universe')).json();
      return universe.thoughts.some((thought: {id: string}) => thought.id === id);
    }).toBe(true);
    const crossResponse = await page.request.post(`/api/entries/${id}/crossroads`, {timeout: 110000});
    expect(crossResponse.status()).toBe(201);
    const crossroad = await crossResponse.json();
    expect(crossroad.paths.length).toBeGreaterThanOrEqual(2);
    const decision = await page.request.post(`/api/crossroads/${crossroad.id}/choose`, {
      data: {pathId: crossroad.paths[0].id, reason: nickname},
    });
    expect(decision.status()).toBe(201);
    decisionId = (await decision.json()).decisionEntry;
    await page.goto(`/t/${decisionId}`);
    await expect(page.getByRole('heading', {name: 'Here is the shape of what you took in'})).toBeVisible();
    await page.evaluate(token => sessionStorage.setItem('moons.admin', token), process.env.ADMIN_TOKEN);
    await page.goto('/admin');
    const row = page.locator('.ad-list li').filter({has: page.getByText(text, {exact: true})});
    await expect(row).toBeVisible();
    await row.getByRole('button', {name: 'Hide', exact: true}).click();
    await expect(row.getByRole('button', {name: 'Show', exact: true})).toBeVisible();
    expect((await request.get(`/api/entries/${id}`)).status()).toBe(404);
    await row.getByRole('button', {name: 'Show', exact: true}).click();
    await expect(row.getByRole('button', {name: 'Hide', exact: true})).toBeVisible();
    expect((await request.get(`/api/entries/${id}`)).status()).toBe(200);
  } finally {
    // Keep synthetic smoke-test reflections off the user's shared live screen.
    for (const entryId of [id, decisionId].filter(Boolean)) {
      await request.patch(`/api/admin/entries/${entryId}`, {
        headers: auth, data: {hidden: true},
      });
    }
  }
});

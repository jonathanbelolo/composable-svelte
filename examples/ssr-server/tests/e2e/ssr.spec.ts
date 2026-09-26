import { test, expect } from '@playwright/test';

test('SSR sends routed content, safe serialized state and one metadata owner', async ({ request }) => {
  const response = await request.get('/posts/1/comments?source=email');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('class="comments-page');
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  const serialized = html.match(/<script id="__COMPOSABLE_SVELTE_STATE__" type="application\/json">([\s\S]*?)<\/script>/);
  expect(serialized).not.toBeNull();
  const state = JSON.parse(serialized![1]!);
  expect(state.destination).toEqual({ type: 'comments', state: { postId: 1 } });
  expect(state.routeSearch).toBe('?source=email');
  expect(state.comments.some((comment: { postId: number }) => comment.postId !== 1)).toBe(true);
});

for (const locale of ['en', 'fr', 'es']) {
  test(`${locale} routes render the correct language and localized links without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      const prefix = locale === 'en' ? '' : `/${locale}`;
      const response = await page.goto(`${test.info().project.use.baseURL}${prefix}/posts/1`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://example.com${prefix}/posts/1`);
      await expect(page.locator('.comments-link')).toHaveAttribute('href', `${prefix}/posts/1/comments`);
      await page.locator('.comments-link').click();
      await expect(page.locator('.comments-page')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${prefix}/posts/1/comments$`));
    } finally { await context.close(); }
  });
}

for (const route of ['/missing', '/posts/999999', '/fr/posts/999999/comments', '/posts/1garbage']) {
  test(`unknown resource ${route} is a real 404 with not-found content`, async ({ request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('class="not-found');
    expect(html).not.toContain('class="post-card');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });
}

test('path locale takes priority over query and language headers', async ({ request }) => {
  const response = await request.get('/fr/posts/1?lang=es', { headers: { 'Accept-Language': 'en' } });
  expect(await response.text()).toContain('<html lang="fr">');
  const query = await request.get('/posts/1?lang=es');
  expect(await query.text()).toContain('<html lang="es">');
});

test('hydrated navigation retains query, locale and comments through Back/Forward', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const hydrated = page.waitForEvent('console', message => message.text().includes('hydrated successfully'));
  await page.goto('/fr/posts/1/comments?source=email');
  await hydrated;
  const firstComments = await page.locator('.comment').count();
  expect(firstComments).toBeGreaterThan(0);
  await page.evaluate(() => { document.body.dataset.sameDocument = 'yes'; });
  await page.locator('.breadcrumb a').first().click();
  await expect(page).toHaveURL(/\/fr\/\?source=email$/);
  await page.locator('.post-card a[href="/fr/posts/2"]').click();
  await expect(page).toHaveURL(/\/fr\/posts\/2\?source=email$/);
  await page.locator('.comments-link').click();
  await expect(page.locator('.comment')).not.toHaveCount(0);
  await expect(page).toHaveURL(/\/fr\/posts\/2\/comments\?source=email$/);
  await page.goBack();
  await expect(page.locator('.detail-page')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.comments-page')).toBeVisible();
  expect(await page.locator('body').getAttribute('data-same-document')).toBe('yes');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(errors).toEqual([]);
});

test('language switch performs a supported localized document navigation', async ({ page }) => {
  await page.goto('/posts/1');
  await page.getByRole('link', { name: 'Español' }).click();
  await expect(page).toHaveURL(/\/es\/posts\/1$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('.detail-page')).toBeVisible();
});

test('Back restores the initial header-detected locale on an unprefixed entry', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr', baseURL: `http://127.0.0.1:${process.env.SSR_TEST_PORT ?? 3198}` });
  const page = await context.newPage();
  const hydrated = page.waitForEvent('console', message => message.text().includes('hydrated successfully'));
  await page.goto('/posts/1?source=header');
  await hydrated;
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.locator('.comments-link').click();
  await expect(page).toHaveURL(/\/fr\/posts\/1\/comments\?source=header$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/posts\/1\?source=header$/);
  await expect(page.locator('.header-text h1')).toHaveText('Articles de Blog');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await context.close();
});

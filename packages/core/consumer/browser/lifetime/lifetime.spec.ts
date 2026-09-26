import { expect, test, type Route } from '@playwright/test';

test('whole-app retirement isolates a fresh instance from a late service result', async ({ page }) => {
  const errors: string[] = [];
  const requests: Route[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__lifetime/load', route => { requests.push(route); });
  await page.goto('/browser/lifetime/index.html');

  const count = page.getByTestId('count');
  const load = page.getByRole('button', { name: 'Load', exact: true });
  await expect(count).toHaveText('7');
  await expect(page.locator('main')).toHaveCSS('padding-top', '24px');
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(count).toHaveText('8');
  await load.click();
  await expect.poll(() => requests.length).toBe(1);
  await expect(load).toBeDisabled();

  await page.getByRole('button', { name: 'Unmount application', exact: true }).click();
  await expect(page.locator('main')).toHaveCount(0);
  await expect(count).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount application', exact: true }).click();
  await expect(count).toHaveText('7');
  await expect(load).toBeEnabled();
  await load.click();
  await expect.poll(() => requests.length).toBe(2);

  const retiredResponse = page.waitForResponse(response => response.url().endsWith('/__lifetime/load'));
  await requests[0]!.fulfill({ status: 200, contentType: 'text/plain', body: '91' });
  await (await retiredResponse).finished();
  // Let the real fetch continuation and Svelte rendering settle; preserve native clocks.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(count).toHaveText('7');
  await expect(load).toBeDisabled();
  await requests[1]!.fulfill({ status: 200, contentType: 'text/plain', body: '42' });
  await expect(count).toHaveText('42');
  await expect(load).toBeEnabled();
  expect(errors).toEqual([]);
});

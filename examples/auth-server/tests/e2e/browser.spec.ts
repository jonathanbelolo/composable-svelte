import { expect, test, type Page } from '@playwright/test';

/**
 * What only a real browser can prove.
 *
 * Everything about request and response shapes is covered in `tests/`, which
 * needs no browser. These five are the properties a Node suite structurally
 * cannot check: that the browser stores an HttpOnly cookie, re-sends it on a
 * fresh page load, drops it on sign-out, and carries a pending OAuth record
 * across a **full-page navigation** to another origin and back.
 *
 * A `location.assign` destroys a test runner, which is why the redirect tests
 * live here and not in vitest.
 */

const ADA = { email: 'ada@example.com', password: 'correct-horse-battery-staple' };

test.beforeEach(async ({ page, context }) => {
	await context.clearCookies();
	// One long-lived server serves this whole suite, so state has to go back.
	// The route exists only because `AUTH_FIXTURE_TESTING=1` — see `routes/testing.ts`.
	await page.request.post('http://127.0.0.1:4100/__test__/reset');
});

async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Email').fill(ADA.email);
	await page.getByLabel('Password', { exact: true }).fill(ADA.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByTestId('session-status')).toHaveText('authenticated');
}

test('the session survives a full page load, carried by the cookie alone', async ({ page }) => {
	// The property this whole exercise exists for. Nothing is stored client-side:
	// a reloaded page is signed in only because the browser sent a cookie it
	// cannot read and the server recognised it.
	await signIn(page);

	await page.goto('/settings');

	await expect(page.getByTestId('session-status')).toHaveText('authenticated');
	await expect(page.getByTestId('account')).toContainText('ada@example.com');
});

test('the cookie is HttpOnly, and script cannot see it', async ({ page, context }) => {
	await signIn(page);

	const cookie = (await context.cookies()).find((c) => c.name === 'cs_session');
	expect(cookie, 'no session cookie was set').toBeDefined();
	expect(cookie?.httpOnly, 'the session cookie was readable by script').toBe(true);
	expect(cookie?.sameSite).toBe('Lax');

	// The client's whole fail-closed design rests on this: it cannot verify the
	// cookie because it cannot see it.
	const visible = await page.evaluate(() => document.cookie);
	expect(visible).not.toContain('cs_session');
});

test('signing out drops the cookie, and a reload is anonymous', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings');

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page.getByTestId('session-status')).toHaveText('anonymous');

	await page.goto('/settings');
	await expect(page.getByTestId('session-status')).toHaveText('anonymous');
	await expect(page.getByText('You are signed out.')).toBeVisible();
});

test('signs in through a real OAuth redirect', async ({ page }) => {
	// A genuine `location.assign` to another path, a 302 from the stub identity
	// provider, and a return that reads the nonce back out of `sessionStorage` —
	// which had to survive the navigation.
	await page.goto('/');
	await page.getByRole('button', { name: /Continue with GitHub/ }).click();

	await page.waitForURL(/\/callback\?/);
	await expect(page.getByRole('heading', { name: "You're signed in" })).toBeVisible();

	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByTestId('session-status')).toHaveText('authenticated');
});

test('connects a provider without starting a second session', async ({ page, context }) => {
	// The same redirect machinery with `intent: 'link'` written into the pending
	// record. The client reads it at the callback and calls a different
	// dependency — and the cookie must not change, because linking is not a
	// sign-in.
	await signIn(page);
	await page.goto('/settings');

	await page
		.getByRole('listitem')
		.filter({ hasText: 'GitHub' })
		.getByRole('button', { name: 'Disconnect' })
		.click();
	await expect(page.getByRole('button', { name: 'Connect GitHub' })).toBeVisible();

	const before = (await context.cookies()).find((c) => c.name === 'cs_session')?.value;

	await page.getByRole('button', { name: 'Connect GitHub' }).click();
	await page.waitForURL(/\/callback\?/);

	// The link wording, not the sign-in wording. Telling someone already signed
	// in that they are now signed in is a small lie about what just happened.
	await expect(page.getByRole('heading', { name: 'Account connected' })).toBeVisible();

	const after = (await context.cookies()).find((c) => c.name === 'cs_session')?.value;
	expect(after, 'linking a provider rotated the session cookie').toBe(before);

	await page.getByRole('button', { name: 'Back to your account' }).click();
	await expect(page.getByTestId('account')).toContainText('github');
});

test('shows a cancelled sign-in as a branch, not a failure', async ({ page }) => {
	// `oauth_denied` reaches the client through the callback query string after a
	// real redirect, which is the only way it is ever produced.
	//
	// The provider request is intercepted and re-sent with `deny=1`, which is
	// this stub's stand-in for pressing Cancel. Intercepting rather than
	// navigating twice matters: letting the first flow finish would sign the user
	// in, and then there would be nothing to cancel.
	await page.route('**/provider/authorize*', async (route) => {
		const url = new URL(route.request().url());
		url.searchParams.set('deny', '1');
		await route.continue({ url: url.toString() });
	});

	await page.goto('/');
	await page.getByRole('button', { name: /Continue with GitHub/ }).click();

	await page.waitForURL(/\/callback\?/);

	// A cancellation is the flow branching, not a failure — no red banner, and
	// the way onward says "Try again" rather than "Start again".
	await expect(page.getByRole('heading', { name: 'Sign-in cancelled' })).toBeVisible();
	await expect(page.getByTestId('session-status')).toHaveText('anonymous');
});

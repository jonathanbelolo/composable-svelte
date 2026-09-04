import { defineConfig, devices } from '@playwright/test';

/**
 * The browser truths, and only those.
 *
 * The Node suite in `tests/` covers all 22 endpoints and every error arm; it
 * needs no browser and runs in two seconds. What it *cannot* do is prove that a
 * browser stores an HttpOnly cookie, re-sends it, and carries a session across
 * a full-page OAuth redirect — navigating destroys a test runner, so those are
 * here.
 *
 * **Chromium only.** CI installs only chromium, and
 * `examples/ssr-server/playwright.config.ts` declares three browsers it cannot
 * run for exactly that reason. Do not copy that part.
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env['CI'],
	retries: process.env['CI'] ? 2 : 0,
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:4101',
		trace: 'on-first-retry',
		headless: true
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: [
		{
			// `AUTH_FIXTURE_TESTING` registers `/__test__/*`, which is how each test
			// resets state. One long-lived process serves the whole suite here,
			// unlike the Node suite where a fresh server per file makes reset moot.
			command: 'pnpm start',
			url: 'http://127.0.0.1:4100/__test__/outbox',
			reuseExistingServer: !process.env['CI'],
			timeout: 60_000,
			env: { AUTH_FIXTURE_TESTING: '1', AUTH_FIXTURE_QUIET: '1', PORT: '4100' }
		},
		{
			// The built app, not the dev server: CI runs `pnpm -r build` before
			// tests, and serving the same artifact a user would get is the point.
			command: 'pnpm preview',
			url: 'http://localhost:4101/',
			reuseExistingServer: !process.env['CI'],
			timeout: 60_000
		}
	]
});

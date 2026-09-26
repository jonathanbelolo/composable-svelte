import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests.
 * See https://playwright.dev/docs/test-configuration.
 */
const port = Number(process.env.SSR_TEST_PORT ?? 3198);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid SSR_TEST_PORT');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: `pnpm build && PORT=${port} HOST=127.0.0.1 pnpm start`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});

import { defineConfig } from 'vitest/config';
import base from './vite.config.js';

/** Focused cross-browser motion/scroll qualification; the normal runner stays unchanged. */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/fluid-motion/*.browser.test.ts'],
    browser: {
      ...base.test?.browser,
      enabled: true,
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});

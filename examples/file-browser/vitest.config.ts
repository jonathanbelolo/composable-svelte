import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import vite from './vite.config';

export default mergeConfig(vite, defineConfig({
  test: {
    include: ['tests/**/*.browser.test.ts'],
    browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] }
  }
}));

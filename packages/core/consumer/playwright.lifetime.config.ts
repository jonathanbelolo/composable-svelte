import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser/lifetime',
  outputDir: 'test-results-lifetime',
  use: { baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'npx vite build --config vite.lifetime.config.ts && npx vite preview --config vite.lifetime.config.ts --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/browser/lifetime/index.html',
    reuseExistingServer: false
  }
});

import { defineConfig } from 'vitest/config';
import base from './vite.config.js';
export default defineConfig({...base, cacheDir:'/private/tmp/fluid-overlays-core-astra-review/vite-cache',test:{...base.test,include:['tests/fluid-motion/core-astra-*.browser.test.ts'],browser:{...base.test.browser,instances:[{browser:'chromium'},{browser:'firefox'},{browser:'webkit'}]}}});

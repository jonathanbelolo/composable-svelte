import { defineConfig } from 'vitest/config';
import base from './vite.config.js';
export default defineConfig({...base, cacheDir:'/private/tmp/fluid-overlays-core-astra-review/vite-controls-cache',test:{...base.test,fileParallelism:false,include:['tests/fluid-motion/overlay-*.browser.test.ts','tests/fluid-motion/s1-transform-*.browser.test.ts'],browser:{...base.test.browser,instances:[{browser:'chromium'},{browser:'firefox'},{browser:'webkit'}]}}});

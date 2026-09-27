#!/usr/bin/env node
/**
 * Top-level back/forward-cache qualification for binding-owned scroll (WP7 L2).
 *
 * Builds the fixture with Vite in production mode (inline config, output outside the repository), serves it with a
 * plain static server (no HMR websocket, no unload/beforeunload listeners), and drives Chromium, Firefox and WebKit
 * through a real cross-document navigation and a real Back. Only supported Playwright launch options are used:
 * Chromium's automation default `--disable-back-forward-cache` is removed via `ignoreDefaultArgs`.
 * No synthetic events are dispatched; the page only records what the browser delivers.
 *
 * Usage (from packages/core): node tests/fluid-motion/scroll-fixtures/standalone-cache.mjs <outDir> [evidence.json]
 */
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium, firefox, webkit } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './static-server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? join(process.env.TMPDIR ?? '/tmp', 'scroll-cache-fixture'));
const evidencePath = process.argv[3];

await build({
  configFile: false,
  root: here,
  logLevel: 'warn',
  mode: 'production',
  plugins: [svelte({ configFile: false })],
  build: {
    outDir, emptyOutDir: true, minify: false,
    rollupOptions: { input: { cache: join(here, 'cache.html'), other: join(here, 'other.html') } }
  }
});

const { server, origin } = await serve(outDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const engines = [
  // `channel: 'chromium'` selects full Chromium in new headless mode; the default headless shell's embedder reports
  // BackForwardCacheDisabledForDelegate.
  ['chromium', chromium, { channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] }],
  ['firefox', firefox, {}],
  ['webkit', webkit, {}],
  // Refusal probes (SCROLL_CACHE_PROBES=1): supported options only, to separate headless or pref causes from
  // automation-layer refusal. Juggler (Firefox) sets docShell.disallowBFCache unconditionally.
  ...(process.env.SCROLL_CACHE_PROBES ? [
    ['firefox+bfcacheInParent', firefox, { firefoxUserPrefs: { 'fission.bfcacheInParent': true } }],
    ['webkit-headed', webkit, { headless: false }]
  ] : [])
];

/** Reads the recorder, tolerating a context torn down by an in-flight navigation. */
async function read(page) {
  for (let i = 0; i < 50; i++) {
    try {
      return await page.evaluate(() => {
        const log = window.__cache;
        const navigation = performance.getEntriesByType('navigation')[0];
        return log && {
          docId: log.docId, attached: log.attachedAt !== undefined, scrollY: window.scrollY, writes: log.writes,
          seam: [...log.seam], pageshow: [...log.pageshow], pagehide: [...log.pagehide],
          mode: history.scrollRestoration, record: history.state?.__composableRoute?.scroll ?? null,
          navigationType: navigation?.type, notRestoredReasons: navigation?.notRestoredReasons ?? null, url: location.pathname
        };
      });
    } catch { await sleep(100); }
  }
  throw new Error('fixture recorder unreadable');
}

const results = [];
try {
  for (const [name, engine, launch] of engines) {
    const result = { engine: name, version: undefined, launch: Object.keys(launch).length ? launch : 'defaults' };
    let browser;
    try {
      browser = await engine.launch(launch);
      result.version = browser.version();
      const context = await browser.newContext();
      const page = await context.newPage();
      // Chromium diagnostic only (observes, never drives): explicit reasons when a history navigation is not served
      // from the back/forward cache (performance notRestoredReasons masks them for this origin).
      if (name === 'chromium') {
        const cdp = await context.newCDPSession(page);
        result.cdpNotUsed = [];
        cdp.on('Page.backForwardCacheNotUsed', event => result.cdpNotUsed.push(event.notRestoredExplanations));
        await cdp.send('Page.enable');
      }
      await page.goto(`${origin}/app/a`);
      await page.waitForFunction(() => window.__cache?.attachedAt !== undefined);
      await page.evaluate(() => window.scrollTo(0, 1200));
      await sleep(1600); // one idle persist (250 ms idle, ≤ 1 per 1000 ms)
      const before = await read(page);

      // Real cross-document navigation, then a real Back.
      await page.goto(`${origin}/other.html`);
      await page.waitForSelector('#other');
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => window.__cache?.pageshow?.length > 0 && location.pathname === '/app/a', undefined, { timeout: 10000 });
      const atShow = await read(page);
      await sleep(1000); // any duplicate restore or write would land here
      const after = await read(page);

      const lastShow = after.pageshow.at(-1);
      result.before = before;
      result.after = after;
      result.atShowTime = atShow.pageshow.at(-1);
      result.verdict = {
        persisted: lastShow?.persisted === true,
        sameDocument: after.docId === before.docId,
        scrollPreserved: Math.abs(after.scrollY - before.scrollY) <= 1,
        pageRestoredEvents: after.seam.filter(type => type === 'pageRestored').length - before.seam.filter(type => type === 'pageRestored').length,
        appliedAfterShow: after.seam.slice(lastShow?.seam ?? 0).filter(type => type === 'applied').length,
        writesAfterShow: after.writes - (lastShow?.writes ?? after.writes),
        modeAfter: after.mode
      };
      result.qualified = result.verdict.persisted && result.verdict.sameDocument && result.verdict.scrollPreserved &&
        result.verdict.pageRestoredEvents === 1 && result.verdict.appliedAfterShow === 0 && result.verdict.writesAfterShow === 0;
    } catch (error) {
      result.error = String(error?.stack ?? error);
      result.qualified = false;
    } finally {
      await browser?.close();
    }
    results.push(result);
    console.log(JSON.stringify({ engine: result.engine, version: result.version, qualified: result.qualified, verdict: result.verdict, cdpNotUsed: result.cdpNotUsed, error: result.error?.split('\n')[0] }));
  }
} finally {
  server.close();
}
if (evidencePath) await writeFile(evidencePath, JSON.stringify({ capturedAt: new Date().toISOString(), origin, results }, null, 2));
process.exitCode = results.some(result => result.qualified) ? 0 : 1;

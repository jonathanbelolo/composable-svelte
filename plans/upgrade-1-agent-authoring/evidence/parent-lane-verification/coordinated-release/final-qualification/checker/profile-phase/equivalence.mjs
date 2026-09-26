// Functional-equivalence verification for the native production consumers (maps, graphics, charts). Reviewer-style
// tooling, run on CLONES of the materialized inputs; the qualifying directories are never modified.
// usage: node equivalence.mjs --receipt <v2 profile-qualification-receipt.json> --evidence <dir>
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && acc.push([a.slice(2), all[i + 1]]), acc), []));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const receipt = JSON.parse(readFileSync(args.receipt, 'utf8'));
mkdirSync(args.evidence, {recursive: true});
const startedAt = new Date().toISOString();
const run = (cmd, argv, cwd) => {
  const r = spawnSync(cmd, argv, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: {...process.env, CI: '1'}});
  return {cmd: [cmd, ...argv].join(' '), cwd, exit: r.status, stdoutTail: (r.stdout || '').slice(-1500), stderrTail: (r.stderr || '').slice(-1500)};
};

const SSR = (noExternal) => `import {createServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
const server = await createServer({configFile: false, plugins: [svelte({configFile: false})], ssr: {noExternal: ${noExternal}},
  server: {middlewareMode: true, hmr: false}, appType: 'custom', logLevel: 'error'});
try {
  const {render} = await server.ssrLoadModule('svelte/server');
  const out = {};
  for (const [name, path] of [['instrumented', '/src/App.svelte'], ['production', '/src/ProductionApp.svelte']]) {
    const {default: App} = await server.ssrLoadModule(path);
    const pick = (r) => ({head: String(r.head), body: String(r.body)});
    out[name] = {plain: pick(render(App)), brush: pick(render(App, {props: {brush: true}}))};
  }
  console.log(JSON.stringify(out));
} finally { await server.close(); }
`;

const CONFIG = `import {defineConfig} from 'vitest/config';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {playwright} from '@vitest/browser-playwright';
export default defineConfig({plugins: [svelte()], test: {include: ['src/opus-equivalence.browser.test.ts'],
  browser: {enabled: true, provider: playwright(), instances: [{browser: 'chromium'}], headless: true}}});
`;

const COMMON = `import {expect, it} from 'vitest';
import {flushSync, mount, unmount} from 'svelte';
import Instrumented from './App.svelte';
import Production from './ProductionApp.svelte';
const frames = async (n = 30) => { for (let i = 0; i < n; i += 1) await new Promise<void>((r) => requestAnimationFrame(() => r())); };
const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('equivalence wait timed out'); await frames(1); }
};
// Map/WebGL canvases and generated ids are instance-specific; everything else must match exactly.
const normalize = (el: Element) => el.innerHTML.replace(/ id="[^"]*"/g, '').replace(/ (aria-describedby|aria-labelledby|for)="[^"]*"/g, '');
const host = () => { const t = document.createElement('div'); t.style.width = '640px'; t.style.height = '400px'; document.body.append(t); return t; };
// Production path of main.ts: mounted without onApp.
const pair = (props: Record<string, unknown> = {}) => {
  const a = host(); const b = host();
  const ia = mount(Instrumented, {target: a, props}); const pb = mount(Production, {target: b, props});
  flushSync();
  return {a, b, done: async () => { await unmount(ia); await unmount(pb); a.remove(); b.remove(); }};
};
`;

const TESTS = {
  maps: `${COMMON}
it('instrumented (no onApp) and production consumer render and react identically', async () => {
  const {a, b, done} = pair();
  try {
    await waitFor(() => !!a.querySelector('canvas') && !!b.querySelector('canvas') && !!a.querySelector('select') && !!b.querySelector('select'));
    await frames();
    expect(normalize(b)).toBe(normalize(a));
    for (const t of [a, b]) {
      const select = t.querySelector('select')!;
      select.value = select.options[select.options.length - 1].value;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    flushSync(); await frames();
    expect(b.querySelector('select')!.value).toBe(a.querySelector('select')!.value);
    expect(normalize(b)).toBe(normalize(a));
  } finally { await done(); }
});
`,
  graphics: `${COMMON}
it('instrumented (no onApp) and production consumer render identically', async () => {
  const {a, b, done} = pair();
  try {
    await waitFor(() => !!a.querySelector('canvas') && !!b.querySelector('canvas'));
    await frames();
    expect(normalize(b)).toBe(normalize(a));
  } finally { await done(); }
});
`,
  charts: `${COMMON}
it('instrumented (no onApp) and production consumer render and zoom identically', async () => {
  const {a, b, done} = pair();
  try {
    const zoomReady = (t: Element) => { const s = t.querySelector('svg'); return !!s && Reflect.get(s, '__zoom') !== undefined; };
    await waitFor(() => zoomReady(a) && zoomReady(b));
    expect(a.querySelectorAll('svg circle')).toHaveLength(2);
    expect(normalize(b)).toBe(normalize(a));
    for (const t of [a, b]) {
      // Same point relative to each chart (the two hosts are stacked, so absolute coordinates differ).
      const svg = t.querySelector('svg')!; const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, deltaY: -100, clientX: r.left + 200, clientY: r.top + 200}));
    }
    await frames(60);
    expect(normalize(b)).toBe(normalize(a));
  } finally { await done(); }
});
it('instrumented (no onApp) and production consumer lift the same brush selection', async () => {
  const rows: Record<string, unknown[] | undefined> = {};
  const a = host(); const b = host();
  const ia = mount(Instrumented, {target: a, props: {brush: true, onSelectionChange: (r: unknown[]) => { rows.a = r; }}});
  const pb = mount(Production, {target: b, props: {brush: true, onSelectionChange: (r: unknown[]) => { rows.b = r; }}});
  flushSync();
  try {
    await waitFor(() => !!a.querySelector('.cs-brush .overlay') && !!b.querySelector('.cs-brush .overlay'));
    expect(normalize(b)).toBe(normalize(a));
    for (const t of [a, b]) {
      const svg = t.querySelector('svg')!; const bounds = svg.getBoundingClientRect();
      const circles = Array.from(svg.querySelectorAll('circle'));
      const xs = circles.map((c) => Number(c.getAttribute('cx'))); const ys = circles.map((c) => Number(c.getAttribute('cy')));
      const [x0, y0, x1, y1] = [bounds.left + Math.min(...xs) - 10, bounds.top + Math.min(...ys) - 10, bounds.left + Math.max(...xs) + 10, bounds.top + Math.max(...ys) + 10];
      t.querySelector('.cs-brush .overlay')!.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, button: 0, clientX: x0, clientY: y0, view: window}));
      window.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, cancelable: true, buttons: 1, clientX: x1, clientY: y1, view: window}));
      window.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, button: 0, clientX: x1, clientY: y1, view: window}));
    }
    await waitFor(() => rows.a?.length === 2 && rows.b?.length === 2);
    expect(rows.b).toEqual(rows.a);
  } finally { await unmount(ia); await unmount(pb); a.remove(); b.remove(); }
});
`
};

const report = {schema: 'composable-final-checker/production-consumer-equivalence/v1', startedAt, sourceReceipt: {path: args.receipt, sha256: sha256(readFileSync(args.receipt))}, profiles: {}};
let failures = 0;
for (const profile of ['maps', 'graphics', 'charts']) {
  const input = receipt.inputs[profile];
  if (!input?.productionConsumer) continue;
  const original = input.original.dir;
  const production = input.productionConsumer.dir;
  const entry = {consumer: input.productionConsumer.name, delta: input.productionConsumer.delta, steps: []};
  const step = (label, r, ok = r.exit === 0) => { entry.steps.push({label, ok, ...r}); if (!ok) failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${profile} ${label} exit=${r.exit}`); };
  const pkg = JSON.parse(readFileSync(join(production, 'package.json'), 'utf8'));
  for (const script of ['check', 'typecheck:nodenext', 'build', 'ssr']) if (pkg.scripts?.[script]) step(`production consumer npm run ${script}`, run('npm', ['run', script], production));
  // Runtime proof of the ORIGINAL instrumented fixture stays intact (shipped browser test, unchanged).
  const originalClone = `${original}-equivalence`;
  rmSync(originalClone, {recursive: true, force: true});
  run('cp', ['-Rc', original, originalClone], original);
  step('original instrumented fixture: shipped npm run test:browser', run('npm', ['run', 'test:browser'], originalClone));
  cpSync(join(production, 'src/App.svelte'), join(originalClone, 'src/ProductionApp.svelte'));
  // Use the fixture's own SSR server configuration (copied from its shipped ssr.mjs).
  const ownSsr = readFileSync(join(original, 'ssr.mjs'), 'utf8').match(/ssr: \{ noExternal: ([^}]*) \}/);
  if (!ownSsr) throw new Error(`${profile}: shipped ssr.mjs noExternal not found`);
  entry.ssrNoExternal = ownSsr[1].trim();
  writeFileSync(join(originalClone, 'opus-ssr-equivalence.mjs'), SSR(entry.ssrNoExternal));
  const ssr = run('node', ['opus-ssr-equivalence.mjs'], originalClone);
  let ssrEqual = false;
  entry.ssr = null;
  try {
    const out = JSON.parse(spawnSync('node', ['opus-ssr-equivalence.mjs'], {cwd: originalClone, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024}).stdout);
    const bodies = [out.instrumented.plain.body, out.instrumented.brush.body, out.production.plain.body, out.production.brush.body];
    if (bodies.some((body) => typeof body !== 'string' || body.length < 200)) throw new Error('SSR body missing or implausibly small');
    ssrEqual = JSON.stringify(out.instrumented) === JSON.stringify(out.production);
    entry.ssr = {equal: ssrEqual, instrumentedSha256: sha256(JSON.stringify(out.instrumented)), productionSha256: sha256(JSON.stringify(out.production)), bodyBytes: out.instrumented.plain.body.length};
  } catch (error) { ssrEqual = false; entry.ssr = {equal: false, error: String(error)}; }
  step('SSR output identical (default props and brush:true)', {...ssr, stdoutTail: undefined}, ssr.exit === 0 && ssrEqual);
  writeFileSync(join(originalClone, 'src/opus-equivalence.browser.test.ts'), TESTS[profile]);
  writeFileSync(join(originalClone, 'opus-equivalence.config.mjs'), CONFIG);
  entry.browserEquivalenceTest = {sha256: sha256(TESTS[profile])};
  step('browser equivalence (Chromium): instrumented without onApp vs production consumer', run('npx', ['--no', 'vitest', 'run', '--config', 'opus-equivalence.config.mjs'], originalClone));
  report.profiles[profile] = entry;
}
report.finishedAt = new Date().toISOString();
report.verdict = failures === 0 ? 'EQUIVALENCE_CHECKS_PASSED' : 'EQUIVALENCE_FAILURES';
report.failures = failures;
report.note = 'Reviewer-style verification only. Production consumers differ from the shipped fixtures solely by the onApp test-capture hook (App.svelte) and the hook-driven browser test; model and feature modules are unchanged. The original instrumented fixtures remain rejected by the checker and are not claimed as passing.';
const out = join(args.evidence, 'production-consumer-equivalence.json');
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`report ${out} sha256 ${sha256(readFileSync(out))} ${report.verdict}`);
process.exitCode = failures ? 1 : 0;

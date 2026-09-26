// Functional verification of the managed-recipe DEFAULT-ROOT CONSUMERS recorded in a v3 profile receipt: type check,
// production build, server render of every host-mounted component, and the shipped managed.test.ts (real Chromium)
// for single-recipe consumers. Runs on clones; the qualifying consumer directories are not modified.
// usage: node consumer-verify.mjs --receipt <v3 receipt> --evidence <dir>
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && acc.push([a.slice(2), all[i + 1]]), acc), []));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const receipt = JSON.parse(readFileSync(args.receipt, 'utf8'));
mkdirSync(args.evidence, {recursive: true});
const run = (cmd, argv, cwd) => {
  const r = spawnSync(cmd, argv, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: {...process.env, CI: '1'}});
  return {cmd: [cmd, ...argv].join(' '), exit: r.status, stdoutTail: (r.stdout || '').slice(-1500), stderrTail: (r.stderr || '').slice(-1500)};
};
const SSR = (recipes, dirOf) => `import {createServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
const server = await createServer({configFile: false, plugins: [svelte()], server: {middlewareMode: true, hmr: false}, appType: 'custom', logLevel: 'error',
  ssr: {noExternal: ['@composable-svelte/core', ${recipes.map((r) => `'@composable-svelte/${r}'`).join(', ')}]}});
try {
  const {render} = await server.ssrLoadModule('svelte/server');
  const out = {};
${recipes.includes('chat') ? `  { const {default: C} = await server.ssrLoadModule('/${dirOf('chat')}/ManagedChat.svelte');
    out.chat = render(C, {props: {dependencies: {streamMessage: () => new AbortController()}}}).body; }` : ''}
${recipes.includes('code') ? `  { const {default: C} = await server.ssrLoadModule('/src/CodeHost.svelte');
    out.code = render(C).body; }` : ''}
${recipes.includes('media') ? `  { const {default: P} = await server.ssrLoadModule('/${dirOf('media')}/ManagedPlayer.svelte');
    const {default: V} = await server.ssrLoadModule('/${dirOf('media')}/ManagedVoice.svelte');
    const media = await server.ssrLoadModule('@composable-svelte/media');
    out.player = render(P).body;
    out.voice = render(V, {props: {dependencies: {transcribeAudio: async () => '', getAudioManager: media.getVoiceInputAudioManager}}}).body; }` : ''}
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {bytes: v.length, text: v.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 160)}]))));
} finally { await server.close(); }
`;
const report = {schema: 'composable-final-checker/default-root-consumer-verification/v1', startedAt: new Date().toISOString(),
  sourceReceipt: {path: args.receipt, sha256: sha256(readFileSync(args.receipt))}, consumers: {}};
let failures = 0;
for (const [profile, input] of Object.entries(receipt.inputs)) {
  const consumer = input.defaultRootConsumer;
  if (!consumer) continue;
  const recipes = profile === 'chat-code-media' ? ['chat', 'code', 'media'] : [profile];
  const dirOf = (slug) => recipes.length > 1 ? `recipes/${slug}` : 'recipes/managed';
  const clone = `${consumer.dir}-verify`;
  rmSync(clone, {recursive: true, force: true});
  run('cp', ['-Rc', consumer.dir, clone], consumer.dir);
  const entry = {consumer: consumer.name, hostFiles: consumer.hostFiles, steps: []};
  const step = (label, r, ok = r.exit === 0) => { entry.steps.push({label, ok, ...r}); if (!ok) failures += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${profile} ${label} exit=${r.exit}`); };
  step('svelte-check --fail-on-warnings', run('npx', ['--no', 'svelte-check', '--tsconfig', './tsconfig.json', '--fail-on-warnings'], clone));
  step('vite build (index.html -> src/main.ts)', run('npx', ['--no', 'vite', 'build'], clone));
  writeFileSync(join(clone, 'opus-ssr.mjs'), SSR(recipes, dirOf));
  const ssr = run('node', ['opus-ssr.mjs'], clone);
  let rendered = null;
  try { rendered = JSON.parse(ssr.stdoutTail.trim().split('\n').pop()); } catch {}
  entry.ssr = rendered;
  step('SSR render of every host-mounted component', ssr, ssr.exit === 0 && rendered && Object.values(rendered).every((r) => r.bytes > 20));
  if (recipes.length === 1) step('shipped recipes/managed/managed.test.ts (Chromium)', run('npx', ['--no', 'vitest', 'run', '--config', 'recipes/managed/vitest.config.ts'], clone));
  else entry.runtimeProof = 'Combined runtime proof retained: matrix-r6 chat-code-media recipe receipts (both checkpoints) run all three shipped suites on one combined install; App-A is the real combined application.';
  report.consumers[profile] = entry;
}
report.finishedAt = new Date().toISOString();
report.verdict = failures ? 'CONSUMER_VERIFICATION_FAILURES' : 'CONSUMER_VERIFICATION_PASSED';
report.failures = failures;
const out = join(args.evidence, 'default-root-consumer-verification.json');
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`report ${out} sha256 ${sha256(readFileSync(out))} ${report.verdict}`);
process.exitCode = failures ? 1 : 0;

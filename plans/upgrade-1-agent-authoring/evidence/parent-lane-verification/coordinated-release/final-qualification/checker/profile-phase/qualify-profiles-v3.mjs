// One-time reviewer/implementer orchestration for companion profile qualification. NOT the release harness.
// Materializes the exact shipped R4 recipe inputs (harness-shaped, Svelte 5.55.3 newer-companion pin) from local
// candidate tarballs, installs the checker archive in a separate host project, verifies installed bytes against the
// archives, and runs externally pinned qualification plus negative controls. Writes one receipt per invocation.
//
// v3: adds, for the managed recipes (chat/code/media/chat-code-media), a DEFAULT-ROOT CONSUMER: the harness-shaped
// install plus the unchanged shipped recipe(s), mounted from an ordinary src/main.ts that supplies the dependencies the
// shipped package READMEs document. The exact registered policy bytes (root src/main.ts) are qualified on it; the former
// recipe-root runs are kept as ORIGINAL RECIPE PHASE evidence.
// v2: runtime manifest is a parameter (R5 aggregate), native fixtures (maps/graphics/charts) are qualified through a
// named PRODUCTION CONSUMER (the materialized shipped fixture with only the onApp test-capture hook and the
// hook-driven browser test removed), while the ORIGINAL instrumented fixtures and the auth consumer are still run and
// must stay rejected. Profiles with no qualifying input are reported, not qualified.
// usage: node qualify-profiles-v2.mjs --phase <label> --evidence <dir> --checker <tgz> --checker-sha256 <hex>
//          --policies <dir with <profile>.json> --manifest <MANIFEST.json> [--bundled-selectors] [--only a,b]
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
for (const key of ['phase', 'evidence', 'checker', 'checker-sha256', 'policies', 'manifest']) if (!args[key]) throw new Error(`missing --${key}`);

const R4 = args.manifest;
const APP_SVELTE = '5.55.3';
const CORE_VERSION = '0.13.1';
const CHECKER_VERSION = '0.13.1';
const TODAY = '2026-09-26';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const startedAt = new Date().toISOString();

const scratch = realpathSync(mkdtempSync(join(tmpdir(), `opus-profile-${args.phase}-`)));
const evidence = args.evidence;
mkdirSync(evidence, {recursive: true});
const log = [];
function run(cmd, argv, cwd, {allowFail = false} = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, argv, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: {...process.env, npm_config_update_notifier: 'false'}});
  const entry = {cmd: [cmd, ...argv].join(' '), cwd, exit: r.status, ms: Date.now() - started};
  log.push({...entry, stderrTail: (r.stderr || '').slice(-2000)});
  if (r.error) throw r.error;
  if (!allowFail && r.status !== 0) throw new Error(`${entry.cmd} (cwd ${cwd}) exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}

// ---- Frozen candidate archives, identities derived from bytes and cross-checked against the R4 manifest ----
const manifest = JSON.parse(readFileSync(R4, 'utf8'));
const frozenDir = join(scratch, 'frozen');
const unpackedDir = join(scratch, 'unpacked');
mkdirSync(frozenDir);
mkdirSync(unpackedDir);
const pkgs = new Map();
function freeze(name, version, path, expectedSha) {
  const bytes = readFileSync(path);
  const actual = sha256(bytes);
  if (actual !== expectedSha) throw new Error(`${name}: archive sha256 ${actual} !== ${expectedSha}`);
  const frozen = join(frozenDir, path.split('/').pop());
  writeFileSync(frozen, bytes);
  if (sha256(readFileSync(frozen)) !== expectedSha) throw new Error(`${name}: frozen copy changed`);
  const slug = name.split('/').pop();
  const unpacked = join(unpackedDir, slug);
  mkdirSync(unpacked);
  run('tar', ['xzf', frozen, '-C', unpacked], scratch);
  const files = listFiles(join(unpacked, 'package'));
  const identity = {name, version, originalPath: path, frozenPath: frozen, sha256: actual,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, bytes: bytes.length, fileCount: files.length,
    unpacked: join(unpacked, 'package')};
  pkgs.set(slug, identity);
  return identity;
}
function listFiles(dir, base = dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error(`unexpected symlink ${p}`);
    return e.isDirectory() ? listFiles(p, base) : [relative(base, p)];
  }).sort();
}
for (const p of manifest.packages) {
  const id = freeze(p.name, p.version, p.path, p.sha256);
  if (id.integrity !== p.integrity || id.fileCount !== p.fileCount || id.bytes !== p.bytes) throw new Error(`${p.name}: manifest identity mismatch`);
}
const checker = freeze('@composable-svelte/architecture', CHECKER_VERSION, args.checker, args['checker-sha256']);

function verifyInstalled(projectDir, identity) {
  const dir = join(projectDir, 'node_modules', identity.name);
  if (lstatSync(dir).isSymbolicLink()) throw new Error(`${identity.name} installed as symlink`);
  const want = listFiles(identity.unpacked);
  const have = listFiles(dir);
  const mismatched = want.filter((f) => !existsSync(join(dir, f)) || !readFileSync(join(dir, f)).equals(readFileSync(join(identity.unpacked, f))));
  const extra = have.filter((f) => !want.includes(f));
  if (mismatched.length || extra.length) throw new Error(`${identity.name}: installed bytes differ (${mismatched.length} mismatched, ${extra.length} extra)`);
  const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  return {name: identity.name, version, archiveSha256: identity.sha256, files: want.length, mismatched: 0, extra: 0, symlink: false};
}
const installedVersion = (projectDir, name) => JSON.parse(readFileSync(join(projectDir, 'node_modules', name, 'package.json'), 'utf8')).version;

// ---- Checker host: separate project, so recipe materialization stays harness-shaped ----
const checkerHost = join(scratch, 'checker-host');
mkdirSync(checkerHost);
const hostManifest = {name: 'checker-host', private: true, devDependencies: {'@composable-svelte/architecture': `file:${checker.frozenPath}`}};
writeFileSync(join(checkerHost, 'package.json'), JSON.stringify(hostManifest, null, 2));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], checkerHost);
hostManifest.devDependencies['@composable-svelte/architecture'] = CHECKER_VERSION;
writeFileSync(join(checkerHost, 'package.json'), JSON.stringify(hostManifest, null, 2));
const checkerInstall = verifyInstalled(checkerHost, checker);
const parserVersions = {typescript: installedVersion(checkerHost, 'typescript'), svelte: installedVersion(checkerHost, 'svelte')};
if (parserVersions.typescript !== '5.9.3' || parserVersions.svelte !== '5.57.0') throw new Error(`parser deps ${JSON.stringify(parserVersions)}`);
const BIN = join(checkerHost, 'node_modules/.bin/composable-svelte-architecture');
const {isQualificationPass} = await import(pathToFileURL(join(checkerHost, 'node_modules/@composable-svelte/architecture/src/check.mjs')).href);
const records = join(scratch, 'records');
mkdirSync(records);

// ---- Shipped recipe inputs (mirroring verify-release-archives.mjs 01e71e02… materialization) ----
const DEV_MANAGED = {'@sveltejs/vite-plugin-svelte': '6.2.1', '@vitest/browser': '4.0.7', '@vitest/browser-playwright': '4.0.7',
  playwright: '1.56.1', 'svelte-check': '4.3.3', typescript: '5.9.3', vite: '6.4.1', vitest: '4.0.7'};
const PROFILES = {
  auth: {recipe: 'auth-consumer', kind: 'app', companions: ['auth'], source: 'consumer', originalOnly: true},
  maps: {recipe: 'maps-fixture', kind: 'app', companions: ['maps'], source: 'fixtures/installed-consumer', production: 'onApp-only'},
  graphics: {recipe: 'graphics-fixture', kind: 'app', companions: ['graphics'], source: 'fixtures/installed-consumer', production: 'onApp-only'},
  charts: {recipe: 'charts-fixture', kind: 'app', companions: ['charts'], source: 'fixtures/installed-consumer', production: 'onApp-with-props'},
  chat: {recipe: 'chat-managed', kind: 'managed', companions: ['chat'], extraDeps: {'isomorphic-dompurify': '^2.16.0'}, recipes: ['chat']},
  code: {recipe: 'code-managed', kind: 'managed', companions: ['code'], recipes: ['code']},
  media: {recipe: 'media-managed', kind: 'managed', companions: ['media'], recipes: ['media']},
  'chat-code-media': {recipe: 'chat-code-media', kind: 'managed', companions: ['chat', 'code', 'media'],
    extraDeps: {'isomorphic-dompurify': '^2.16.0'}, recipes: ['chat', 'code', 'media']}
};
const RECIPE_ROOTS = {
  chat: ['recipes/managed/ManagedChat.svelte'],
  code: ['recipes/managed/Host.svelte', 'recipes/managed/model.ts'],
  media: ['recipes/managed/ManagedPlayer.svelte', 'recipes/managed/ManagedVoice.svelte']
};
const MANAGED_NAMES = {chat: 'candidate-chat-recipe', code: 'candidate-code-recipe', media: 'candidate-media-recipe', 'chat-code-media': 'candidate-chat-code-media-app'};

function materialize(profile, def) {
  const dir = join(scratch, 'inputs', def.recipe);
  const core = pkgs.get('core');
  const companions = def.companions.map((slug) => pkgs.get(slug));
  let manifestData;
  if (def.kind === 'app') {
    cpSync(join(companions[0].unpacked, def.source), dir, {recursive: true});
    manifestData = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    manifestData.dependencies = manifestData.dependencies || {};
  } else {
    mkdirSync(dir, {recursive: true});
    manifestData = {name: MANAGED_NAMES[profile], private: true, type: 'module', dependencies: {}, devDependencies: {...DEV_MANAGED}};
  }
  manifestData.dependencies['@composable-svelte/core'] = `file:${core.frozenPath}`;
  for (const c of companions) manifestData.dependencies[c.name] = `file:${c.frozenPath}`;
  manifestData.dependencies.svelte = APP_SVELTE;
  Object.assign(manifestData.dependencies, def.extraDeps || {});
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifestData, null, 2));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], dir);
  // Restore exact public registry-shaped SemVer (local tarball transport; no registry retrieval is claimed).
  manifestData.dependencies['@composable-svelte/core'] = core.version;
  for (const c of companions) manifestData.dependencies[c.name] = c.version;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifestData, null, 2));
  const installed = [core, ...companions].map((id) => verifyInstalled(dir, id));
  const svelte = installedVersion(dir, 'svelte');
  if (svelte !== APP_SVELTE) throw new Error(`${def.recipe}: svelte ${svelte}`);
  let materializationConfig = null;
  if (def.kind === 'managed') {
    // The shipped recipes carry no tsconfig; supply the shipped core consumer tsconfig bytes (no paths/baseUrl).
    const bytes = readFileSync(join(core.unpacked, 'consumer/tsconfig.json'));
    writeFileSync(join(dir, 'tsconfig.json'), bytes);
    materializationConfig = {file: 'tsconfig.json', source: '@composable-svelte/core@0.13.1 consumer/tsconfig.json', sha256: sha256(bytes)};
  }
  return {dir, installed, svelte, materializationConfig};
}
function placeRecipe(dir, slug) {
  const dest = join(dir, 'recipes/managed');
  rmSync(dest, {recursive: true, force: true});
  mkdirSync(join(dir, 'recipes'), {recursive: true});
  cpSync(join(pkgs.get(slug).unpacked, 'recipes/managed'), dest, {recursive: true});
  if (slug === 'code') cpSync(join(dest, 'svelte.config.js'), join(dir, 'svelte.config.js'));
  return listFiles(dest).map((f) => ({path: `recipes/managed/${f}`, sha256: sha256(readFileSync(join(dest, f)))}));
}

// ---- Production consumer: remove ONLY the onApp test-capture hook and the browser test that drives it ----
const HOOK_LINE = /^[ \t]*\{@const _ = onApp\?\.\(app\)\}\r?\n/m;
const PROPS_ONLY = /^[ \t]*let \{ onApp \}: \{ onApp\?: \(\(app: ApplicationInstance<State, Action>\) => void\) \| undefined \} = \$props\(\);\r?\n/m;
const PROPS_MIXED = ['let { onApp, onSelectionChange, brush = false }: { onApp?: ((app: ApplicationInstance<State, Action>) => void) | undefined; onSelectionChange?:',
  'let { onSelectionChange, brush = false }: { onSelectionChange?:'];
function productionConsumer(originalDir, kind) {
  const dir = `${originalDir}-production-consumer`;
  run('cp', ['-Rc', originalDir, dir], scratch);
  const appPath = join(dir, 'src/App.svelte');
  const before = readFileSync(appPath, 'utf8');
  let after = before;
  const once = (pattern, replacement) => {
    const count = typeof pattern === 'string' ? after.split(pattern).length - 1 : (after.match(new RegExp(pattern.source, 'gm')) || []).length;
    if (count !== 1) throw new Error(`production consumer edit expected exactly one match, found ${count}: ${pattern}`);
    after = after.replace(pattern, replacement);
  };
  once(HOOK_LINE, '');
  if (kind === 'onApp-only') once(PROPS_ONLY, '');
  else once(PROPS_MIXED[0], PROPS_MIXED[1]);
  if (/onApp/.test(after)) throw new Error('onApp still present in production consumer App.svelte');
  writeFileSync(appPath, after);
  const removedTest = 'src/installed.browser.test.ts';
  if (!/onApp/.test(readFileSync(join(dir, removedTest), 'utf8'))) throw new Error('browser test does not use onApp');
  rmSync(join(dir, removedTest));
  const originalFiles = listFiles(join(originalDir, 'src'));
  const productionFiles = listFiles(join(dir, 'src'));
  const changed = originalFiles.filter((f) => !productionFiles.includes(f) || !readFileSync(join(originalDir, 'src', f)).equals(readFileSync(join(dir, 'src', f))));
  if (JSON.stringify(changed.sort()) !== JSON.stringify(['App.svelte', 'installed.browser.test.ts'])) throw new Error(`unexpected production delta ${changed}`);
  const lines = (text) => text.split('\n');
  const removedLines = lines(before).filter((line) => !lines(after).includes(line));
  const addedLines = lines(after).filter((line) => !lines(before).includes(line));
  return {dir, name: `${basename(originalDir)}-production-consumer`,
    delta: {'src/App.svelte': {before: sha256(before), after: sha256(after), removedLines, addedLines}, [removedTest]: {removed: true, sha256: sha256(readFileSync(join(originalDir, removedTest)))}},
    unchangedSourceFiles: productionFiles.filter((f) => f !== 'App.svelte').map((f) => ({path: `src/${f}`, sha256: sha256(readFileSync(join(dir, 'src', f)))}))};
}

// ---- Default-root consumer for managed recipes: ordinary host wiring only ----
const CHAT_DEPS = `// Documented production transport: @composable-svelte/chat README "Quick Start" (streams POST /api/chat).
const chatDependencies: StreamingChatDependencies = {
  streamMessage: (message, onChunk, onComplete, onError, attachments) => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message, attachments }),
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          throw new Error(\`Chat request failed (\${response.status})\`);
        }
        // This example's endpoint streams plain UTF-8 text, not SSE frames.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            onChunk(decoder.decode(value, { stream: true }));
          }
          const tail = decoder.decode();
          if (tail) onChunk(tail);
        } finally {
          reader.releaseLock();
        }
        onComplete();
      } catch (e) {
        if (!controller.signal.aborted) onError(String(e));
      }
    })();

    return controller; // Returned so \`stopGeneration\` can abort
  }
};
`;
const VOICE_DEPS = `// Documented production dependencies: @composable-svelte/media README "VoiceInput" (POST /api/transcribe).
const voiceDependencies: VoiceInputDependencies = {
  transcribeAudio: async (audio: Blob) => {
    // Your application supplies this endpoint and its authentication.
    const response = await fetch('/api/transcribe', { method: 'POST', body: audio });
    if (!response.ok) throw new Error('Transcription failed');
    return response.text();
  },
  getAudioManager: getVoiceInputAudioManager
};
`;
function hostMain(slugs, dirOf) {
  const lines = [`import { mount } from 'svelte';`];
  if (slugs.includes('chat')) lines.push(`import type { StreamingChatDependencies } from '@composable-svelte/chat';`, `import ManagedChat from '../${dirOf('chat')}/ManagedChat.svelte';`);
  if (slugs.includes('code')) lines.push(`import CodeHost from './CodeHost.svelte';`);
  if (slugs.includes('media')) lines.push(`import { getVoiceInputAudioManager, type VoiceInputDependencies } from '@composable-svelte/media';`, `import ManagedPlayer from '../${dirOf('media')}/ManagedPlayer.svelte';`, `import ManagedVoice from '../${dirOf('media')}/ManagedVoice.svelte';`);
  lines.push('');
  if (slugs.includes('chat')) lines.push(CHAT_DEPS);
  if (slugs.includes('media')) lines.push(VOICE_DEPS);
  const target = (id) => `document.getElementById('${id}')!`;
  if (slugs.includes('chat')) lines.push(`mount(ManagedChat, { target: ${target('chat')}, props: { dependencies: chatDependencies } });`);
  if (slugs.includes('code')) lines.push(`mount(CodeHost, { target: ${target('code')} });`);
  if (slugs.includes('media')) lines.push(`mount(ManagedPlayer, { target: ${target('player')} });`, `mount(ManagedVoice, { target: ${target('voice')}, props: { dependencies: voiceDependencies } });`);
  return lines.join('\n') + '\n';
}
const CONSUMER_TSCONFIG = JSON.stringify({compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  strict: true, skipLibCheck: true, noEmit: true, verbatimModuleSyntax: true, isolatedModules: true, types: ['svelte']}, include: ['src/**/*']}, null, 2) + '\n';
function defaultRootConsumer(profile, def, installDir) {
  const dir = `${installDir}-default-root-consumer`;
  run('cp', ['-Rc', installDir, dir], scratch);
  rmSync(join(dir, 'recipes'), {recursive: true, force: true});
  const combined = def.recipes.length > 1;
  const dirOf = (slug) => combined ? `recipes/${slug}` : 'recipes/managed';
  const shipped = [];
  for (const slug of def.recipes) {
    const dest = join(dir, dirOf(slug));
    mkdirSync(join(dir, 'recipes'), {recursive: true});
    cpSync(join(pkgs.get(slug).unpacked, 'recipes/managed'), dest, {recursive: true});
    if (slug === 'code') cpSync(join(dest, 'svelte.config.js'), join(dir, 'svelte.config.js'));
    for (const f of listFiles(dest)) {
      if (!readFileSync(join(dest, f)).equals(readFileSync(join(pkgs.get(slug).unpacked, 'recipes/managed', f)))) throw new Error('recipe copy differs');
      shipped.push({path: `${dirOf(slug)}/${f}`, sha256: sha256(readFileSync(join(dest, f)))});
    }
  }
  mkdirSync(join(dir, 'src'), {recursive: true});
  const main = hostMain(def.recipes, dirOf);
  const ids = [...(def.recipes.includes('chat') ? ['chat'] : []), ...(def.recipes.includes('code') ? ['code'] : []), ...(def.recipes.includes('media') ? ['player', 'voice'] : [])];
  const html = `<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><title>${profile} consumer</title></head>\n  <body>\n${ids.map((id) => `    <div id="${id}"></div>`).join('\n')}\n    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n`;
  const vite = `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\n\nexport default defineConfig({ plugins: [svelte()] });\n`;
  const written = {'src/main.ts': main, 'index.html': html, 'vite.config.ts': vite, 'tsconfig.json': CONSUMER_TSCONFIG};
  // The code recipe's Host takes its store as a component prop; an ordinary Svelte root creates it with the shipped
  // createRoot() (store authority is not handed to the imperative svelte mount entry point).
  if (def.recipes.includes('code')) written['src/CodeHost.svelte'] = `<script lang="ts">\n  import Host from '../${dirOf('code')}/Host.svelte';\n  import { createRoot } from '../${dirOf('code')}/model';\n\n  const store = createRoot();\n</script>\n\n<Host {store} />\n`;
  for (const [f, text] of Object.entries(written)) writeFileSync(join(dir, f), text);
  return {dir, name: `${basename(installDir)}-default-root-consumer`, shippedRecipeFiles: shipped,
    hostFiles: Object.fromEntries(Object.entries(written).map(([f, t]) => [f, sha256(t)])),
    note: 'Host wiring only: src/main.ts mounts the unchanged shipped recipe component(s) with the dependencies documented in the shipped package READMEs (the code recipe through a two-line Svelte root, src/CodeHost.svelte, that creates the store with the shipped createRoot()); index.html/vite/tsconfig are ordinary build configuration.'};
}

// ---- Policies ----
const policyDir = join(scratch, 'policies');
mkdirSync(policyDir);
function writePolicy(name, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  const path = join(policyDir, `${name}.json`);
  writeFileSync(path, text);
  return {path, sha256: sha256(text)};
}
function copyPolicy(name, source) {
  const bytes = readFileSync(source);
  const path = join(policyDir, `${name}.json`);
  writeFileSync(path, bytes);
  return {path, sha256: sha256(bytes)};
}

function check(project, policyArgs, expectedCore = CORE_VERSION) {
  const r = run(BIN, ['--project', project, ...policyArgs, '--expected-core-version', expectedCore, '--records-root', records, '--today', TODAY], project, {allowFail: true});
  let result = null;
  try { result = JSON.parse(r.stdout); } catch {}
  return {exit: r.status, result, stderr: (r.stderr || '').trim().split('\n').slice(-2).join(' | ')};
}
function summarize(outcome, envelope) {
  const res = outcome.result;
  return {
    exit: outcome.exit,
    isQualificationPass: res && envelope ? isQualificationPass(res, envelope) : false,
    qualification: res?.qualification ?? null,
    outcome: res?.outcome ?? null,
    policy: res ? {id: res.policy.id, version: res.policy.version, source: res.policy.source, sha256: res.policy.sha256, bundledProfile: res.policy.bundledProfile,
      capabilityGrantCount: res.policy.capabilityGrantCount, exceptionCount: res.policy.exceptionCount} : null,
    checker: res?.checker ?? null,
    core: res?.core ? {installed: res.core.installed, expected: res.core.expected, paired: res.core.paired} : null,
    enforced: res?.rules?.enforcedCount ?? null,
    active: res?.rules?.active?.map((r) => r.id) ?? null,
    inactive: res?.rules?.inactive?.map((r) => ({id: r.id, reason: r.reason})) ?? null,
    unavailable: res?.rules?.unavailableEvaluators ?? null,
    manualReviewRequired: res?.manualReviewRequired ?? null,
    qualificationScope: res?.qualificationScope ?? null,
    limits: res?.limits?.length ?? null,
    graph: res?.graph ? {complete: res.graph.complete, moduleCount: res.graph.moduleCount ?? res.graph.modules?.length, roots: res.graph.roots,
      modules: res.graph.modules?.map((m) => m.path), packageSpecifiers: res.graph.packageSpecifiers} : null,
    violations: res?.violations?.length ?? null,
    excepted: res?.excepted?.length ?? null,
    errorCodes: res ? [...new Set(res.analysisErrors.map((e) => e.code))] : [],
    errorSample: res?.analysisErrors?.[0]?.message ?? null,
    stderr: res ? undefined : outcome.stderr
  };
}
const results = [];
let failures = 0;
function expect(profile, input, label, outcome, envelope, want) {
  const s = summarize(outcome, envelope);
  const reasons = [];
  if (s.exit !== want.exit) reasons.push(`exit ${s.exit} !== ${want.exit}`);
  if (want.pass !== undefined && s.isQualificationPass !== want.pass) reasons.push(`isQualificationPass ${s.isQualificationPass} !== ${want.pass}`);
  for (const code of want.codes || []) if (!s.errorCodes.includes(code)) reasons.push(`missing error code ${code}`);
  if (want.reaches) {
    const specs = s.graph?.packageSpecifiers || [];
    for (const name of want.reaches) if (!specs.some((spec) => spec === name || spec.startsWith(`${name}/`))) reasons.push(`graph does not reach ${name}`);
  }
  if (want.pass) {
    if (s.enforced !== 5 || s.unavailable?.length !== 0 || s.inactive?.length !== 2 || s.limits !== 15 || s.manualReviewRequired !== true
      || s.qualificationScope !== 'bounded-five-family-detectors' || s.policy?.capabilityGrantCount !== 0 || s.policy?.exceptionCount !== 0
      || s.policy?.bundledProfile !== null || s.violations !== 0 || s.excepted !== 0) reasons.push('envelope boundary drift');
  }
  const ok = reasons.length === 0;
  if (!ok) failures += 1;
  results.push({profile, input, label, ok, reasons, expected: want, ...s});
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${profile} ${input} ${label} exit=${s.exit} pass=${s.isQualificationPass} ${s.errorCodes.join(',')}${reasons.length ? ' :: ' + reasons.join('; ') : ''}`);
}

const selected = args.only ? String(args.only).split(',') : Object.keys(PROFILES);
const inputs = {};
for (const profile of selected) {
  const def = PROFILES[profile];
  const registeredPath = join(args.policies, `${profile}.json`);
  const registered = existsSync(registeredPath);
  const bundledPath = registered ? registeredPath : join('/private/tmp/composable-final-checker/profile-phase/P1-policies/bundled', `${profile}.json`);
  const bundledBytes = readFileSync(bundledPath);
  const bundled = JSON.parse(bundledBytes);
  const bundledSha = sha256(bundledBytes);
  const mat = materialize(profile, def);
  const companionNames = def.companions.map((slug) => `@composable-svelte/${slug}`);
  inputs[profile] = {recipe: def.recipe, kind: def.kind, projectDir: mat.dir, installed: mat.installed, svelte: mat.svelte,
    materializationConfig: mat.materializationConfig, bundledPolicy: {path: bundledPath, sha256: bundledSha, registeredInPoliciesDir: registered}, runs: []};
  let qualifyingDir = mat.dir;
  if (def.kind === 'app' && (def.production || def.originalOnly)) {
    // The original shipped input keeps its instrumentation; it must stay rejected and is never claimed as passing.
    const original = copyPolicy(`original-${profile}-exact-bundled`, bundledPath);
    const outcome = check(mat.dir, ['--mode', 'qualification', '--policy', original.path, '--policy-sha256', original.sha256]);
    expect(profile, `${def.recipe} (ORIGINAL shipped, instrumented)`, 'ORIGINAL stays REJECTED (truthful limitation)', outcome,
      {policySha256: original.sha256, expectedCoreVersion: CORE_VERSION, expectedCheckerVersion: CHECKER_VERSION}, {exit: 21, pass: false, codes: ['unsupported-construct']});
    const row = results.at(-1);
    row.originalErrors = (outcome.result?.analysisErrors ?? []).map((e) => ({code: e.code, construct: e.construct ?? null, path: e.path, line: e.span?.start?.line ?? null, message: e.message}));
    if (row.errorCodes.some((code) => code !== 'unsupported-construct')) { row.ok = false; failures += 1; row.reasons.push('original rejected for a non-construct reason'); }
    inputs[profile].original = {name: `${def.recipe} (original shipped, instrumented)`, dir: mat.dir, errors: row.originalErrors};
    if (def.originalOnly) { inputs[profile].qualifyingInput = null; inputs[profile].postRunVerification = [pkgs.get('core'), ...def.companions.map((s) => pkgs.get(s))].map((id) => verifyInstalled(mat.dir, id)); continue; }
    const pc = productionConsumer(mat.dir, def.production);
    qualifyingDir = pc.dir;
    inputs[profile].productionConsumer = pc;
  }
  // Managed profiles: shipped recipe roots first (ORIGINAL RECIPE PHASE), then the default-root consumer (slug null).
  const recipeSlugs = def.kind === 'app' ? [null] : [...def.recipes, null];
  for (const slug of recipeSlugs) {
    if (slug === null && def.kind === 'managed') {
      const consumer = defaultRootConsumer(profile, def, mat.dir);
      qualifyingDir = consumer.dir;
      inputs[profile].defaultRootConsumer = consumer;
    }
    const input = slug ? `${def.recipe}:${slug} (ORIGINAL RECIPE PHASE, recipe roots)` : (qualifyingDir === mat.dir ? def.recipe : basename(qualifyingDir));
    const shipped = slug ? placeRecipe(mat.dir, slug) : null;
    const project = slug ? {tsconfig: 'tsconfig.json', roots: RECIPE_ROOTS[slug]} : bundled.project;
    const tag = slug ? `${profile}-${slug}` : profile;
    const candidate = writePolicy(`candidate-${tag}`, {...structuredClone(bundled), policyId: `candidate-${tag}`, project});
    const env = (sha) => ({policySha256: sha, expectedCoreVersion: CORE_VERSION, expectedCheckerVersion: CHECKER_VERSION});
    const q = (pol, core) => check(qualifyingDir, ['--mode', 'qualification', '--policy', pol.path, '--policy-sha256', pol.sha256], core);
    const reaches = slug ? [`@composable-svelte/${slug}`, '@composable-svelte/core'] : [...companionNames, '@composable-svelte/core', 'svelte'];
    inputs[profile].runs.push({input, shippedRecipeFiles: shipped, candidatePolicy: {path: candidate.path, sha256: candidate.sha256, project}});

    const positive = q(candidate);
    expect(profile, input, 'POSITIVE candidate (bundled bytes; policyId' + (slug ? '+recipe roots' : '') + ' differ)', positive, env(candidate.sha256), {exit: 0, pass: true, reaches});
    const reachesSvelte = (positive.result?.graph?.packageSpecifiers || []).some((s) => s === 'svelte' || s.startsWith('svelte/'));
    if (!slug) {
      const exact = copyPolicy(`exact-bundled-${profile}`, bundledPath);
      expect(profile, input, 'POSITIVE exact proposed bundled bytes supplied externally', q(exact), env(exact.sha256), {exit: 0, pass: true, reaches});
      if (args['bundled-selectors']) {
        const fb = check(qualifyingDir, ['--mode', 'analysis-only', '--policy', `bundled:${profile}`]);
        expect(profile, input, `DEVFEEDBACK bundled:${profile} analysis-only`, fb, null, {exit: 0, reaches});
        const s = results.at(-1);
        if (s.policy?.bundledProfile !== profile || s.policy?.sha256 !== bundledSha || s.qualification !== 'not-evaluated') { s.ok = false; failures += 1; s.reasons.push('bundled selector identity'); }
        expect(profile, input, `NEG bundled:${profile} qualification refused`, check(qualifyingDir, ['--mode', 'qualification', '--policy', `bundled:${profile}`]), null, {exit: 22});
      }
    }
    if (def.supplementaryRoots && !slug) {
      const all = writePolicy(`supplementary-${tag}-all-entries`, {...structuredClone(bundled), policyId: `supplementary-${tag}-all-entries`, project: {...bundled.project, roots: def.supplementaryRoots}});
      expect(profile, input, 'SUPPLEMENTARY all shipped entries', q(all), env(all.sha256), {exit: 0, pass: true, reaches});
    }
    // Envelope controls on the passing run.
    expect(profile, input, 'NEG envelope expects checker 0.13.0', positive, {...env(candidate.sha256), expectedCheckerVersion: '0.13.0'}, {exit: 0, pass: false});
    expect(profile, input, 'NEG envelope expects another policy pin', positive, env(bundledSha === candidate.sha256 ? 'c'.repeat(64) : bundledSha), {exit: 0, pass: false});
    // Invocation controls.
    expect(profile, input, 'NEG wrong --policy-sha256', q({...candidate, sha256: 'b'.repeat(64)}), env(candidate.sha256), {exit: 21, pass: false, codes: ['policy-pin-mismatch']});
    expect(profile, input, 'NEG wrong expected core 0.13.0', q(candidate, '0.13.0'), env(candidate.sha256), {exit: 21, pass: false, codes: ['core-version-mismatch']});
    const base = JSON.parse(readFileSync(candidate.path, 'utf8'));
    for (const name of (slug ? [`@composable-svelte/${slug}`] : companionNames)) {
      const bumped = structuredClone(base);
      const entry = bumped.opaquePackages.find((p) => p.name === name);
      entry.version = entry.version.replace(/\.(\d+)$/, (m, n) => `.${Number(n) + 1}`);
      const pol = writePolicy(`neg-${tag}-wrong-${name.split('/')[1]}-pin`, bumped);
      expect(profile, input, `NEG wrong companion pin ${name}@${entry.version}`, q(pol), env(pol.sha256), {exit: 21, pass: false, codes: ['unresolved-package-import']});
      const dropped = structuredClone(base);
      dropped.opaquePackages = dropped.opaquePackages.filter((p) => p.name !== name);
      const pol2 = writePolicy(`neg-${tag}-missing-${name.split('/')[1]}`, dropped);
      expect(profile, input, `NEG companion approval absent ${name}`, q(pol2), env(pol2.sha256), {exit: 21, pass: false, codes: ['unresolved-package-import']});
    }
    const coreBump = structuredClone(base);
    coreBump.opaquePackages.find((p) => p.name === '@composable-svelte/core').version = '0.13.2';
    const polCore = writePolicy(`neg-${tag}-wrong-core-pin`, coreBump);
    expect(profile, input, 'NEG wrong core opaque pin 0.13.2', q(polCore), env(polCore.sha256), {exit: 21, pass: false, codes: ['unresolved-package-import']});
    const svelteWrong = structuredClone(base);
    svelteWrong.opaquePackages.find((p) => p.name === 'svelte').version = '5.57.0';
    const polSvelte = writePolicy(`neg-${tag}-wrong-svelte-pin`, svelteWrong);
    expect(profile, input, `NEG wrong svelte pin 5.57.0 (${reachesSvelte ? 'svelte reached' : 'svelte not reached: approval unexercised'})`, q(polSvelte), env(polSvelte.sha256),
      reachesSvelte ? {exit: 21, pass: false, codes: ['unresolved-package-import']} : {exit: 0, pass: true});
    const missingRoot = structuredClone(base);
    missingRoot.project.roots = [...missingRoot.project.roots, 'src/opus-missing-root.ts'];
    const polRoot = writePolicy(`neg-${tag}-incomplete-missing-root`, missingRoot);
    expect(profile, input, 'NEG incomplete analysis (missing root)', q(polRoot), env(polRoot.sha256), {exit: 21, pass: false, codes: ['missing-root']});
    const starterShape = structuredClone(base);
    starterShape.opaquePackages = [{name: '@composable-svelte/core', version: CORE_VERSION, provenance: 'registry'}, {name: 'svelte', version: '5.57.0', provenance: 'registry'}];
    const polStarter = writePolicy(`neg-${tag}-starter-approvals-only`, starterShape);
    expect(profile, input, 'NEG starter approvals only (companion unapproved)', q(polStarter), env(polStarter.sha256), {exit: 21, pass: false, codes: ['unresolved-package-import']});
  }
  // Post-run: installed candidate bytes unchanged.
  inputs[profile].qualifyingInput = qualifyingDir === mat.dir ? `${def.recipe} (shipped, unmodified)` : basename(qualifyingDir);
  inputs[profile].postRunVerification = [pkgs.get('core'), ...def.companions.map((s) => pkgs.get(s))].map((id) => verifyInstalled(qualifyingDir, id));
}
const checkerPostRun = verifyInstalled(checkerHost, checker);

const receipt = {
  schema: 'composable-final-checker/profile-qualification-exercise/v3',
  phase: args.phase,
  startedAt,
  finishedAt: new Date().toISOString(),
  verdict: failures === 0 ? 'ALL_EXPECTATIONS_MET' : 'EXPECTATION_FAILURES',
  failures,
  manifest: {path: R4, sha256: sha256(readFileSync(R4))},
  scope: 'Narrow checker-profile phase: external pinned architecture qualification and negative controls on materialized shipped R4 recipe inputs. Not a release qualification; runtime recipe commands are covered by the unchanged matrix-r4 receipts and are not rerun here.',
  opacityStatement: 'A pass proves bounded five-family detector conformance over the reachable local graph, with core, the named companion(s) and svelte treated as opaque leaves identified by exact name, version and registry-shaped declaration. It does not inspect or prove companion package internal correctness. Installed package contents were verified separately, byte-for-byte, against the frozen R4 archives by this orchestrator.',
  transport: {type: 'local-candidate-tarball', registryProvenanceClaimed: false,
    statement: 'Candidate packages were installed from local frozen tarballs (sha256 verified), then package.json specs were restored to exact registry-shaped versions. Nothing was retrieved from, or claimed to come from, the npm registry for these candidates.'},
  harnessReference: {path: '/private/tmp/composable-final-qualification/repo/scripts/verify-release-archives.mjs', sha256: sha256(readFileSync('/private/tmp/composable-final-qualification/repo/scripts/verify-release-archives.mjs')), usage: 'read-only reference for materialization shape; not executed by this script'},
  runtimeReceipts: ['matrix-r6/minimum', 'matrix-r6/newer'].map((cp) => {
    const path = `/private/tmp/companion-runtime-release/${cp}/qualification-receipt.json`;
    const r = JSON.parse(readFileSync(path, 'utf8'));
    return {checkpoint: cp, path, sha256: sha256(readFileSync(path)), verdict: r.verdict, recipes: r.recipes.map((x) => ({name: x.name, status: x.status, svelte: x.svelteInstalledVersion}))};
  }),
  archives: [...pkgs.values()].map(({unpacked, frozenPath, ...id}) => id),
  checkerHost: {install: checkerInstall, postRun: checkerPostRun, parserVersions},
  appSveltePin: APP_SVELTE,
  scratch,
  inputs,
  results,
  commandLog: log.map(({stderrTail, ...rest}) => rest)
};
const out = join(evidence, 'profile-qualification-receipt.json');
writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(`receipt ${out} sha256 ${sha256(readFileSync(out))} verdict ${receipt.verdict} results ${results.length} failures ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;

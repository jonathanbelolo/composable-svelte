// Opus final app gate (FINAL-APP-CHECKER-GATES.txt). Uses the independently cleared checker archive and the externally
// controlled policies. App-A: authorized dependency metadata/lock/install refresh to final R6 Core / R5 Chat and the
// checker (application source untouched), affected functional proof, checker gates. App-B: original untouched (frozen
// 25-file snapshot includes package.json/lock); checker gates on an honest isolated clone.
// Checker runs need registry-shaped dependency specs for `registry` provenance approvals. They run on labeled clones whose
// package.json specs alone are rewritten to the exact versions; installed bytes are the original app's bytes (verified).
// Transport is local candidate tarballs; no registry retrieval is claimed.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const OUT = '/private/tmp/composable-final-checker/opus-final-review/app-gate';
const AUTH = '/private/tmp/composable-final-authoring';
const APP_A = join(AUTH, 'app-a');
const APP_B = join(AUTH, 'app-b');
const CHECKER = process.env.CHECKER_TGZ;
const CHECKER_SHA = process.env.CHECKER_SHA;
if (!CHECKER || !/^[0-9a-f]{64}$/.test(CHECKER_SHA ?? '')) throw new Error('CHECKER_TGZ and CHECKER_SHA are required');
const CCM = {path: '/private/tmp/composable-final-checker/packages/architecture/policies/chat-code-media.json', sha256: 'f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327'};
const APPB_POLICY = {path: '/private/tmp/composable-final-checker/profile-phase/P1-policies/external-appb/app-b-auth-charts.json', sha256: 'bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de'};
const AUTH_ONLY = {path: '/private/tmp/composable-final-checker/packages/architecture/policies/auth.json', sha256: 'ab100ba510f5cdc4931bca33e0dc398d21f1382010b51ed44242d30dc6846662'};
const STARTER = {path: '/private/tmp/composable-final-checker/packages/architecture/policies/starter.json', sha256: 'f2821ebf0fa5cd34b346361089edd56bb4ec01a40c59eb969c60f90c7e77d190'};
const MANIFEST = '/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json';
const TODAY = '2026-09-26';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sri = (b) => `sha512-${createHash('sha512').update(b).digest('base64')}`;
const phase = process.argv[2] ?? 'all';
const log = [];
function run(cmd, argv, cwd, {allowFail = false, env} = {}) {
  const t = Date.now();
  const r = spawnSync(cmd, argv, {cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: {...process.env, npm_config_update_notifier: 'false', ...env}});
  log.push({cmd: [cmd, ...argv].join(' '), cwd, exit: r.status, ms: Date.now() - t});
  if (r.error) throw r.error;
  if (!allowFail && r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} (${cwd}) exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}
const listFiles = (dir, base = dir, skip = new Set()) => readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
  const p = join(dir, e.name);
  if (skip.has(relative(base, p))) return [];
  return e.isDirectory() ? listFiles(p, base, skip) : [relative(base, p)];
}).sort();
const hashTree = (dir, skip) => Object.fromEntries(listFiles(dir, dir, new Set(skip)).map((f) => [f, sha256(readFileSync(join(dir, f)))]));
const APP_SKIP = ['node_modules', 'dist', 'test-results', 'ssr', 'playwright-report'];

// ---- archives: identities from bytes, cross-checked with the R6 manifest -----------------------------------------
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'opus-app-gate-')));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const archives = new Map();
for (const p of [...manifest.packages, {name: '@composable-svelte/architecture', version: '0.13.1', path: CHECKER, sha256: CHECKER_SHA}]) {
  const bytes = readFileSync(p.path);
  if (sha256(bytes) !== p.sha256) throw new Error(`${p.name}: archive bytes ${sha256(bytes)} !== ${p.sha256}`);
  const dir = join(scratch, 'unpacked', p.name.split('/')[1]);
  mkdirSync(dir, {recursive: true});
  run('tar', ['xzf', p.path, '-C', dir], scratch);
  archives.set(p.name, {name: p.name, version: p.version, path: p.path, sha256: p.sha256, integrity: sri(bytes), unpacked: join(dir, 'package')});
}
function verifyInstalled(projectDir, name) {
  const id = archives.get(name);
  const dir = join(projectDir, 'node_modules', name);
  const symlink = lstatSync(dir).isSymbolicLink();
  const want = listFiles(id.unpacked);
  const have = listFiles(dir, dir, new Set(['node_modules']));
  const mismatched = want.filter((f) => !existsSync(join(dir, f)) || !readFileSync(join(dir, f)).equals(readFileSync(join(id.unpacked, f))));
  const extra = have.filter((f) => !want.includes(f));
  return {name, version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, archiveSha256: id.sha256, archivePath: id.path,
    files: want.length, mismatched: mismatched.length, extra: extra.length, symlink, ok: !symlink && mismatched.length === 0 && extra.length === 0};
}
for (const p of [CCM, APPB_POLICY, AUTH_ONLY, STARTER]) if (sha256(readFileSync(p.path)) !== p.sha256) throw new Error(`policy ${p.path} changed`);

// ---- controlled policy copies and variants -------------------------------------------------------------------------
const polDir = join(OUT, `policies-${CHECKER_SHA.slice(0, 8)}`);
mkdirSync(polDir, {recursive: true});
const put = (name, data) => {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data, null, 2) + '\n');
  writeFileSync(join(polDir, name), bytes);
  return {path: join(polDir, name), sha256: sha256(bytes)};
};
const ccm = put('exact-bundled-chat-code-media.json', readFileSync(CCM.path));
const appb = put('external-app-b-auth-charts.json', readFileSync(APPB_POLICY.path));
const authOnly = put('exact-bundled-auth.json', readFileSync(AUTH_ONLY.path));
const starter = put('exact-bundled-starter.json', readFileSync(STARTER.path));
const variant = (base, name, fn) => { const d = JSON.parse(readFileSync(base.path, 'utf8')); fn(d); d.policyId = `neg-${name}`; return put(`neg-${name}.json`, d); };
const pin = (d, suffix, version) => { d.opaquePackages = d.opaquePackages.map((p) => p.name.endsWith(suffix) ? {...p, version} : p); };

// ---- checker invocation ---------------------------------------------------------------------------------------------
const results = [];
let failures = 0;
function check(app, label, bin, project, args, want, env) {
  const r = run(bin, [...args, '--project', project, '--today', TODAY], project, {allowFail: true});
  let res = null; try { res = JSON.parse(r.stdout); } catch {}
  const pass = res && env ? env.isQualificationPass(res, env.envelope) : false;
  const ok = r.status === want.exit && pass === want.pass && (!want.codes || want.codes.every((c) => res?.analysisErrors?.some((e) => e.code === c)));
  if (!ok) failures += 1;
  const row = {app, label, ok, expected: want, exit: r.status, isQualificationPass: pass, envelope: env?.envelope,
    policy: res?.policy && {id: res.policy.id, source: res.policy.source, sha256: res.policy.sha256, bundledProfile: res.policy.bundledProfile},
    checker: res?.checker?.version, core: res?.core, qualification: res?.qualification, outcome: res?.outcome,
    enforced: res?.rules?.enforcedCount, inactive: res?.rules?.inactive?.map((i) => i.id), manualReviewRequired: res?.manualReviewRequired,
    limitations: res?.limits?.length, violations: res?.violations?.length, moduleCount: res?.graph?.moduleCount,
    analysisErrors: res?.analysisErrors?.map((e) => ({code: e.code, construct: e.construct, path: e.path, line: e.span?.start?.line ?? null, message: e.message.slice(0, 200)})),
    stderrTail: res ? undefined : r.stderr.trim().split('\n').slice(-2).join(' | ')};
  results.push(row);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${app} ${label} exit=${r.status} pass=${pass} ${(row.analysisErrors ?? []).map((e) => e.code).join(',')}`);
}
const qArgs = (pol, {pinOverride, core = '0.13.1'} = {}) => ['--mode', 'qualification', '--policy', pol.path, '--policy-sha256', pinOverride ?? pol.sha256, '--expected-core-version', core];
const envOf = (isQualificationPass, pol, checker = '0.13.1') => ({isQualificationPass, envelope: {policySha256: pol.sha256, expectedCoreVersion: '0.13.1', expectedCheckerVersion: checker}});

// Registry-shaped clone: the app's own bytes (including installed node_modules), package.json specs rewritten to versions.
function registryShapedClone(src, label, names) {
  const dir = join(scratch, label);
  run('cp', ['-Rc', src, dir], scratch);
  const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const rewritten = {};
  for (const n of names) for (const field of ['dependencies', 'devDependencies']) if (m[field]?.[n]) { rewritten[n] = {from: m[field][n], to: archives.get(n).version}; m[field][n] = archives.get(n).version; }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(m, null, 2) + '\n');
  const srcTree = hashTree(src, [...APP_SKIP, 'package.json']);
  const cloneTree = hashTree(dir, [...APP_SKIP, 'package.json']);
  if (JSON.stringify(srcTree) !== JSON.stringify(cloneTree)) throw new Error(`${label}: clone differs from source`);
  return {dir, rewritten, filesEqualExceptPackageJson: Object.keys(srcTree).length, installed: names.map((n) => verifyInstalled(dir, n))};
}

const receipt = {schema: 'opus-final-review/final-app-gate/v1', startedAt: new Date().toISOString(), scratch,
  transport: 'local candidate tarballs (file: specs) installed and byte-verified; registry-shaped version specs are materialized only in labeled clones for checker provenance; no registry retrieval claimed',
  checker: {path: CHECKER, sha256: CHECKER_SHA, integrity: archives.get('@composable-svelte/architecture').integrity},
  runtimeManifest: {path: MANIFEST, sha256: sha256(readFileSync(MANIFEST))},
  policies: {chatCodeMedia: ccm, externalAppBAuthCharts: appb, bundledAuthBytes: authOnly, bundledStarterBytes: starter}, apps: {}};

// ================================================= App-A =============================================================
if (phase === 'all' || phase === 'a') {
  const a = receipt.apps['app-a'] = {path: APP_A};
  const before = hashTree(APP_A, APP_SKIP);
  a.before = {packageJson: before['package.json'], packageLock: before['package-lock.json'], files: Object.keys(before).length};
  const manifestBackup = join(OUT, `app-a-manifest-before-${CHECKER_SHA.slice(0, 8)}`);
  mkdirSync(manifestBackup, {recursive: true});
  for (const f of ['package.json', 'package-lock.json']) cpSync(join(APP_A, f), join(manifestBackup, f));
  // Authorized refresh: Core -> R6, Chat -> R5 (final), code/media unchanged bytes, checker devDependency.
  const m = JSON.parse(readFileSync(join(APP_A, 'package.json'), 'utf8'));
  const specOf = (n) => `file:${archives.get(n).path}`;
  a.refresh = {};
  for (const n of ['@composable-svelte/core', '@composable-svelte/chat', '@composable-svelte/code', '@composable-svelte/media']) {
    a.refresh[n] = {from: m.dependencies[n], to: specOf(n)}; m.dependencies[n] = specOf(n);
  }
  a.refresh['@composable-svelte/architecture'] = {from: m.devDependencies['@composable-svelte/architecture'] ?? null, to: `file:${CHECKER}`};
  m.devDependencies['@composable-svelte/architecture'] = `file:${CHECKER}`;
  writeFileSync(join(APP_A, 'package.json'), JSON.stringify(m, null, 2) + '\n');
  const install = run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], APP_A, {allowFail: true});
  writeFileSync(join(OUT, `app-a-npm-install-${CHECKER_SHA.slice(0, 8)}.log`), install.stdout + install.stderr);
  a.install = {exit: install.status};
  if (install.status !== 0) throw new Error('App-A install failed');
  const names = ['@composable-svelte/core', '@composable-svelte/chat', '@composable-svelte/code', '@composable-svelte/media', '@composable-svelte/architecture'];
  a.installed = names.map((n) => verifyInstalled(APP_A, n));
  const ver = (p) => JSON.parse(readFileSync(join(APP_A, 'node_modules', p, 'package.json'), 'utf8')).version;
  a.toolchain = {svelte: ver('svelte'), typescript: ver('typescript'), vite: ver('vite'), vitest: ver('vitest'), 'svelte-check': ver('svelte-check'), '@playwright/test': ver('@playwright/test')};
  const nested = join(APP_A, 'node_modules/@composable-svelte/architecture/node_modules');
  a.checkerParserDeps = {typescript: existsSync(join(nested, 'typescript')) ? JSON.parse(readFileSync(join(nested, 'typescript/package.json'))).version : ver('typescript'),
    svelte: existsSync(join(nested, 'svelte')) ? JSON.parse(readFileSync(join(nested, 'svelte/package.json'))).version : ver('svelte')};
  const after = hashTree(APP_A, APP_SKIP);
  a.sourceUnchanged = Object.keys(before).filter((f) => !['package.json', 'package-lock.json'].includes(f)).every((f) => before[f] === after[f])
    && Object.keys(after).length === Object.keys(before).length;
  a.after = {packageJson: after['package.json'], packageLock: after['package-lock.json']};
  if (!a.sourceUnchanged || a.installed.some((i) => !i.ok) || a.toolchain.svelte !== '5.55.3' || a.checkerParserDeps.typescript !== '5.9.3' || a.checkerParserDeps.svelte !== '5.57.0') {
    throw new Error(`App-A refresh verification failed ${JSON.stringify({src: a.sourceUnchanged, inst: a.installed, tool: a.toolchain, parser: a.checkerParserDeps})}`);
  }
  // Affected functional proof on exact final installed bytes.
  a.functional = [];
  for (const s of ['check', 'test', 'test:ssr', 'build', 'test:browser']) {
    const r = run('npm', ['run', s], APP_A, {allowFail: true});
    writeFileSync(join(OUT, `app-a-${s}-${CHECKER_SHA.slice(0, 8)}.stdout.log`), r.stdout); writeFileSync(join(OUT, `app-a-${s}-${CHECKER_SHA.slice(0, 8)}.stderr.log`), r.stderr);
    a.functional.push({script: s, exit: r.status});
    console.log(`app-a ${s} exit=${r.status}`);
  }
  // Checker gates.
  const clone = registryShapedClone(APP_A, 'app-a-registry-shaped', names);
  a.registryShapedClone = {dir: clone.dir, rewritten: clone.rewritten, filesEqualExceptPackageJson: clone.filesEqualExceptPackageJson, installed: clone.installed};
  const BIN = join(clone.dir, 'node_modules/.bin/composable-svelte-architecture');
  const {isQualificationPass} = await import(pathToFileURL(join(clone.dir, 'node_modules/@composable-svelte/architecture/src/check.mjs')).href);
  const env = (pol, c) => envOf(isQualificationPass, pol, c);
  const P = clone.dir;
  check('app-a', 'POSITIVE exact registered chat-code-media bytes supplied externally', BIN, P, qArgs(ccm), {exit: 0, pass: true}, env(ccm));
  check('app-a', 'DEVFEEDBACK bundled:chat-code-media analysis-only', BIN, P, ['--mode', 'analysis-only', '--policy', 'bundled:chat-code-media', '--expected-core-version', '0.13.1'], {exit: 0, pass: false}, env(ccm));
  check('app-a', 'NEG bundled:chat-code-media qualification refused', BIN, P, ['--mode', 'qualification', '--policy', 'bundled:chat-code-media', '--expected-core-version', '0.13.1'], {exit: 22, pass: false});
  check('app-a', 'NEG wrong --policy-sha256', BIN, P, qArgs(ccm, {pinOverride: 'b'.repeat(64)}), {exit: 21, pass: false}, env(ccm));
  check('app-a', 'NEG wrong expected core 0.13.0', BIN, P, qArgs(ccm, {core: '0.13.0'}), {exit: 21, pass: false}, env(ccm));
  check('app-a', 'NEG envelope expects checker 0.13.0', BIN, P, qArgs(ccm), {exit: 0, pass: false}, env(ccm, '0.13.0'));
  check('app-a', 'NEG envelope expects another policy pin', BIN, P, qArgs(ccm), {exit: 0, pass: false}, env(appb));
  for (const [name, fn] of [
    ['app-a-chat-only', (d) => { d.opaquePackages = d.opaquePackages.filter((p) => !/\/(code|media)$/.test(p.name)); }],
    ['app-a-chat-0.5.1', (d) => pin(d, '/chat', '0.5.1')],
    ['app-a-code-0.5.1', (d) => pin(d, '/code', '0.5.1')],
    ['app-a-media-0.5.1', (d) => pin(d, '/media', '0.5.1')],
    ['app-a-core-0.13.2', (d) => pin(d, '/core', '0.13.2')],
    ['app-a-svelte-5.57.0', (d) => pin(d, 'svelte', '5.57.0')],
    ['app-a-missing-root', (d) => { d.project.roots = ['src/missing-root.ts']; }]
  ]) { const v = variant(ccm, name, fn); check('app-a', `NEG policy ${name}`, BIN, P, qArgs(v), {exit: 21, pass: false}, env(v)); }
  check('app-a', 'NEG starter approvals only (exact bundled starter bytes)', BIN, P, qArgs(starter), {exit: 21, pass: false}, env(starter));
  // Labeled app copies for mutations.
  const unapproved = join(scratch, 'app-a-NEG-unapproved-import');
  run('cp', ['-Rc', P, unapproved], scratch);
  writeFileSync(join(unapproved, 'src/main.ts'), `import 'vite';\n${readFileSync(join(unapproved, 'src/main.ts'), 'utf8')}`);
  check('app-a', 'NEG labeled copy: unapproved package import', BIN, unapproved, qArgs(ccm), {exit: 21, pass: false}, env(ccm));
  const wrongCore = join(scratch, 'app-a-NEG-installed-core-0.13.2');
  run('cp', ['-Rc', P, wrongCore], scratch);
  { const f = join(wrongCore, 'node_modules/@composable-svelte/core/package.json'); const d = JSON.parse(readFileSync(f)); d.version = '0.13.2'; writeFileSync(f, JSON.stringify(d, null, 2)); }
  check('app-a', 'NEG labeled copy: installed core 0.13.2', BIN, wrongCore, qArgs(ccm, {core: '0.13.2'}), {exit: 21, pass: false}, env(ccm));
  check('app-a', 'INFO original in-place app (file: specs, local transport) is not registry-shaped', BIN, APP_A, qArgs(ccm), {exit: 21, pass: false}, env(ccm));
  const final = hashTree(APP_A, APP_SKIP);
  a.finalSourceUnchanged = Object.entries(before).every(([f, h]) => ['package.json', 'package-lock.json'].includes(f) || final[f] === h) && Object.keys(final).length === Object.keys(before).length;
  a.finalManifest = {packageJson: final['package.json'], packageLock: final['package-lock.json'], unchangedSinceRefresh: final['package.json'] === a.after.packageJson && final['package-lock.json'] === a.after.packageLock};
  a.finalInstalled = names.map((n) => verifyInstalled(APP_A, n));
}

// ================================================= App-B =============================================================
if (phase === 'all' || phase === 'b') {
  const b = receipt.apps['app-b'] = {path: APP_B};
  const snap = JSON.parse(readFileSync(join(APP_B, 'review-receipts/final-source-snapshot/SNAPSHOT-RECEIPT.json'), 'utf8'));
  const snapCheck = () => Object.entries(snap.files).map(([path, hash]) => ({path, ok: sha256(readFileSync(join(APP_B, path))) === hash}));
  const before = hashTree(APP_B, APP_SKIP);
  b.before = {files: Object.keys(before).length, snapshot: snapCheck()};
  const names = ['@composable-svelte/core', '@composable-svelte/auth', '@composable-svelte/charts'];
  b.originalInstalled = names.map((n) => verifyInstalled(APP_B, n));
  const host = join(scratch, 'checker-host');
  mkdirSync(host);
  writeFileSync(join(host, 'package.json'), JSON.stringify({name: 'checker-host', private: true, devDependencies: {'@composable-svelte/architecture': `file:${CHECKER}`}}, null, 2) + '\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], host);
  b.checkerHost = {dir: host, installed: verifyInstalled(host, '@composable-svelte/architecture'),
    parser: {typescript: JSON.parse(readFileSync(join(host, 'node_modules/typescript/package.json'))).version, svelte: JSON.parse(readFileSync(join(host, 'node_modules/svelte/package.json'))).version}};
  const BIN = join(host, 'node_modules/.bin/composable-svelte-architecture');
  const {isQualificationPass} = await import(pathToFileURL(join(host, 'node_modules/@composable-svelte/architecture/src/check.mjs')).href);
  const env = (pol, c) => envOf(isQualificationPass, pol, c);
  const clone = registryShapedClone(APP_B, 'app-b-registry-shaped', names);
  b.registryShapedClone = {dir: clone.dir, rewritten: clone.rewritten, filesEqualExceptPackageJson: clone.filesEqualExceptPackageJson, installed: clone.installed};
  const P = clone.dir;
  check('app-b', 'POSITIVE external Auth+Charts policy (never bundled)', BIN, P, qArgs(appb), {exit: 0, pass: true}, env(appb));
  check('app-b', 'NEG wrong --policy-sha256', BIN, P, qArgs(appb, {pinOverride: 'b'.repeat(64)}), {exit: 21, pass: false}, env(appb));
  check('app-b', 'NEG wrong expected core 0.13.0', BIN, P, qArgs(appb, {core: '0.13.0'}), {exit: 21, pass: false}, env(appb));
  check('app-b', 'NEG envelope expects checker 0.13.0', BIN, P, qArgs(appb), {exit: 0, pass: false}, env(appb, '0.13.0'));
  check('app-b', 'NEG envelope expects another policy pin', BIN, P, qArgs(appb), {exit: 0, pass: false}, env(ccm));
  check('app-b', 'NEG exact bundled Auth-only bytes (Charts unapproved)', BIN, P, qArgs(authOnly), {exit: 21, pass: false, codes: ['unresolved-package-import']}, env(authOnly));
  for (const [name, fn] of [
    ['app-b-charts-0.3.1', (d) => pin(d, '/charts', '0.3.1')],
    ['app-b-auth-0.3.1', (d) => pin(d, '/auth', '0.3.1')],
    ['app-b-core-0.13.2', (d) => pin(d, '/core', '0.13.2')],
    ['app-b-svelte-5.57.0', (d) => pin(d, 'svelte', '5.57.0')],
    ['app-b-missing-root', (d) => { d.project.roots = ['src/missing-root.ts']; }]
  ]) { const v = variant(appb, name, fn); check('app-b', `NEG policy ${name}`, BIN, P, qArgs(v), {exit: 21, pass: false}, env(v)); }
  check('app-b', 'DEVFEEDBACK bundled:auth analysis-only rejects (Charts unapproved; no Auth+Charts profile)', BIN, P, ['--mode', 'analysis-only', '--policy', 'bundled:auth', '--expected-core-version', '0.13.1'], {exit: 21, pass: false, codes: ['unresolved-package-import']});
  check('app-b', 'DEVFEEDBACK bundled:charts analysis-only rejects (Auth unapproved)', BIN, P, ['--mode', 'analysis-only', '--policy', 'bundled:charts', '--expected-core-version', '0.13.1'], {exit: 21, pass: false, codes: ['unresolved-package-import']});
  check('app-b', 'NEG bundled:auth qualification refused', BIN, P, ['--mode', 'qualification', '--policy', 'bundled:auth', '--expected-core-version', '0.13.1'], {exit: 22, pass: false});
  const unapproved = join(scratch, 'app-b-NEG-unapproved-import');
  run('cp', ['-Rc', P, unapproved], scratch);
  writeFileSync(join(unapproved, 'src/main.ts'), `import 'vite';\n${readFileSync(join(unapproved, 'src/main.ts'), 'utf8')}`);
  check('app-b', 'NEG labeled copy: unapproved package import', BIN, unapproved, qArgs(appb), {exit: 21, pass: false}, env(appb));
  check('app-b', 'INFO original in-place app (file: specs, read-only run) is not registry-shaped', BIN, APP_B, qArgs(appb), {exit: 21, pass: false}, env(appb));
  const after = hashTree(APP_B, APP_SKIP);
  b.after = {unchanged: JSON.stringify(before) === JSON.stringify(after), snapshot: snapCheck(), installed: names.map((n) => verifyInstalled(APP_B, n))};
  b.functionalEvidenceReused = {sequentialBrowser: join(APP_B, 'review-receipts/sequential-browser-coordinator/result.json'),
    sha256: sha256(readFileSync(join(APP_B, 'review-receipts/sequential-browser-coordinator/result.json'))),
    reason: 'App-B source and installed runtime bytes are unchanged (verified above); the checker is not part of the app runtime.'};
}

receipt.finishedAt = new Date().toISOString();
receipt.failures = failures;
receipt.verdict = failures === 0 ? 'ALL_EXPECTATIONS_MET' : 'EXPECTATION_FAILURES';
receipt.results = results;
receipt.commandLog = log;
const out = join(OUT, `FINAL-APP-GATE-RECEIPT-${CHECKER_SHA.slice(0, 8)}${phase === 'all' ? '' : '-' + phase}.json`);
writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(`receipt ${out} sha256 ${sha256(readFileSync(out))} ${receipt.verdict}`);
process.exitCode = failures ? 1 : 0;

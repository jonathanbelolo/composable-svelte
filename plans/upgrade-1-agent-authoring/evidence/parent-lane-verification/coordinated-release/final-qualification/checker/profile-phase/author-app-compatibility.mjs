// One-time COMPATIBILITY EXERCISE (not app acceptance, not app qualification): read-only copies of the final author
// apps are materialized from the frozen R4 tarballs and checked against externally pinned policies. App-level
// architecture qualification stays with the coordinator and the independent app reviews.
// usage: node author-app-compatibility.mjs --evidence <dir> --checker <tgz> --checker-sha256 <hex> --ccm <chat-code-media.json> --appb <policy.json>
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && acc.push([a.slice(2), all[i + 1]]), acc), []));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'opus-author-compat-')));
const startedAt = new Date().toISOString();
const run = (cmd, argv, cwd, allowFail = false) => {
  const r = spawnSync(cmd, argv, {cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024});
  if (!allowFail && r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}\n${r.stderr}`);
  return r;
};
const listFiles = (dir, base = dir) => readdirSync(dir, {withFileTypes: true}).flatMap((e) => e.isDirectory() ? listFiles(join(dir, e.name), base) : [relative(base, join(dir, e.name))]).sort();
const manifest = JSON.parse(readFileSync('/private/tmp/companion-runtime-release/archives-r4/MANIFEST.json', 'utf8'));
const pkgs = new Map();
for (const p of [...manifest.packages, {name: '@composable-svelte/architecture', version: '0.13.1', path: args.checker, sha256: args['checker-sha256']}]) {
  const bytes = readFileSync(p.path);
  if (sha256(bytes) !== p.sha256) throw new Error(`${p.name} sha mismatch`);
  const slug = p.name.split('/')[1];
  const frozen = join(scratch, `${slug}.tgz`);
  writeFileSync(frozen, bytes);
  const unpacked = join(scratch, 'unpacked', slug);
  mkdirSync(unpacked, {recursive: true});
  run('tar', ['xzf', frozen, '-C', unpacked], scratch);
  pkgs.set(p.name, {name: p.name, version: p.version, sha256: p.sha256, frozen, unpacked: join(unpacked, 'package')});
}
const verify = (dir, id) => {
  const inst = join(dir, 'node_modules', id.name);
  const want = listFiles(id.unpacked);
  const bad = want.filter((f) => !existsSync(join(inst, f)) || !readFileSync(join(inst, f)).equals(readFileSync(join(id.unpacked, f))));
  if (bad.length || listFiles(inst).length !== want.length) throw new Error(`${id.name} installed bytes differ`);
  return {name: id.name, version: id.version, archiveSha256: id.sha256, files: want.length, mismatched: 0};
};
function install(dir, names) {
  const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const field = (n) => (m.devDependencies && n in m.devDependencies ? 'devDependencies' : 'dependencies');
  for (const n of names) { m[field(n)] = m[field(n)] || {}; m[field(n)][n] = `file:${pkgs.get(n).frozen}`; }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(m, null, 2) + '\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', '--no-package-lock'], dir);
  for (const n of names) m[field(n)][n] = pkgs.get(n).version;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(m, null, 2) + '\n');
  return names.map((n) => verify(dir, pkgs.get(n)));
}
const host = join(scratch, 'checker-host');
mkdirSync(host);
writeFileSync(join(host, 'package.json'), JSON.stringify({name: 'checker-host', private: true, devDependencies: {'@composable-svelte/architecture': '0.13.1'}}, null, 2) + '\n');
const hostInstall = install(host, ['@composable-svelte/architecture']);
const BIN = join(host, 'node_modules/.bin/composable-svelte-architecture');
const {isQualificationPass} = await import(pathToFileURL(join(host, 'node_modules/@composable-svelte/architecture/src/check.mjs')).href);

const policies = join(scratch, 'policies');
mkdirSync(policies);
const put = (name, data) => { const t = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n'; writeFileSync(join(policies, name), t); return {path: join(policies, name), sha256: sha256(readFileSync(join(policies, name)))}; };
const results = [];
let failures = 0;
function q(app, dir, label, pol, want, pin = pol.sha256, core = '0.13.1') {
  const r = run(BIN, ['--mode', 'qualification', '--project', dir, '--policy', pol.path, '--policy-sha256', pin, '--expected-core-version', core, '--today', '2026-09-26'], dir, true);
  let res = null; try { res = JSON.parse(r.stdout); } catch {}
  const pass = res ? isQualificationPass(res, {policySha256: pol.sha256, expectedCoreVersion: '0.13.1', expectedCheckerVersion: '0.13.1'}) : false;
  const ok = r.status === want.exit && pass === want.pass;
  if (!ok) failures += 1;
  const row = {app, label, ok, expected: want, exit: r.status, isQualificationPass: pass, policy: res?.policy && {id: res.policy.id, sha256: res.policy.sha256},
    enforced: res?.rules?.enforcedCount, violations: res?.violations?.length, moduleCount: res?.graph?.moduleCount, packageSpecifiers: res?.graph?.packageSpecifiers,
    errors: res?.analysisErrors?.map((e) => ({code: e.code, path: e.path, line: e.span?.start?.line ?? null, message: e.message.slice(0, 200)}))};
  results.push(row);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${app} ${label} exit=${r.status} pass=${pass} ${(row.errors || []).map((e) => e.code).join(',')}`);
}
const apps = {};
for (const [app, src, names] of [
  ['app-a', '/private/tmp/composable-final-authoring/app-a', ['@composable-svelte/core', '@composable-svelte/chat', '@composable-svelte/code', '@composable-svelte/media']],
  ['app-b', '/private/tmp/composable-final-authoring/app-b', ['@composable-svelte/core', '@composable-svelte/auth', '@composable-svelte/charts']]
]) {
  const dir = join(scratch, app);
  cpSync(src, dir, {recursive: true, filter: (p) => !/\/(node_modules|dist|test-results|ssr)(\/|$)/.test(p.slice(src.length))});
  const sourceFiles = listFiles(join(dir, 'src')).map((f) => ({path: `src/${f}`, sha256: sha256(readFileSync(join(dir, 'src', f)))}));
  const origin = listFiles(join(src, 'src')).map((f) => ({path: `src/${f}`, sha256: sha256(readFileSync(join(src, 'src', f)))}));
  if (JSON.stringify(sourceFiles) !== JSON.stringify(origin)) throw new Error(`${app} source copy differs`);
  apps[app] = {source: src, copiedTo: dir, srcFiles: sourceFiles, installed: install(dir, names), svelte: JSON.parse(readFileSync(join(dir, 'node_modules/svelte/package.json'))).version};
}
const ccmBytes = readFileSync(args.ccm);
const ccm = put('exact-bundled-chat-code-media.json', ccmBytes);
const ccmData = JSON.parse(ccmBytes);
q('app-a', apps['app-a'].copiedTo, 'exact proposed bundled chat-code-media bytes, supplied externally', ccm, {exit: 0, pass: true});
q('app-a', apps['app-a'].copiedTo, 'NEG wrong --policy-sha256', ccm, {exit: 21, pass: false}, 'b'.repeat(64));
q('app-a', apps['app-a'].copiedTo, 'NEG chat-only approvals (code/media unapproved)',
  put('neg-app-a-chat-only.json', {...ccmData, policyId: 'neg-chat-only', opaquePackages: ccmData.opaquePackages.filter((p) => !/\/(code|media)$/.test(p.name))}), {exit: 21, pass: false});
const appBBytes = readFileSync(args.appb);
const appB = put('external-app-b-auth-charts.json', appBBytes);
const appBData = JSON.parse(appBBytes);
q('app-b', apps['app-b'].copiedTo, 'external appB auth+charts policy', appB, {exit: 0, pass: true});
q('app-b', apps['app-b'].copiedTo, 'NEG wrong --policy-sha256', appB, {exit: 21, pass: false}, 'b'.repeat(64));
q('app-b', apps['app-b'].copiedTo, 'NEG wrong expected core 0.13.0', appB, {exit: 21, pass: false}, appB.sha256, '0.13.0');
q('app-b', apps['app-b'].copiedTo, 'NEG auth-only approvals (charts unapproved)',
  put('neg-app-b-auth-only.json', {...appBData, policyId: 'neg-auth-only', opaquePackages: appBData.opaquePackages.filter((p) => !p.name.endsWith('/charts'))}), {exit: 21, pass: false});
q('app-b', apps['app-b'].copiedTo, 'NEG wrong charts pin 0.3.1',
  put('neg-app-b-charts-0.3.1.json', {...appBData, policyId: 'neg-charts-pin', opaquePackages: appBData.opaquePackages.map((p) => p.name.endsWith('/charts') ? {...p, version: '0.3.1'} : p)}), {exit: 21, pass: false});
const receipt = {schema: 'composable-final-checker/author-app-compatibility-exercise/v1', startedAt, finishedAt: new Date().toISOString(),
  label: 'COMPATIBILITY EXERCISE ONLY - not app acceptance and not app architecture qualification; read-only copies; local candidate tarball transport, no registry provenance claimed',
  verdict: failures === 0 ? 'ALL_EXPECTATIONS_MET' : 'EXPECTATION_FAILURES', failures, checker: {sha256: args['checker-sha256'], install: hostInstall},
  policies: {chatCodeMedia: {path: args.ccm, sha256: ccm.sha256}, appB: {path: args.appb, sha256: appB.sha256}}, apps, results, scratch};
mkdirSync(args.evidence, {recursive: true});
const out = join(args.evidence, 'author-app-compatibility-receipt.json');
writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(`receipt ${out} sha256 ${sha256(readFileSync(out))} ${receipt.verdict}`);
process.exitCode = failures ? 1 : 0;

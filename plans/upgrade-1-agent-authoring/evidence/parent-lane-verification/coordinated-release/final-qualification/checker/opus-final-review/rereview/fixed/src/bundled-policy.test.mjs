import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BUNDLED_POLICY_REGISTRY,
  BUNDLED_PROFILE_SHA256,
  BUNDLED_STARTER_SHA256,
  POLICIES_DIRECTORY,
  bundledEntry,
  getBundledPolicyEntry,
  isBundledPolicySelector,
  isPolicyPathContained,
  loadBundledPolicy,
  loadBundledStarterPolicy,
  resolveBundledPolicySelector,
  validateBundledPolicyBytes
} from './bundled-policy.mjs';
import {CHECKER_KNOWN_CORE, RULE_CATALOG, compareVersions} from './policy.mjs';
import {inspectArchive} from '../test/inspect-archive.mjs';

test('loadBundledStarterPolicy loads genuine pinned policy', () => {
  const result = loadBundledStarterPolicy();
  assert.equal(result.ok, true);
  assert.equal(result.source, 'bundled');
  assert.equal(result.sha256, BUNDLED_STARTER_SHA256);
  assert.deepEqual(result.errors, []);
  assert.ok(result.policy);
});

test('validateBundledPolicyBytes validates shipped bytes against schema, catalog, core and rules', () => {
  const genuineBytes = readFileSync(new URL('../policies/starter.json', import.meta.url));
  const result = validateBundledPolicyBytes(genuineBytes);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'bundled');
  assert.equal(result.sha256, BUNDLED_STARTER_SHA256);
  assert.deepEqual(result.errors, []);

  const {policy} = result;
  assert.equal(policy.schema, 'composable-svelte/consumer-architecture-policy');
  assert.equal(policy.schemaVersion, 2);
  assert.equal(policy.catalogVersion, 2);
  // The stable starter narrows the existing checker range; external policies retain prerelease support.
  assert.deepEqual(policy.supportedCore, {min: '0.13.1', maxExclusive: '0.14.0-0'});
  assert.equal(policy.supportedCore.maxExclusive, CHECKER_KNOWN_CORE.maxExclusive);
  assert.ok(compareVersions(policy.supportedCore.min, CHECKER_KNOWN_CORE.min) >= 0);
  // Opacity is approved only for these exact installs; supportedCore alone does not admit other 0.13.x cores.
  assert.equal(policy.policyId, 'bundled-starter');
  assert.equal(policy.policyVersion, '0.13.1');
  assert.deepEqual(policy.opaquePackages, [
    {name: '@composable-svelte/core', version: '0.13.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]);

  const activeCatalog = RULE_CATALOG.filter((r) => r.stage === 'active');
  assert.equal(policy.rules.active.length, 5);
  assert.equal(policy.rules.active.length, activeCatalog.length);
  for (const rule of policy.rules.active) {
    assert.equal(rule.severity, 'error');
    assert.ok(activeCatalog.some((r) => r.id === rule.id));
  }

  const stagedCatalog = RULE_CATALOG.filter((r) => r.stage === 'staged');
  assert.equal(policy.rules.inactive.length, 2);
  assert.equal(policy.rules.inactive.length, stagedCatalog.length);
  for (const rule of policy.rules.inactive) {
    assert.equal(rule.reason, 'supported-replacement-pending');
    assert.ok(stagedCatalog.some((r) => r.id === rule.id));
  }

  assert.deepEqual(policy.exceptions, []);
  assert.deepEqual(policy.capabilityGrants, []);
  assert.deepEqual(policy.qualificationRecords, []);
});

test('altered bytes fail hash with policy null before parse', () => {
  const alteredBytes = Buffer.from('{"schema":"corrupted"}');
  const result = validateBundledPolicyBytes(alteredBytes);
  assert.equal(result.ok, false);
  assert.equal(result.policy, null);
  assert.equal(result.source, 'bundled');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'policy-pin-mismatch');
  assert.equal(result.errors[0].where, '$');
});

// Named registry. The production registry holds only the starter; the two-entry registry below is a
// test-only fixture built in a temporary directory and never shipped.

const STARTER_BYTES = readFileSync(new URL('../policies/starter.json', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const frozenRegistry = (entries) => Object.freeze(Object.assign(Object.create(null), entries));

function variantBytes(changes) {
  return Buffer.from(`${JSON.stringify({...JSON.parse(STARTER_BYTES.toString('utf8')), ...changes}, null, 2)}\n`);
}

function testRegistry(t) {
  const dir = mkdtempSync(join(tmpdir(), 'architecture-bundled-registry-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const alpha = variantBytes({policyId: 'test-alpha'});
  const beta = variantBytes({policyId: 'test-beta'});
  writeFileSync(join(dir, 'alpha.json'), alpha);
  writeFileSync(join(dir, 'beta.json'), beta);
  const registry = frozenRegistry({
    'test-alpha': Object.freeze({name: 'test-alpha', path: join(dir, 'alpha.json'), sha256: sha(alpha)}),
    'test-beta': Object.freeze({name: 'test-beta', path: join(dir, 'beta.json'), sha256: sha(beta)})
  });
  return {dir, alpha, beta, registry};
}

function pinnedFile(dir, name, bytes) {
  writeFileSync(join(dir, `${name}.json`), bytes);
  return frozenRegistry({[name]: Object.freeze({name, path: join(dir, `${name}.json`), sha256: sha(bytes)})});
}

test('production registry contains exactly the pinned starter and the qualified companion profiles', () => {
  assert.deepEqual(Object.keys(BUNDLED_POLICY_REGISTRY), ['starter', 'chat', 'code', 'media', 'chat-code-media', 'maps', 'graphics', 'charts', 'auth']);
  assert.equal(Object.getPrototypeOf(BUNDLED_POLICY_REGISTRY), null);
  assert.ok(Object.isFrozen(BUNDLED_POLICY_REGISTRY));
  assert.ok(Object.isFrozen(BUNDLED_PROFILE_SHA256));
  const pins = {starter: BUNDLED_STARTER_SHA256, ...BUNDLED_PROFILE_SHA256};
  for (const [name, pin] of Object.entries(pins)) {
    const registered = BUNDLED_POLICY_REGISTRY[name];
    assert.ok(Object.isFrozen(registered), name);
    assert.equal(registered.name, name);
    assert.equal(registered.sha256, pin, name);
    assert.equal(registered.path, join(POLICIES_DIRECTORY, `${name}.json`), name);
    assert.equal(sha(readFileSync(registered.path)), pin, name);
    assert.equal(getBundledPolicyEntry(name), registered, name);
  }
  const entry = BUNDLED_POLICY_REGISTRY.starter;
  assert.throws(() => { BUNDLED_POLICY_REGISTRY['auth-charts'] = entry; }, TypeError);
  assert.throws(() => { BUNDLED_PROFILE_SHA256.chat = BUNDLED_STARTER_SHA256; }, TypeError);
  assert.throws(() => { entry.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => { entry.path = '/tmp/other.json'; }, TypeError);
  // Unqualified profiles, unbundled combinations and generic profiles are never selectable.
  for (const name of ['auth-charts', 'charts-auth', 'auth-chat', 'chat-code', 'code-media', 'chat-media', 'maps-graphics',
    'all', 'companions', 'combined', 'native']) {
    assert.equal(getBundledPolicyEntry(name), null, name);
    assert.equal(loadBundledPolicy(name).errors[0].code, 'bundled-policy-unknown', name);
  }
  const viaRegistry = loadBundledPolicy('starter');
  assert.equal(viaRegistry.ok, true);
  assert.deepEqual(viaRegistry, loadBundledStarterPolicy());
});

test('companion profiles approve exactly core, their named companions and app Svelte 5.55.3', () => {
  const starter = JSON.parse(STARTER_BYTES.toString('utf8'));
  const exact = (name, version) => ({name, version, provenance: 'registry'});
  const expected = {
    chat: [exact('@composable-svelte/chat', '0.5.0')],
    code: [exact('@composable-svelte/code', '0.5.0')],
    media: [exact('@composable-svelte/media', '0.5.0')],
    'chat-code-media': [exact('@composable-svelte/chat', '0.5.0'), exact('@composable-svelte/code', '0.5.0'), exact('@composable-svelte/media', '0.5.0')],
    maps: [exact('@composable-svelte/maps', '0.3.0')],
    graphics: [exact('@composable-svelte/graphics', '0.3.0')],
    charts: [exact('@composable-svelte/charts', '0.3.0')],
    auth: [exact('@composable-svelte/auth', '0.3.0')]
  };
  assert.deepEqual(Object.keys(BUNDLED_PROFILE_SHA256), Object.keys(expected));
  for (const [name, companions] of Object.entries(expected)) {
    const loaded = loadBundledPolicy(name);
    assert.equal(loaded.ok, true, name);
    assert.equal(loaded.sha256, BUNDLED_PROFILE_SHA256[name]);
    const {policy} = loaded;
    assert.equal(policy.policyId, `bundled-${name}`);
    assert.deepEqual(policy.opaquePackages, [exact('@composable-svelte/core', '0.13.1'), ...companions, exact('svelte', '5.55.3')]);
    // Everything except identity and opaque approvals is the reviewed starter: same version, range, roots, rules,
    // inactive reasons, and no grants, records or exceptions.
    const strip = ({policyId, opaquePackages, ...rest}) => rest;
    assert.deepEqual(strip(policy), strip(starter), name);
  }
  // The starter keeps its own exact Svelte pin, independent of the companion app pin.
  assert.deepEqual(starter.opaquePackages.at(-1), exact('svelte', '5.57.0'));
});

test('loader selects two test-only names with distinct pinned bytes', (t) => {
  const {alpha, beta, registry} = testRegistry(t);
  assert.notEqual(sha(alpha), sha(beta));
  const a = loadBundledPolicy('test-alpha', {registry});
  const b = loadBundledPolicy('test-beta', {registry});
  assert.equal(a.ok, true, JSON.stringify(a.errors));
  assert.equal(b.ok, true, JSON.stringify(b.errors));
  assert.equal(a.policy.policyId, 'test-alpha');
  assert.equal(b.policy.policyId, 'test-beta');
  assert.equal(a.sha256, sha(alpha));
  assert.equal(b.sha256, sha(beta));
  // Neither registry leaks into the other.
  assert.equal(loadBundledPolicy('test-alpha').errors[0].code, 'bundled-policy-unknown');
  assert.equal(loadBundledPolicy('starter', {registry}).errors[0].code, 'bundled-policy-unknown');
});

test('each name is bound to its own pin; swapped or tampered bytes fail before parse', (t) => {
  const {dir, alpha, beta, registry} = testRegistry(t);
  const swapped = frozenRegistry({
    'test-alpha': Object.freeze({name: 'test-alpha', path: join(dir, 'alpha.json'), sha256: sha(beta)})
  });
  const wrong = loadBundledPolicy('test-alpha', {registry: swapped});
  assert.equal(wrong.ok, false);
  assert.equal(wrong.policy, null);
  assert.deepEqual(wrong.errors.map((e) => e.code), ['policy-pin-mismatch']);
  assert.equal(wrong.sha256, sha(alpha));

  // Tampered bytes are not JSON, so reporting pin-mismatch (not parse-error) proves the hash is checked first.
  writeFileSync(join(dir, 'beta.json'), Buffer.concat([beta, Buffer.from('{not json')]));
  const tampered = loadBundledPolicy('test-beta', {registry});
  assert.equal(tampered.policy, null);
  assert.deepEqual(tampered.errors.map((e) => e.code), ['policy-pin-mismatch']);

  // Once pinned, bytes are still parsed and validated against schema and catalog.
  const junk = loadBundledPolicy('junk', {registry: pinnedFile(dir, 'junk', Buffer.from('{not json'))});
  assert.deepEqual(junk.errors.map((e) => e.code), ['policy-parse-error']);
  const invalid = loadBundledPolicy('invalid', {registry: pinnedFile(dir, 'invalid', variantBytes({catalogVersion: 99}))});
  assert.equal(invalid.policy, null);
  assert.ok(invalid.errors.some((e) => e.code === 'policy-catalog-mismatch'));
  const core = loadBundledPolicy('core', {registry: pinnedFile(dir, 'core', variantBytes({supportedCore: {min: '0.12.0', maxExclusive: '0.14.0-0'}}))});
  assert.equal(core.policy, null);
  assert.ok(core.errors.length > 0);

  // A malformed expected pin is never compared.
  for (const pin of ['', 'ABC', BUNDLED_STARTER_SHA256.toUpperCase(), null, 42]) {
    const result = validateBundledPolicyBytes(STARTER_BYTES, {expectedSha256: pin});
    assert.equal(result.policy, null, String(pin));
    assert.equal(result.errors[0].code, 'policy-pin-invalid', String(pin));
  }
});

test('selector resolves own, frozen, well-formed entries only', (t) => {
  const {dir, registry} = testRegistry(t);
  const hostile = [
    '', 'Starter', 'STARTER', ' starter', 'starter ', 'starter/', '../starter', '..', '.', './starter',
    '../policies/starter', '../policies/starter.json', 'starter.json', '/etc/passwd', 'a\\b', 'starter\0',
    '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
    '-starter', 'starter-', 'star--ter', 'bundled:starter', '../test-alpha'
  ];
  for (const name of hostile) {
    assert.equal(getBundledPolicyEntry(name), null, JSON.stringify(name));
    assert.equal(getBundledPolicyEntry(name, registry), null, JSON.stringify(name));
    assert.equal(loadBundledPolicy(name).policy, null, JSON.stringify(name));
  }
  for (const name of [undefined, null, 1, {}, ['starter']]) assert.equal(getBundledPolicyEntry(name), null);

  const starter = BUNDLED_POLICY_REGISTRY.starter;
  // Inherited entries are not own entries.
  assert.equal(getBundledPolicyEntry('starter', Object.freeze(Object.create(Object.freeze({starter})))), null);
  // Mutable registries and mutable entries are refused.
  assert.equal(getBundledPolicyEntry('starter', {starter}), null);
  assert.equal(getBundledPolicyEntry('x', Object.freeze({x: {name: 'x', path: join(dir, 'alpha.json'), sha256: BUNDLED_STARTER_SHA256}})), null);
  // Mismatched name, relative path or malformed pin are refused.
  const malformed = Object.freeze({
    a: Object.freeze({name: 'b', path: join(dir, 'alpha.json'), sha256: BUNDLED_STARTER_SHA256}),
    r: Object.freeze({name: 'r', path: 'alpha.json', sha256: BUNDLED_STARTER_SHA256}),
    p: Object.freeze({name: 'p', path: join(dir, 'alpha.json'), sha256: 'nothex'})
  });
  for (const name of ['a', 'r', 'p']) assert.equal(getBundledPolicyEntry(name, malformed), null, name);

  // Every `bundled:` string is bundled syntax; other strings are not selectors.
  assert.equal(isBundledPolicySelector('bundled:'), true);
  assert.equal(isBundledPolicySelector('bundled:../policies/starter.json'), true);
  assert.equal(isBundledPolicySelector('./bundled:starter'), false);
  assert.equal(isBundledPolicySelector('Bundled:starter'), false);
  assert.equal(resolveBundledPolicySelector('bundled:starter'), starter);
  assert.equal(resolveBundledPolicySelector('bundled:test-alpha', registry).name, 'test-alpha');
  for (const arg of ['bundled:', 'bundled:unknown', 'bundled:__proto__', 'bundled:../policies/starter.json', 'bundled:bundled:starter', 'starter', 'bundled:test-alpha']) {
    assert.equal(resolveBundledPolicySelector(arg), null, arg);
  }
});

test('frozen custom registry entries with accessors are rejected without invocation', (t) => {
  const {dir, alpha} = testRegistry(t);
  const alphaSha = sha(alpha);
  const alphaPath = join(dir, 'alpha.json');

  let getterCalls = 0;
  const countGetter = (fn) => () => { getterCalls++; return fn(); };

  // 1. Getter on registry itself: registry[name] is an accessor
  const registryWithGetter = Object.freeze(Object.defineProperty(Object.create(null), 'test-alpha', {
    get: countGetter(() => Object.freeze({name: 'test-alpha', path: alphaPath, sha256: alphaSha})),
    enumerable: true,
    configurable: false
  }));
  getterCalls = 0;
  assert.equal(getBundledPolicyEntry('test-alpha', registryWithGetter), null);
  assert.equal(resolveBundledPolicySelector('bundled:test-alpha', registryWithGetter), null);
  const loadRegistryResult = loadBundledPolicy('test-alpha', {registry: registryWithGetter});
  assert.equal(loadRegistryResult.ok, false);
  assert.equal(loadRegistryResult.errors[0].code, 'bundled-policy-unknown');
  assert.equal(getterCalls, 0, 'Registry property getter must not be invoked');

  // 2. Getter on entry.path
  const entryWithPathGetter = Object.freeze(Object.defineProperty({
    name: 'test-alpha',
    sha256: alphaSha
  }, 'path', {
    get: countGetter(() => alphaPath),
    enumerable: true,
    configurable: false
  }));
  const registryWithPathGetter = frozenRegistry({'test-alpha': entryWithPathGetter});
  getterCalls = 0;
  assert.equal(getBundledPolicyEntry('test-alpha', registryWithPathGetter), null);
  assert.equal(resolveBundledPolicySelector('bundled:test-alpha', registryWithPathGetter), null);
  const loadPathResult = loadBundledPolicy('test-alpha', {registry: registryWithPathGetter});
  assert.equal(loadPathResult.ok, false);
  assert.equal(loadPathResult.errors[0].code, 'bundled-policy-unknown');
  assert.equal(getterCalls, 0, 'entry.path getter must not be invoked');

  // 3. Getter on entry.sha256
  const entryWithShaGetter = Object.freeze(Object.defineProperty({
    name: 'test-alpha',
    path: alphaPath
  }, 'sha256', {
    get: countGetter(() => alphaSha),
    enumerable: true,
    configurable: false
  }));
  const registryWithShaGetter = frozenRegistry({'test-alpha': entryWithShaGetter});
  getterCalls = 0;
  assert.equal(getBundledPolicyEntry('test-alpha', registryWithShaGetter), null);
  assert.equal(resolveBundledPolicySelector('bundled:test-alpha', registryWithShaGetter), null);
  const loadShaResult = loadBundledPolicy('test-alpha', {registry: registryWithShaGetter});
  assert.equal(loadShaResult.ok, false);
  assert.equal(loadShaResult.errors[0].code, 'bundled-policy-unknown');
  assert.equal(getterCalls, 0, 'entry.sha256 getter must not be invoked');

  // 4. Getter on entry.name
  const entryWithNameGetter = Object.freeze(Object.defineProperty({
    path: alphaPath,
    sha256: alphaSha
  }, 'name', {
    get: countGetter(() => 'test-alpha'),
    enumerable: true,
    configurable: false
  }));
  const registryWithNameGetter = frozenRegistry({'test-alpha': entryWithNameGetter});
  getterCalls = 0;
  assert.equal(getBundledPolicyEntry('test-alpha', registryWithNameGetter), null);
  assert.equal(getterCalls, 0, 'entry.name getter must not be invoked');

  // 5. Getter on extra property of entry
  const entryWithExtraGetter = Object.freeze(Object.defineProperty({
    name: 'test-alpha',
    path: alphaPath,
    sha256: alphaSha
  }, 'extraField', {
    get: countGetter(() => 'extra'),
    enumerable: true,
    configurable: false
  }));
  const registryWithExtraGetter = frozenRegistry({'test-alpha': entryWithExtraGetter});
  getterCalls = 0;
  assert.equal(getBundledPolicyEntry('test-alpha', registryWithExtraGetter), null);
  assert.equal(getterCalls, 0, 'entry extra getter must not be invoked');

  // 6. Setter-only properties
  const entryWithSetterOnly = Object.freeze(Object.defineProperty({
    name: 'test-alpha',
    sha256: alphaSha
  }, 'path', {
    set: countGetter(() => {}),
    enumerable: true,
    configurable: false
  }));
  assert.equal(getBundledPolicyEntry('test-alpha', frozenRegistry({'test-alpha': entryWithSetterOnly})), null);
  assert.equal(getterCalls, 0, 'entry setter must not be invoked');

  // 7. Alternating / mutating getter: attempting to change path or hash between validation and read
  let callCount = 0;
  const alternatingEntry = Object.freeze(Object.defineProperty({
    name: 'test-alpha',
    sha256: alphaSha
  }, 'path', {
    get: () => {
      callCount++;
      return callCount === 1 ? alphaPath : '/etc/passwd';
    },
    enumerable: true,
    configurable: false
  }));
  assert.equal(getBundledPolicyEntry('test-alpha', frozenRegistry({'test-alpha': alternatingEntry})), null);
  assert.equal(callCount, 0, 'Alternating getter was not invoked at all');

  // 8. Public internal wrapper compatibility: genuine starter is exact reference
  assert.equal(resolveBundledPolicySelector('bundled:starter'), BUNDLED_POLICY_REGISTRY.starter);
  const starterLoaded = loadBundledStarterPolicy();
  assert.equal(starterLoaded.ok, true);
  assert.equal(starterLoaded.sha256, BUNDLED_STARTER_SHA256);
});

test('production registered policy containment and path checks', () => {
  // Shipped starter must resolve strictly within POLICIES_DIRECTORY
  assert.ok(isPolicyPathContained(BUNDLED_POLICY_REGISTRY.starter.path, POLICIES_DIRECTORY));
  assert.equal(isPolicyPathContained(BUNDLED_POLICY_REGISTRY.starter.path), true);

  // Escaping or outside paths are refused
  assert.equal(isPolicyPathContained('/etc/passwd'), false);
  assert.equal(isPolicyPathContained(join(POLICIES_DIRECTORY, '../src/policy.mjs')), false);
  assert.equal(isPolicyPathContained(POLICIES_DIRECTORY), false);
  assert.equal(isPolicyPathContained(join(POLICIES_DIRECTORY, '..')), false);
  assert.equal(isPolicyPathContained('starter.json'), false);
  assert.equal(isPolicyPathContained(null), false);
  assert.equal(isPolicyPathContained(123), false);

  // Custom registries permit outside paths for fixtures without production grants
  const outsidePath = resolve('/tmp/outside-policy.json');
  const mockCustomRegistry = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: outsidePath, sha256: BUNDLED_STARTER_SHA256})
  }));
  assert.ok(getBundledPolicyEntry('starter', mockCustomRegistry) !== null);

  // bundledEntry enforces production containment and throws on non-contained paths
  assert.throws(() => {
    bundledEntry('outside', '../src/policy.mjs', BUNDLED_STARTER_SHA256);
  }, /Production registered policy must resolve within shipped policies directory: outside/);
  assert.throws(() => {
    bundledEntry('directory', '../policies', BUNDLED_STARTER_SHA256);
  }, /Production registered policy must resolve within shipped policies directory: directory/);
  assert.throws(() => {
    bundledEntry('traversal', '../../outside.json', BUNDLED_STARTER_SHA256);
  }, /Production registered policy must resolve within shipped policies directory: traversal/);
  assert.throws(() => {
    bundledEntry('absolute-outside', '/tmp/foo.json', BUNDLED_STARTER_SHA256);
  }, /Production registered policy must resolve within shipped policies directory: absolute-outside/);

  // Contained production registration succeeds
  const validEntry = bundledEntry('starter-test', '../policies/starter.json', BUNDLED_STARTER_SHA256);
  assert.equal(validEntry.name, 'starter-test');
  assert.equal(validEntry.sha256, BUNDLED_STARTER_SHA256);
  assert.ok(isPolicyPathContained(validEntry.path, POLICIES_DIRECTORY));
});

test('archive inspection: containment, embedded pins, missing policies, and byte equality', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-inspect-test-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));

  // Create mock package tree
  const pkgDir = join(dir, 'package');
  mkdirSync(join(pkgDir, 'policies'), {recursive: true});
  mkdirSync(join(pkgDir, 'bin'), {recursive: true});
  mkdirSync(join(pkgDir, 'src'), {recursive: true});

  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    dependencies: {typescript: '5.9.3', svelte: '5.57.0'},
    exports: {},
    bin: {'composable-svelte-architecture': 'bin/composable-svelte-architecture.mjs'}
  }));
  writeFileSync(join(pkgDir, 'README.md'), '# test\n');
  writeFileSync(join(pkgDir, 'LICENSE'), 'MIT\n');
  writeFileSync(join(pkgDir, 'CHANGELOG.md'), '# Changelog\n');
  writeFileSync(join(pkgDir, 'bin/composable-svelte-architecture.mjs'), '// bin\n');
  writeFileSync(join(pkgDir, 'src/index.mjs'), '// src\n');

  const starterBytes = readFileSync(new URL('../policies/starter.json', import.meta.url));
  writeFileSync(join(pkgDir, 'policies/starter.json'), starterBytes);

  const archivePath = join(dir, 'test-package.tgz');
  const filesToPack = [
    'package/package.json', 'package/README.md', 'package/LICENSE', 'package/CHANGELOG.md',
    'package/bin/composable-svelte-architecture.mjs', 'package/src/index.mjs', 'package/policies/starter.json'
  ];
  execFileSync('tar', ['-czf', archivePath, '-C', dir, ...filesToPack]);

  const pkgRegistry = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: join(pkgDir, 'policies/starter.json'), sha256: BUNDLED_STARTER_SHA256})
  }));

  // Valid archive passes inspection
  const validResult = inspectArchive(archivePath, {root: pkgDir, registry: pkgRegistry});
  assert.equal(validResult.status, 'archive-matches-source');

  // 1. Missing registered policy on disk throws
  rmSync(join(pkgDir, 'policies/starter.json'));
  assert.throws(() => {
    inspectArchive(archivePath, {root: pkgDir, registry: pkgRegistry});
  }, /does not exist on disk/);
  writeFileSync(join(pkgDir, 'policies/starter.json'), starterBytes);

  // 2. Containment failure: a production registered policy resolving outside policies directory throws
  const outsidePolicy = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: join(dir, 'outside.json'), sha256: BUNDLED_STARTER_SHA256})
  }));
  assert.throws(() => {
    inspectArchive(archivePath, {root: pkgDir, registry: outsidePolicy});
  }, /Production registered policy must resolve within shipped policies directory/);

  // 3. Missing registered policy in archive throws (with specific message match)
  const missingDir = join(dir, 'missing-archive');
  mkdirSync(join(missingDir, 'package'), {recursive: true});
  for (const f of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    writeFileSync(join(missingDir, 'package', f), readFileSync(join(pkgDir, f)));
  }
  mkdirSync(join(missingDir, 'package/bin'), {recursive: true});
  writeFileSync(join(missingDir, 'package/bin/composable-svelte-architecture.mjs'), '// bin\n');
  mkdirSync(join(missingDir, 'package/src'), {recursive: true});
  writeFileSync(join(missingDir, 'package/src/index.mjs'), '// src\n');
  const missingArchivePath = join(dir, 'missing.tgz');
  const missingFiles = [
    'package/package.json', 'package/README.md', 'package/LICENSE', 'package/CHANGELOG.md',
    'package/bin/composable-svelte-architecture.mjs', 'package/src/index.mjs'
  ];
  execFileSync('tar', ['-czf', missingArchivePath, '-C', missingDir, ...missingFiles]);
  assert.throws(() => {
    inspectArchive(missingArchivePath, {root: pkgDir, registry: pkgRegistry});
  }, /package\/policies\/starter\.json/);

  // 4. Archived policy with altered hash throws pin mismatch
  const tamperedDir = join(dir, 'tampered-archive');
  mkdirSync(join(tamperedDir, 'package/policies'), {recursive: true});
  for (const f of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']) {
    writeFileSync(join(tamperedDir, 'package', f), readFileSync(join(pkgDir, f)));
  }
  mkdirSync(join(tamperedDir, 'package/bin'), {recursive: true});
  writeFileSync(join(tamperedDir, 'package/bin/composable-svelte-architecture.mjs'), '// bin\n');
  mkdirSync(join(tamperedDir, 'package/src'), {recursive: true});
  writeFileSync(join(tamperedDir, 'package/src/index.mjs'), '// src\n');
  writeFileSync(join(tamperedDir, 'package/policies/starter.json'), Buffer.from('{"tampered":true}\n'));
  const tamperedArchivePath = join(dir, 'tampered.tgz');
  const tamperedFiles = [
    'package/package.json', 'package/README.md', 'package/LICENSE', 'package/CHANGELOG.md',
    'package/bin/composable-svelte-architecture.mjs', 'package/src/index.mjs', 'package/policies/starter.json'
  ];
  execFileSync('tar', ['-czf', tamperedArchivePath, '-C', tamperedDir, ...tamperedFiles]);
  assert.throws(() => {
    inspectArchive(tamperedArchivePath, {root: pkgDir, registry: pkgRegistry});
  }, /Archive differs from reviewed file|hash mismatch with embedded pin/);

  // 5. Direct pin mismatch test: archive matches source, but embedded pin is wrong
  const wrongPinRegistry = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: join(pkgDir, 'policies/starter.json'), sha256: 'f'.repeat(64)})
  }));
  assert.throws(() => {
    inspectArchive(archivePath, {root: pkgDir, registry: wrongPinRegistry});
  }, /hash mismatch with embedded pin/);

  // 6. Extra unregistered policy on disk fails dynamic registry expectations (R1)
  writeFileSync(join(pkgDir, 'policies/extra.json'), JSON.stringify({schema: 'extra'}));
  assert.throws(() => {
    inspectArchive(archivePath, {root: pkgDir, registry: pkgRegistry});
  }, /Shipped policies directory must match production registered policies exactly/);
  rmSync(join(pkgDir, 'policies/extra.json'));

  // 7. Multi-policy registry: both starter and test-alpha contained under policies/ (R1)
  const alphaPolicyBytes = variantBytes({policyId: 'test-alpha'});
  const alphaPolicySha = sha(alphaPolicyBytes);
  writeFileSync(join(pkgDir, 'policies/alpha.json'), alphaPolicyBytes);
  const multiRegistry = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: join(pkgDir, 'policies/starter.json'), sha256: BUNDLED_STARTER_SHA256}),
    'test-alpha': Object.freeze({name: 'test-alpha', path: join(pkgDir, 'policies/alpha.json'), sha256: alphaPolicySha})
  }));

  const multiArchiveFiles = [
    'package/package.json', 'package/README.md', 'package/LICENSE', 'package/CHANGELOG.md',
    'package/bin/composable-svelte-architecture.mjs', 'package/src/index.mjs',
    'package/policies/starter.json', 'package/policies/alpha.json'
  ];
  const multiArchivePath = join(dir, 'multi-package.tgz');
  execFileSync('tar', ['-czf', multiArchivePath, '-C', dir, ...multiArchiveFiles]);

  // Multi-policy passes when both registered policies are contained, archived, and pins match
  const multiResult = inspectArchive(multiArchivePath, {root: pkgDir, registry: multiRegistry});
  assert.equal(multiResult.status, 'archive-matches-source');

  // Fails when one registered policy (alpha) is missing from archive
  const missingAlphaArchive = join(dir, 'missing-alpha.tgz');
  execFileSync('tar', ['-czf', missingAlphaArchive, '-C', dir, ...filesToPack]); // only has starter.json
  assert.throws(() => {
    inspectArchive(missingAlphaArchive, {root: pkgDir, registry: multiRegistry});
  }, /package\/policies\/alpha\.json/);

  // Fails when second registered policy has pin mismatch
  const wrongAlphaPinRegistry = Object.freeze(Object.assign(Object.create(null), {
    starter: Object.freeze({name: 'starter', path: join(pkgDir, 'policies/starter.json'), sha256: BUNDLED_STARTER_SHA256}),
    'test-alpha': Object.freeze({name: 'test-alpha', path: join(pkgDir, 'policies/alpha.json'), sha256: '0'.repeat(64)})
  }));
  assert.throws(() => {
    inspectArchive(multiArchivePath, {root: pkgDir, registry: wrongAlphaPinRegistry});
  }, /Archived registered policy test-alpha hash mismatch with embedded pin/);

  rmSync(join(pkgDir, 'policies/alpha.json'));
});

test('inspect-archive CLI regression controls with symlinked invocation path', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-cli-symlink-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));

  const realScriptPath = fileURLToPath(new URL('../test/inspect-archive.mjs', import.meta.url));
  const symlinkScriptPath = join(dir, 'symlink-inspect-archive.mjs');
  symlinkSync(realScriptPath, symlinkScriptPath);

  const scriptPathsToTest = [symlinkScriptPath];
  if (realScriptPath.startsWith('/private/tmp/')) {
    const tmpSymlink = realScriptPath.replace(/^\/private\/tmp\//, '/tmp/');
    if (existsSync(tmpSymlink)) {
      scriptPathsToTest.push(tmpSymlink);
    }
  }

  const packageRoot = resolve(dirname(realScriptPath), '..');

  // Pack a valid self-contained archive directly into the test fixture directory
  const packBin = 'npm';
  const packArgs = ['pack', '--ignore-scripts', '--quiet', '--pack-destination', dir];
  const packOutput = execFileSync(packBin, packArgs, {cwd: packageRoot, encoding: 'utf8'});
  const archiveFileName = packOutput.trim().split('\n').pop().trim();
  const validArchive = join(dir, archiveFileName);
  assert.ok(existsSync(validArchive), `Self-contained archive ${validArchive} must exist`);

  for (const script of scriptPathsToTest) {
    // 1. Missing argument exits non-zero and prints required error
    const noArg = spawnSync(process.execPath, [script], {encoding: 'utf8'});
    assert.notEqual(noArg.status, 0, `Script ${script} without arguments must fail`);
    assert.match(noArg.stderr, /Provide the npm-generated architecture archive path/);

    // 2. Missing archive path exits non-zero
    const missingArg = spawnSync(process.execPath, [script, join(dir, 'nonexistent.tgz')], {encoding: 'utf8'});
    assert.notEqual(missingArg.status, 0, `Script ${script} with nonexistent archive must fail`);
    assert.match(missingArg.stderr, /Archive not found/);

    // 3. Corrupt archive exits non-zero
    const corruptPath = join(dir, 'corrupt.tgz');
    writeFileSync(corruptPath, Buffer.from('not tar content'));
    const corrupt = spawnSync(process.execPath, [script, corruptPath], {encoding: 'utf8'});
    assert.notEqual(corrupt.status, 0, `Script ${script} with corrupt archive must fail`);

    // 4. Valid archive through symlink path succeeds unconditionally and prints archive-matches-source
    const validRun = spawnSync(process.execPath, [script, validArchive], {cwd: packageRoot, encoding: 'utf8'});
    assert.equal(validRun.status, 0, `Script ${script} with valid archive must exit 0: ${validRun.stderr}`);
    assert.match(validRun.stdout, /"status": "archive-matches-source"/);
    const parsed = JSON.parse(validRun.stdout);
    assert.equal(parsed.status, 'archive-matches-source');
    const starterFile = parsed.files.find((f) => f.path === 'policies/starter.json');
    assert.ok(starterFile, 'Archive output must contain policies/starter.json entry');
    assert.equal(starterFile.sha256, BUNDLED_STARTER_SHA256);
    const archivedPolicies = parsed.files.filter((f) => f.path.startsWith('policies/')).map((f) => [f.path, f.sha256]);
    assert.deepEqual(Object.fromEntries(archivedPolicies), Object.fromEntries(Object.entries(BUNDLED_POLICY_REGISTRY)
      .map(([name, registered]) => [`policies/${name}.json`, registered.sha256])));
  }
});

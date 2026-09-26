import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {BUNDLED_PROFILE_SHA256, BUNDLED_STARTER_SHA256} from './bundled-policy.mjs';
import {EXIT, LIMITS, SUPPORTED_PARSERS, isQualificationPass, runCheck} from './check.mjs';
import {DETECTOR_CATALOG} from './detector-catalog.mjs';
import {RULE_CATALOG} from './policy.mjs';

function fixture(t) {
  const project = mkdtempSync(join(tmpdir(), 'architecture-bundled-cli-'));
  t.after(() => rmSync(project, {recursive: true, force: true}));
  const files = {
    'package.json': JSON.stringify({name: 'fixture', private: true}),
    'tsconfig.json': JSON.stringify({compilerOptions: {}}),
    'src/main.ts': 'export const title = "Example";\n',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.13.1'})
  };
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(project, path)), {recursive: true});
    writeFileSync(join(project, path), bytes);
  }
  return (mode = 'analysis-only', policy = 'bundled:starter', version = '0.13.1') => [
    '--mode', mode, '--project', project, '--policy', policy,
    '--expected-core-version', version, '--today', '2026-09-21'
  ];
}

test('bundled guidance is pinned but cannot grant independent qualification', (t) => {
  const args = fixture(t);
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.success, outcome.stderr);
  assert.equal(outcome.result.policy.source, 'bundled');
  assert.equal(outcome.result.policy.bundledProfile, 'starter');
  assert.equal(outcome.result.policy.sha256, BUNDLED_STARTER_SHA256);
  assert.equal(outcome.result.schemaVersion, 2);
  assert.equal(outcome.result.checker.version, '0.13.1');
  assert.equal(outcome.result.checker.status, 'stable');
  assert.equal(outcome.result.rules.enforcedCount, 5);
  assert.deepEqual(outcome.result.rules.unavailableEvaluators, []);
  assert.equal(isQualificationPass(outcome.result), false);
  const refused = runCheck(args('qualification'));
  assert.equal(refused.exitCode, EXIT.usage);
  assert.equal(refused.result, null);
  assert.match(refused.stderr, /externally controlled policy/);
  assert.equal(runCheck([...args(), '--policy-sha256', BUNDLED_STARTER_SHA256]).exitCode, EXIT.usage);
});

test('companion profiles are selectable developer feedback bound to their exact approvals', (t) => {
  const project = mkdtempSync(join(tmpdir(), 'architecture-bundled-companion-'));
  t.after(() => rmSync(project, {recursive: true, force: true}));
  const manifest = (name, version) => JSON.stringify({name, version, exports: {'.': './index.js', './application': './index.js'}});
  const files = {
    'package.json': JSON.stringify({name: 'fixture', private: true, dependencies: {'@composable-svelte/core': '0.13.1', '@composable-svelte/chat': '0.5.0', svelte: '5.55.3'}}),
    'tsconfig.json': JSON.stringify({compilerOptions: {}}),
    'src/main.ts': 'import {Effect} from "@composable-svelte/core";\nimport {StreamingChat} from "@composable-svelte/chat";\nimport {mount} from "svelte";\nexport const parts = [Effect, StreamingChat, mount];\n',
    'node_modules/@composable-svelte/core/package.json': manifest('@composable-svelte/core', '0.13.1'),
    'node_modules/@composable-svelte/chat/package.json': manifest('@composable-svelte/chat', '0.5.0'),
    'node_modules/svelte/package.json': manifest('svelte', '5.55.3')
  };
  for (const name of ['@composable-svelte/core', '@composable-svelte/chat', 'svelte']) files[`node_modules/${name}/index.js`] = 'export {};\n';
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(project, path)), {recursive: true});
    writeFileSync(join(project, path), bytes);
  }
  const args = (policy, mode = 'analysis-only') => ['--mode', mode, '--project', project, '--policy', policy, '--expected-core-version', '0.13.1', '--today', '2026-09-26'];
  const codes = (outcome) => outcome.result.analysisErrors.map((error) => error.code);
  for (const name of ['chat', 'chat-code-media']) {
    const outcome = runCheck(args(`bundled:${name}`));
    assert.equal(outcome.exitCode, EXIT.success, `${name}: ${outcome.stderr}`);
    assert.equal(outcome.result.policy.source, 'bundled');
    assert.equal(outcome.result.policy.bundledProfile, name);
    assert.equal(outcome.result.policy.id, `bundled-${name}`);
    assert.equal(outcome.result.policy.sha256, BUNDLED_PROFILE_SHA256[name]);
    assert.equal(outcome.result.qualification, 'not-evaluated');
    assert.equal(outcome.result.rules.enforcedCount, 5);
    assert.deepEqual(outcome.result.analysisErrors, []);
    assert.equal(isQualificationPass(outcome.result), false);
    const refused = runCheck(args(`bundled:${name}`, 'qualification'));
    assert.equal(refused.exitCode, EXIT.usage);
    assert.match(refused.stderr, /externally controlled policy/);
    assert.equal(runCheck([...args(`bundled:${name}`), '--policy-sha256', BUNDLED_PROFILE_SHA256[name]]).exitCode, EXIT.usage);
  }
  // A profile never approves a companion it does not name, and the starter keeps its own Svelte pin.
  for (const name of ['code', 'media', 'maps', 'graphics', 'charts', 'auth', 'starter']) {
    const outcome = runCheck(args(`bundled:${name}`));
    assert.equal(outcome.exitCode, EXIT.analysisError, name);
    assert.ok(codes(outcome).includes('unresolved-package-import'), name);
  }
  // Approval is exact: an in-range but different companion version is refused.
  writeFileSync(join(project, 'node_modules/@composable-svelte/chat/package.json'), manifest('@composable-svelte/chat', '0.5.1'));
  const drifted = runCheck(args('bundled:chat'));
  assert.equal(drifted.exitCode, EXIT.analysisError);
  assert.ok(codes(drifted).includes('unresolved-package-import'));
});

test('CLI requires external policy pins and canonical exact core identity', (t) => {
  const args = fixture(t);
  const missingPin = runCheck(args('analysis-only', '/missing/policy.json'));
  assert.equal(missingPin.exitCode, EXIT.usage);
  assert.match(missingPin.stderr, /requires --policy-sha256/);
  assert.equal(runCheck(args('analysis-only', 'bundled:unknown')).exitCode, EXIT.usage);
  for (const version of ['0.13.0-next.01', 'next', '0.13.0-next.1+build']) {
    assert.equal(runCheck(args('analysis-only', 'bundled:starter', version)).exitCode, EXIT.usage);
  }
  const mismatch = runCheck(args('analysis-only', 'bundled:starter', '0.13.0-next.2'));
  assert.equal(mismatch.exitCode, EXIT.analysisError);
  assert.ok(mismatch.result.analysisErrors.some((error) => error.code === 'core-version-mismatch'));
  assert.equal(mismatch.result.rules.enforcedCount, 0);
  assert.equal(mismatch.result.rules.unavailableEvaluators.length, 5);
});

test('every bundled: argument is a registry selector and never an external path', (t) => {
  const args = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'architecture-bundled-selector-'));
  t.after(() => rmSync(outside, {recursive: true, force: true}));
  // A real, valid policy file whose relative path begins with `bundled:`; it must never be loaded.
  const starterBytes = readFileSync(new URL('../policies/starter.json', import.meta.url));
  writeFileSync(join(outside, 'bundled:evil.json'), starterBytes);
  mkdirSync(join(outside, 'bundled:'));
  writeFileSync(join(outside, 'bundled:', 'starter'), starterBytes);
  const previous = process.cwd();
  process.chdir(outside);
  t.after(() => process.chdir(previous));
  const selectors = [
    'bundled:', 'bundled:unknown', 'bundled:evil.json', 'bundled:/starter', 'bundled:Starter', 'bundled:starter ',
    'bundled:../policies/starter.json', 'bundled:./starter', 'bundled:__proto__', 'bundled:constructor',
    'bundled:toString', 'bundled:bundled:starter', 'bundled:Auth', 'bundled:auth-charts', 'bundled:charts-auth',
    'bundled:all', 'bundled:Chat', 'bundled:Maps', 'bundled:chat-code', 'bundled:chat.json', 'bundled:../policies/chat.json'
  ];
  for (const selector of selectors) {
    for (const extra of [[], ['--policy-sha256', BUNDLED_STARTER_SHA256]]) {
      const outcome = runCheck([...args('analysis-only', selector), ...extra]);
      assert.equal(outcome.exitCode, EXIT.usage, `${selector} ${extra.join(' ')}`);
      assert.equal(outcome.result, null);
      assert.match(outcome.stderr, /unknown bundled policy/, selector);
    }
  }
  // The genuine starter still cannot carry a caller pin or qualify.
  assert.match(runCheck([...args(), '--policy-sha256', BUNDLED_STARTER_SHA256]).stderr, /embedded pin/);
  assert.match(runCheck(args('qualification')).stderr, /externally controlled policy/);
});

test('external policies keep their independent pin and are never promoted to bundled', (t) => {
  const args = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), 'architecture-external-policy-'));
  t.after(() => rmSync(outside, {recursive: true, force: true}));
  const policyPath = join(outside, 'starter-copy.json');
  writeFileSync(policyPath, readFileSync(new URL('../policies/starter.json', import.meta.url)));
  // Byte-identical to the starter, but supplied externally: it is reported as external.
  const pinned = runCheck([...args('analysis-only', policyPath), '--policy-sha256', BUNDLED_STARTER_SHA256]);
  assert.equal(pinned.exitCode, EXIT.success, pinned.stderr);
  assert.equal(pinned.result.policy.source, 'external');
  assert.equal(pinned.result.policy.bundledProfile, null);
  assert.equal(pinned.result.policy.sha256, BUNDLED_STARTER_SHA256);
  const unpinned = runCheck(args('analysis-only', policyPath));
  assert.equal(unpinned.exitCode, EXIT.usage);
  assert.match(unpinned.stderr, /requires --policy-sha256/);
  const wrongPin = runCheck([...args('analysis-only', policyPath), '--policy-sha256', 'b'.repeat(64)]);
  assert.equal(wrongPin.exitCode, EXIT.analysisError);
  assert.deepEqual(wrongPin.result.analysisErrors.map((error) => error.code), ['policy-pin-mismatch']);
  assert.equal(runCheck([...args('analysis-only', policyPath), '--policy-sha256', 'B'.repeat(64)]).exitCode, EXIT.usage);
  // External qualification is not refused on usage grounds and still needs its own verdict gates.
  const qualified = runCheck([...args('qualification', policyPath), '--policy-sha256', BUNDLED_STARTER_SHA256]);
  assert.notEqual(qualified.exitCode, EXIT.usage, qualified.stderr);
  assert.equal(qualified.result.policy.source, 'external');
  assert.equal(isQualificationPass(qualified.result), false);
});

test('verdict envelope requires independent pins, complete catalog and complete analysis', () => {
  const required = RULE_CATALOG.filter((rule) => rule.required);
  const staged = RULE_CATALOG.filter((rule) => rule.stage === 'staged');
  const expected = {policySha256: 'a'.repeat(64), expectedCoreVersion: '0.13.0', expectedCheckerVersion: '0.13.0'};
  const good = {
    schema: 'composable-svelte/consumer-architecture-result',
    schemaVersion: 2,
    kind: 'architecture',
    mode: 'qualification',
    outcome: 'analysis-complete',
    qualification: 'passed',
    exitCode: 0,
    qualificationScope: 'bounded-five-family-detectors',
    manualReviewRequired: true,
    policy: {
      id: 'test-policy',
      version: '1.0.0',
      schemaVersion: 2,
      source: 'external',
      sha256: expected.policySha256,
      capabilityGrantCount: 0,
      exceptionCount: 0
    },
    core: {paired: true, installed: expected.expectedCoreVersion, expected: expected.expectedCoreVersion},
    checker: {version: expected.expectedCheckerVersion, ...SUPPORTED_PARSERS},
    catalog: {version: 2, rules: structuredClone(DETECTOR_CATALOG)},
    evaluation: {today: '2026-09-21', passes: 1, converged: true, zoneCounts: null},
    project: {roots: ['src/main.ts']},
    rules: {
      active: required.map(({id}) => ({id, severity: 'error'})),
      inactive: staged.map(({id}) => ({id, status: 'not-active', reason: 'supported-replacement-pending', detail: 'staged'})),
      enforcedCount: required.length,
      unavailableEvaluators: []
    },
    graph: {complete: true, moduleCount: 1, roots: ['src/main.ts'], modules: [{path: 'src/main.ts'}]},
    analysisErrors: [],
    violationsComplete: true,
    violations: [],
    excepted: [],
    limitations: [],
    limits: [...LIMITS]
  };
  assert.equal(isQualificationPass(good, expected), true);
  assert.equal(isQualificationPass(good), false);
  assert.equal(isQualificationPass(good, {...expected, policySha256: 'b'.repeat(64)}), false);
  for (const malformed of [null, {}, {rules: null}, {catalog: {rules: [null]}}]) {
    assert.equal(isQualificationPass(malformed, expected), false);
  }
  const mutations = [
    (r) => { r.schemaVersion = 1; },
    (r) => { r.mode = 'analysis-only'; },
    (r) => { r.qualification = 'not-requested'; },
    (r) => { r.qualification = 'refused'; },
    (r) => { r.policy.source = 'bundled'; },
    (r) => { r.policy.bundledProfile = 'starter'; },
    (r) => { r.core.installed = '0.13.0-next.0'; },
    (r) => { r.checker.version = '0.0.0'; },
    (r) => { r.checker.svelte = '5.43.3'; },
    (r) => { r.catalog.version = 1; },
    (r) => { r.catalog.rules[0].detectors = []; },
    (r) => { r.catalog.rules[0].detectors = ['synthetic-control']; },
    (r) => { r.catalog.rules[0] = null; },
    (r) => { r.rules.active[0] = null; },
    (r) => { r.rules.unavailableEvaluators = [required[0].id]; },
    (r) => { r.rules.enforcedCount = 0; },
    (r) => { r.graph.moduleCount = 0; },
    (r) => { r.graph.complete = false; },
    (r) => { r.violationsComplete = false; },
    (r) => { r.violations = [{}]; },
    (r) => { r.excepted = [{}]; },
    (r) => { r.analysisErrors = [{}]; },
    (r) => { delete r.qualificationScope; },
    (r) => { r.manualReviewRequired = false; },
    (r) => { r.policy.capabilityGrantCount = 1; },
    (r) => { r.policy.exceptionCount = 1; },
    (r) => { r.evaluation.converged = false; },
    (r) => { r.evaluation.passes = 0; },
    (r) => { r.limits = []; }
  ];
  for (const change of mutations) {
    const altered = structuredClone(good);
    change(altered);
    assert.equal(isQualificationPass(altered, expected), false, change.toString());
  }
});

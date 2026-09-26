// Policy substrate tests. Fixtures are generated in temporary directories; nothing is written to the repository.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {CATALOG_VERSION, CHECKER_KNOWN_CORE, POLICY_SCHEMA_VERSION, RULE_CATALOG, checkCorePairing, compareVersions, isExactVersion, isPlainVersion, loadPolicy, relativePathProblem, ruleInventory, sha256Hex, validatePolicy, verifyQualificationRecords} from './policy.mjs';

const TODAY = '2026-09-19';
const ROUTING = 'routing/no-manual-browser-authority';
const CORE = '0.13.0-next.1';
const ACTIVE = RULE_CATALOG.filter((rule) => rule.stage === 'active').map((rule) => rule.id);
const STAGED = RULE_CATALOG.filter((rule) => rule.stage === 'staged').map((rule) => rule.id);

function basePolicy() {
  return {
    schema: 'composable-svelte/consumer-architecture-policy',
    schemaVersion: 2,
    catalogVersion: 2,
    policyId: 'substrate-fixture',
    policyVersion: '1.0.0',
    supportedCore: {min: '0.13.0-next.1', maxExclusive: '0.14.0-0'},
    project: {tsconfig: 'tsconfig.json', roots: ['src/main.ts']},
    rules: {
      active: ACTIVE.map((id) => ({id, severity: 'error'})),
      inactive: STAGED.map((id) => ({id, reason: 'supported-replacement-pending', detail: 'No supported replacement ships yet.'}))
    },
    capabilityGrants: [],
    qualificationRecords: [],
    exceptions: [],
    opaquePackages: []
  };
}

const validate = (policy) => validatePolicy(policy, {today: TODAY}).errors;
const codes = (errors) => errors.map((error) => error.code);

function scratch(t) {
  const directory = mkdtempSync(join(tmpdir(), 'consumer-architecture-policy-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

function write(file, content) {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, content);
  return file;
}

test('accepts the strict baseline and keeps staged rules catalog-only', () => {
  const policy = basePolicy();
  assert.deepEqual(validate(policy), []);
  const inventory = ruleInventory(policy);
  assert.deepEqual(inventory.active, ACTIVE.map((id) => ({id, severity: 'error'})));
  assert.deepEqual(inventory.inactive.map((rule) => rule.id), STAGED);
  assert.ok(inventory.inactive.every((rule) => rule.status === 'not-active' && rule.reason === 'supported-replacement-pending'));
  assert.deepEqual(ACTIVE, [ROUTING, 'presentation/no-subscription-orchestration', 'reducers/pure-decisions', 'resources/no-unowned-infrastructure', 'motion/no-competing-playback']);
  assert.deepEqual(STAGED, ['presentation/no-fabricated-view', 'adapters/least-authority']);
  assert.ok(RULE_CATALOG.every((rule) => rule.required === (rule.stage === 'active')));
  assert.equal(POLICY_SCHEMA_VERSION, 2);
  assert.equal(CATALOG_VERSION, 2);
  assert.deepEqual(CHECKER_KNOWN_CORE, {min: CORE, maxExclusive: '0.14.0-0'});
});

test('keeps the version compatibility exports on the strict SemVer helper', () => {
  assert.equal(isPlainVersion(CORE), true);
  assert.equal(isPlainVersion('0.13.0-next.01'), false);
  assert.equal(isPlainVersion(`${CORE}+build.7`), true);
  assert.equal(isExactVersion(CORE), true);
  assert.equal(isExactVersion(`${CORE}+build.7`), false);
  assert.equal(isExactVersion(undefined), false);
  assert.equal(compareVersions(CORE, '0.13.0'), -1);
  assert.equal(compareVersions('0.14.0-0', '0.14.0'), -1);
});

test('rejects unknown, missing and mistyped fields with deterministic errors', () => {
  assert.deepEqual(validate({...basePolicy(), extra: true}), [{code: 'policy-unknown-field', where: '$.extra', message: 'unknown field'}]);
  const missing = basePolicy();
  delete missing.exceptions;
  assert.deepEqual(validate(missing), [{code: 'policy-missing-field', where: '$.exceptions', message: 'required field is missing'}]);
  const missingOpaque = basePolicy();
  delete missingOpaque.opaquePackages;
  assert.deepEqual(validate(missingOpaque), [{code: 'policy-missing-field', where: '$.opaquePackages', message: 'required field is missing'}]);
  const missingCatalog = basePolicy();
  delete missingCatalog.catalogVersion;
  assert.deepEqual(validate(missingCatalog), [{code: 'policy-missing-field', where: '$.catalogVersion', message: 'required field is missing'}]);
  assert.deepEqual(codes(validate({...basePolicy(), schemaVersion: 1})), ['policy-unsupported-schema']);
  for (const catalogVersion of [1, 3, '2']) assert.deepEqual(validate({...basePolicy(), catalogVersion}).map((error) => [error.code, error.where]), [['policy-catalog-mismatch', '$.catalogVersion']], String(catalogVersion));
  assert.deepEqual(codes(validate({...basePolicy(), policyVersion: '1.0'})), ['policy-invalid-value']);
  assert.deepEqual(codes(validate({...basePolicy(), policyVersion: '1.0.0+build.1'})), ['policy-invalid-value']);
  assert.deepEqual(validate({...basePolicy(), policyVersion: '1.0.0-rc.1'}), []);
  assert.deepEqual(codes(validate([])), ['policy-invalid-value']);
  const noisy = {...basePolicy(), zeta: 1, alpha: 1};
  assert.deepEqual(validate(noisy), validate(noisy));
  assert.deepEqual(validate(noisy).map((error) => error.where), ['$.alpha', '$.zeta']);
});

test('requires nonempty exact roots', () => {
  const empty = basePolicy();
  empty.project.roots = [];
  assert.deepEqual(codes(validate(empty)), ['policy-empty-roots']);
  const duplicate = basePolicy();
  duplicate.project.roots = ['src/main.ts', 'src/main.ts'];
  assert.deepEqual(codes(validate(duplicate)), ['policy-duplicate-entry']);
  const backslash = String.fromCharCode(92);
  for (const path of ['../main.ts', '/src/main.ts', 'src//main.ts', 'src/./main.ts', 'src/*.ts', 'src/', `src${backslash}main.ts`, '']) {
    const policy = basePolicy();
    policy.project.roots = [path];
    assert.deepEqual(codes(validate(policy)), ['policy-invalid-path'], path);
    assert.equal(typeof relativePathProblem(path), 'string');
  }
  assert.equal(relativePathProblem('src/routes/page.svelte'), undefined);
});

test('accounts for every catalog rule exactly once', () => {
  const unknown = basePolicy();
  unknown.rules.inactive.push({id: 'routing/invented', reason: 'supported-replacement-pending', detail: 'Not a catalog rule.'});
  assert.deepEqual(codes(validate(unknown)), ['unknown-rule']);
  const unaccounted = basePolicy();
  unaccounted.rules.inactive.pop();
  assert.deepEqual(codes(validate(unaccounted)), ['catalog-rule-unaccounted']);
  for (const id of ACTIVE) {
    const disabled = basePolicy();
    disabled.rules.inactive.push({id, reason: 'supported-replacement-pending', detail: 'Attempt to disable.'});
    disabled.rules.active = disabled.rules.active.filter((rule) => rule.id !== id);
    assert.deepEqual(codes(validate(disabled)), ['required-rule-disabled'], id);
  }
  const activated = basePolicy();
  const [staged] = activated.rules.inactive.splice(0, 1);
  activated.rules.active.push({id: staged.id, severity: 'error'});
  assert.deepEqual(codes(validate(activated)), ['rule-not-activatable']);
  const twice = basePolicy();
  twice.rules.active.push({id: ROUTING, severity: 'error'});
  assert.deepEqual(codes(validate(twice)), ['policy-duplicate-entry']);
  const warning = basePolicy();
  warning.rules.active[0].severity = 'warn';
  assert.deepEqual(codes(validate(warning)), ['policy-invalid-value']);
});

test('enforces supported core bounds inside the checker range and exact prerelease pairing', (t) => {
  const bounded = (supportedCore) => codes(validate({...basePolicy(), supportedCore}));
  assert.deepEqual(bounded({min: '0.13.0-next.2', maxExclusive: '0.13.0'}), []);
  assert.deepEqual(bounded({min: '0.13.0', maxExclusive: '0.13.0-next.1'}), ['policy-invalid-value']);
  assert.deepEqual(bounded({min: CORE, maxExclusive: CORE}), ['policy-invalid-value']);
  assert.deepEqual(bounded({min: '0.13.0-next.0', maxExclusive: '0.14.0-0'}), ['policy-core-outside-checker-range']);
  assert.deepEqual(bounded({min: CORE, maxExclusive: '0.14.0'}), ['policy-core-outside-checker-range']);
  assert.deepEqual(bounded({min: '0.12.9', maxExclusive: '0.13.0'}), ['policy-core-outside-checker-range']);
  for (const min of ['0.13.0-next.01', 'v0.13.0-next.1', `${CORE}+build.7`, '0.13', '']) assert.deepEqual(bounded({min, maxExclusive: '0.14.0-0'}), ['policy-invalid-value'], min);
  const project = join(scratch(t), 'project');
  const manifest = join(project, 'node_modules/@composable-svelte/core/package.json');
  const install = (version) => write(manifest, JSON.stringify({name: '@composable-svelte/core', version}));
  const pairing = (expectedCoreVersion, supportedCore = basePolicy().supportedCore) => checkCorePairing({projectRoot: project, supportedCore, expectedCoreVersion});
  mkdirSync(project, {recursive: true});
  assert.deepEqual(codes(pairing(CORE).errors), ['core-not-installed']);
  install(CORE);
  assert.deepEqual(pairing(CORE), {core: {installed: CORE, expected: CORE, supported: basePolicy().supportedCore, paired: true}, errors: []});
  assert.deepEqual(codes(pairing('0.13.0-next.2').errors), ['core-version-mismatch']);
  assert.deepEqual(codes(pairing('0.13.0').errors), ['core-version-mismatch']);
  install('0.13.0-next.0');
  assert.deepEqual(codes(pairing('0.13.0-next.0').errors), ['unsupported-core-version']);
  install('0.14.0-0');
  assert.deepEqual(codes(pairing('0.14.0-0').errors), ['unsupported-core-version']);
  install('0.13.0-next.10');
  assert.deepEqual(codes(pairing('0.13.0-next.10', {min: '0.13.0-next.2', maxExclusive: '0.13.0'}).errors), []);
  install('0.14.0');
  assert.deepEqual(codes(pairing('0.14.0', {min: '0.12.0', maxExclusive: '0.15.0'}).errors), ['core-outside-checker-range']);
  for (const version of ['0.13.0-next.01', 'v0.13.0-next.1', `${CORE}+build.7`]) {
    install(version);
    assert.deepEqual(codes(pairing(version).errors), ['core-version-invalid'], version);
  }
});

test('rejects every capability grant and validates records and exceptions', () => {
  const record = {id: 'QR-1', file: 'history-adapter.record.json', sha256: 'a'.repeat(64)};
  const grant = {path: 'src/integrations/history-adapter.ts', capability: 'browser-history', qualificationRecord: 'QR-1'};
  const exception = {id: 'EX-1', rule: ROUTING, path: 'src/legacy.ts', reason: 'Reviewed migration window.', reviewedBy: 'architecture-review', reviewedOn: '2026-09-01', expires: '2026-12-01'};
  const build = (change, capabilityGrants = []) => {
    const policy = {...basePolicy(), qualificationRecords: [{...record}], capabilityGrants, exceptions: [{...exception}]};
    change(policy);
    return validate(policy);
  };
  const granted = (change) => codes(build(change, [{...grant}]));
  assert.deepEqual(build(() => {}), []);
  // A well-formed grant is refused too: this checker version has no extension point that a grant could authorize.
  assert.deepEqual(build(() => {}, [{...grant}]), [{code: 'grants-unsupported-in-checker', where: '$.capabilityGrants', message: 'capability grants are not supported by this checker version: no extension point exists to register a grant'}]);
  const grantCases = [
    [(policy) => { policy.capabilityGrants[0].capability = 'teleport'; }, 'unknown-capability'],
    [(policy) => { policy.capabilityGrants[0].path = 'src/integrations/'; }, 'policy-invalid-path'],
    [(policy) => { policy.capabilityGrants[0].path = 'src/integrations/*.ts'; }, 'policy-invalid-path'],
    [(policy) => { policy.capabilityGrants[0].qualificationRecord = 'QR-2'; }, 'grant-record-unknown'],
    [(policy) => { policy.capabilityGrants.push({...grant}); }, 'policy-duplicate-entry']
  ];
  for (const [change, code] of grantCases) assert.deepEqual(granted(change), ['grants-unsupported-in-checker', code]);
  const cases = [
    [(policy) => { policy.qualificationRecords[0].sha256 = 'xyz'; }, 'policy-invalid-value'],
    [(policy) => { policy.qualificationRecords.push({...record}); }, 'policy-duplicate-entry'],
    [(policy) => { policy.exceptions[0].path = 'src/legacy/'; }, 'policy-invalid-path'],
    [(policy) => { policy.exceptions[0].expires = '2027-03-01'; }, 'exception-invalid-dates'],
    [(policy) => { policy.exceptions[0].expires = '2026-09-19'; }, 'exception-expired'],
    [(policy) => { policy.exceptions[0].reviewedOn = '2026-09-20'; }, 'exception-invalid-dates'],
    [(policy) => { policy.exceptions[0].expires = '2027-06-01'; }, 'exception-invalid-dates'],
    [(policy) => { policy.exceptions[0].rule = STAGED[0]; }, 'exception-rule-inactive'],
    [(policy) => { policy.exceptions[0].reviewedOn = '2026-02-30'; }, 'exception-invalid-dates'],
    [(policy) => { policy.exceptions.push({...exception, id: 'EX-2'}); }, 'policy-duplicate-entry']
  ];
  for (const [change, code] of cases) assert.deepEqual(codes(build(change)), [code]);
  assert.deepEqual(build((policy) => { policy.exceptions[0].expires = '2027-02-28'; }), []);
});

test('validates opaque package approvals and bounded provenances', () => {
  const regPkg = {name: 'opaque-widget', version: '1.0.0', provenance: 'registry'};
  const tarPkg = {name: '@composable-svelte/core', version: CORE, provenance: 'pinned-tarball', sha256: 'a'.repeat(64)};
  const build = (change) => {
    const policy = {...basePolicy(), opaquePackages: [{...regPkg}, {...tarPkg}]};
    change(policy);
    return codes(validate(policy));
  };
  assert.deepEqual(build(() => {}), []);
  const cases = [
    [(p) => { p.opaquePackages = 'not-an-array'; }, 'policy-invalid-value'],
    [(p) => { p.opaquePackages[0].provenance = 'git'; }, 'policy-invalid-value'],
    [(p) => { p.opaquePackages[0].version = '1.0'; }, 'policy-invalid-value'],
    [(p) => { p.opaquePackages[0].version = '1.0.0+build'; }, 'policy-invalid-value'],
    [(p) => { p.opaquePackages[1].version = '0.13.0-next.01'; }, 'policy-invalid-value'],
    [(p) => { p.opaquePackages[1].sha256 = 'xyz'; }, 'policy-invalid-value'],
    [(p) => { delete p.opaquePackages[1].sha256; }, 'policy-missing-field'],
    [(p) => { p.opaquePackages[0].sha256 = 'a'.repeat(64); }, 'policy-unknown-field'],
    [(p) => { p.opaquePackages.push({...regPkg}); }, 'policy-duplicate-entry']
  ];
  for (const [change, code] of cases) assert.deepEqual(build(change), [code]);
  const legacy = {...basePolicy(), opaquePackages: [{...regPkg}, {...tarPkg, provenance: 'tarball'}]};
  assert.deepEqual(validate(legacy).map((error) => [error.code, error.where]), [['policy-invalid-value', '$.opaquePackages[1].provenance'], ['policy-unknown-field', '$.opaquePackages[1].sha256']]);
  assert.match(validate(legacy)[0].message, /^provenance must be one of: registry, pinned-tarball$/);
  const named = (name) => validate({...basePolicy(), opaquePackages: [{...regPkg, name}]});
  const malformed = ['', 'Opaque-Widget', '@scope', '@scope/', '@/widget', 'opaque-widget/feature', '@scope/widget/feature', '../opaque-widget', '@scope/..', '.', '..', '.hidden', '_private', 'opaque%2dwidget', 'opaque widget', ' opaque-widget', 'a'.repeat(215)];
  for (const name of malformed) assert.deepEqual(named(name).map((error) => [error.code, error.where]), [['policy-invalid-value', '$.opaquePackages[0].name']], name);
  for (const name of ['opaque-widget', '@composable-svelte/core', '@types/node', 'lodash.merge', 'a'.repeat(214)]) assert.deepEqual(named(name), [], name);
});

test('pins the external policy bytes and rejects loose JSON', (t) => {
  const directory = scratch(t);
  const project = join(directory, 'project');
  mkdirSync(project, {recursive: true});
  const text = JSON.stringify(basePolicy(), null, 2);
  const load = (file, content, pin = sha256Hex(content)) => loadPolicy({policyPath: write(file, content), policySha256: pin, projectRoot: project, today: TODAY});
  const external = join(directory, 'policies/policy.json');
  const accepted = load(external, text);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.sha256, sha256Hex(text));
  assert.deepEqual(accepted.policy, basePolicy());
  assert.deepEqual(codes(load(external, text, '0'.repeat(64)).errors), ['policy-pin-mismatch']);
  assert.deepEqual(codes(load(external, text, 'not-a-pin').errors), ['policy-pin-invalid']);
  assert.deepEqual(codes(load(external, `/* loose */${text}`).errors), ['policy-parse-error']);
  assert.deepEqual(codes(load(external, `${text.slice(0, -1)},}`).errors), ['policy-parse-error']);
  const duplicated = load(external, text.replace('{', `{${JSON.stringify('policyId')}: ${JSON.stringify('shadow')},`));
  assert.deepEqual(duplicated.errors, [{code: 'policy-duplicate-field', where: '$.policyId', message: 'duplicate field'}]);
  assert.deepEqual(codes(load(join(project, 'policy.json'), text).errors), ['policy-inside-project']);
  const absent = loadPolicy({policyPath: join(directory, 'absent.json'), policySha256: '0'.repeat(64), projectRoot: project, today: TODAY});
  assert.deepEqual(codes(absent.errors), ['policy-unreadable']);
  assert.equal(absent.policy, null);
});

test('keeps pinned qualification records outside the project', (t) => {
  const directory = scratch(t);
  const project = join(directory, 'project');
  const records = join(directory, 'records');
  mkdirSync(project, {recursive: true});
  const content = JSON.stringify({id: 'QR-1'});
  const policy = {...basePolicy(), qualificationRecords: [{id: 'QR-1', file: 'qr-1.json', sha256: sha256Hex(content)}]};
  const verify = (recordsRoot) => codes(verifyQualificationRecords({policy, recordsRoot, projectRoot: project}));
  assert.deepEqual(verify(undefined), ['records-root-missing']);
  mkdirSync(records);
  assert.deepEqual(verify(records), ['qualification-record-missing']);
  write(join(records, 'qr-1.json'), `${content} `);
  assert.deepEqual(verify(records), ['record-pin-mismatch']);
  write(join(records, 'qr-1.json'), content);
  assert.deepEqual(verify(records), []);
  write(join(project, 'records/qr-1.json'), content);
  assert.deepEqual(verify(join(project, 'records')), ['records-inside-project']);
  assert.deepEqual(codes(verifyQualificationRecords({policy: basePolicy(), recordsRoot: undefined, projectRoot: project})), []);
});

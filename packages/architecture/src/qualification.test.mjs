import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {EXIT, LIMITS, QUALIFICATION_SCOPE, SUPPORTED_PARSERS, isQualificationPass} from './check.mjs';
import {DETECTOR_CATALOG, KNOWN_LIMITATION_CODES} from './detector-catalog.mjs';
import {CATALOG_VERSION, CHECKER_KNOWN_CORE, RULE_CATALOG} from './policy.mjs';

const CHECKER = fileURLToPath(new URL('./check.mjs', import.meta.url));
const EXPECTED_CORE = '0.13.0-next.1';
const EXPECTED_CHECKER = '0.13.1';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createFixture(t, files, {policyOverrides = {}, exceptions = [], capabilityGrants = []} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arch-qualification-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const projectDir = join(root, 'project');
  const policyFile = join(root, 'policy.json');

  const defaultFiles = {
    'package.json': JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: {'@composable-svelte/core': EXPECTED_CORE, svelte: '5.57.0'}
    }),
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'es2022', module: 'esnext'}}),
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: EXPECTED_CORE,
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/@composable-svelte/core/index.js': 'export const Effect = {none: () => ({type: "none"})};',
    'node_modules/@composable-svelte/core/application.js': 'export const ApplicationRoot = {}; export const ApplicationHost = {}; export const useApplication = () => ({});',
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte',
      version: '5.57.0',
      exports: {'.': './index.js', './transition': './transition.js'}
    }),
    'node_modules/svelte/index.js': 'export {};',
    'node_modules/svelte/transition.js': 'export function fade() {}',
    ...files
  };

  for (const [relPath, content] of Object.entries(defaultFiles)) {
    const fullPath = join(projectDir, relPath);
    mkdirSync(dirname(fullPath), {recursive: true});
    writeFileSync(fullPath, content);
  }

  const roots = Object.keys(files).length > 0 ? Object.keys(files) : ['src/main.ts'];

  const policyData = {
    schema: 'composable-svelte/consumer-architecture-policy',
    schemaVersion: 2,
    catalogVersion: 2,
    policyId: 'qualification-policy',
    policyVersion: '1.0.0',
    supportedCore: {min: EXPECTED_CORE, maxExclusive: '0.14.0-0'},
    project: {tsconfig: 'tsconfig.json', roots},
    rules: {
      active: [
        {id: 'routing/no-manual-browser-authority', severity: 'error'},
        {id: 'presentation/no-subscription-orchestration', severity: 'error'},
        {id: 'reducers/pure-decisions', severity: 'error'},
        {id: 'resources/no-unowned-infrastructure', severity: 'error'},
        {id: 'motion/no-competing-playback', severity: 'error'}
      ],
      inactive: [
        {id: 'presentation/no-fabricated-view', reason: 'supported-replacement-pending', detail: 'staged'},
        {id: 'adapters/least-authority', reason: 'supported-replacement-pending', detail: 'staged'}
      ]
    },
    capabilityGrants,
    qualificationRecords: [],
    exceptions,
    opaquePackages: [
      {name: '@composable-svelte/core', version: EXPECTED_CORE, provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ],
    ...policyOverrides
  };

  const policyText = JSON.stringify(policyData, null, 2);
  writeFileSync(policyFile, policyText);
  const policySha = sha256Hex(Buffer.from(policyText, 'utf8'));

  const invoke = (mode = 'qualification', extraArgs = [], command = CHECKER) => {
    const argv = [
      '--mode', mode,
      '--project', projectDir,
      '--policy', policyFile,
      '--policy-sha256', policySha,
      '--expected-core-version', EXPECTED_CORE,
      '--today', '2026-09-22'
    ];
    for (let i = 0; i < extraArgs.length; i += 2) {
      const index = argv.indexOf(extraArgs[i]);
      if (index >= 0) argv[index + 1] = extraArgs[i + 1];
      else argv.push(extraArgs[i], extraArgs[i + 1]);
    }
    return spawnSync(process.execPath, [command, ...argv], {encoding: 'utf8'});
  };

  return {root, projectDir, policyFile, policySha, policyData, invoke};
}

test('real child qualification: clean public Effect.none passes and analysis-only contrast stays not-evaluated', (t) => {
  const fixture = createFixture(t, {
    'src/main.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
      export const reducer: Reducer<{count: number}, {type: 'inc'}> = (state) => [state, Effect.none()];`
  });
  const child = fixture.invoke('qualification');
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.exitCode, 0);
  assert.equal(result.outcome, 'analysis-complete');
  assert.equal(result.qualification, 'passed');
  assert.equal(result.qualificationScope, QUALIFICATION_SCOPE);
  assert.equal(result.manualReviewRequired, true);
  assert.equal(result.policy.source, 'external');
  assert.equal(result.policy.bundledProfile, null);
  assert.equal(result.policy.capabilityGrantCount, 0);
  assert.equal(result.policy.exceptionCount, 0);
  assert.equal(result.checker.version, EXPECTED_CHECKER);
  assert.deepEqual(result.limits, LIMITS);
  assert.deepEqual(result.analysisErrors, []);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.excepted, []);
  assert.equal(result.violationsComplete, true);

  const expected = {policySha256: fixture.policySha, expectedCoreVersion: EXPECTED_CORE, expectedCheckerVersion: EXPECTED_CHECKER};
  assert.equal(isQualificationPass(result, expected), true);

  const analysisChild = fixture.invoke('analysis-only');
  assert.equal(analysisChild.status, 0, analysisChild.stderr);
  const analysisResult = JSON.parse(analysisChild.stdout);
  assert.equal(analysisResult.qualification, 'not-evaluated');
  assert.equal(analysisResult.policy.bundledProfile, null);
  assert.equal(isQualificationPass(analysisResult, expected), false);
});

test('real process negatives: five rule families emit violations and conforming neighbours pass', (t) => {
  const families = [
    {
      name: 'routing',
      bad: {'src/main.ts': 'export const x = 1;', 'Nav.svelte': '<script>function go(){ history.pushState({}, ""); }</script><svelte:window onpopstate={go}/>'},
      good: {'src/main.ts': 'export const x = 1;', 'Nav.svelte': '<div>clean nav</div>'},
      detector: 'traversal-listener'
    },
    {
      name: 'presentation',
      bad: {'Render.svelte': '<script>import {useApplication} from "@composable-svelte/core/application"; const app = useApplication({});</script>{#snippet s(store)}{@const _ = store.subscribe(()=>{})}{/snippet}{@render s(app.store)}'},
      good: {'Render.svelte': '<div>clean presentation</div>'},
      detector: 'view-subscribe'
    },
    {
      name: 'reducers',
      bad: {'src/main.ts': 'import type {Reducer} from "@composable-svelte/core"; export const reducer: Reducer<{n: number}, {}> = (s) => { s.n++; return [s]; };'},
      good: {'src/main.ts': 'import type {Reducer} from "@composable-svelte/core"; export const reducer: Reducer<{n: number}, {}> = (s) => [{n: s.n + 1}];'},
      detector: 'state-mutation'
    },
    {
      name: 'resources',
      bad: {'View.svelte': '<script>fetch("/api/data");</script>'},
      good: {'View.svelte': '<div>clean view</div>'},
      detector: 'view-io'
    },
    {
      name: 'motion',
      bad: {'Motion.svelte': '<script>import {fade} from "svelte/transition";</script><div transition:fade>m</div>'},
      good: {'Motion.svelte': '<div>clean motion</div>'},
      detector: 'transition-directive'
    }
  ];

  for (const {name, bad, good, detector} of families) {
    const badFixture = createFixture(t, bad);
    const badChild = badFixture.invoke('qualification');
    assert.equal(badChild.status, EXIT.violations, `${name} bad status`);
    const badResult = JSON.parse(badChild.stdout);
    assert.equal(badResult.qualification, 'refused');
    assert.equal(badResult.violationsComplete, true);
    assert.equal(badResult.rules.enforcedCount, 5);
    assert.equal(badResult.manualReviewRequired, true);
    assert.ok(badResult.violations.some((v) => v.detector === detector), `${name} emitted ${detector}`);
    assert.equal(isQualificationPass(badResult, {policySha256: badFixture.policySha, expectedCoreVersion: EXPECTED_CORE, expectedCheckerVersion: EXPECTED_CHECKER}), false);

    // Restore the same externally pinned project to its conforming neighbour.
    for (const [path,source] of Object.entries(good)) writeFileSync(join(badFixture.projectDir,path),source);
    const goodFixture = badFixture;
    const goodChild = goodFixture.invoke('qualification');
    assert.equal(goodChild.status, EXIT.success, `${name} good status`);
    const goodResult = JSON.parse(goodChild.stdout);
    assert.equal(goodResult.qualification, 'passed');
    assert.equal(isQualificationPass(goodResult, {policySha256: goodFixture.policySha, expectedCoreVersion: EXPECTED_CORE, expectedCheckerVersion: EXPECTED_CHECKER}), true);
  }
});

test('qualification policy: nonempty exceptions and capability grants return refused 21 and wrapper false', (t) => {
  const exception = {
    id: 'ex-1',
    rule: 'resources/no-unowned-infrastructure',
    path: 'View.svelte',
    reason: 'tracking',
    reviewedBy: 'reviewer',
    reviewedOn: '2026-09-20',
    expires: '2026-10-20'
  };
  const withFinding = createFixture(t, {'View.svelte': '<script>fetch("/telemetry");</script>'}, {exceptions: [exception]});
  const childFinding = withFinding.invoke('qualification');
  assert.equal(childFinding.status, EXIT.analysisError);
  const resFinding = JSON.parse(childFinding.stdout);
  assert.equal(resFinding.qualification, 'refused');
  assert.ok(resFinding.analysisErrors.some((e) => e.code === 'qualification-exceptions-refused'));
  assert.equal(isQualificationPass(resFinding), false);

  const withoutFinding = createFixture(t, {'View.svelte': '<div>pure</div>'}, {exceptions: [exception]});
  const childNoFinding = withoutFinding.invoke('qualification');
  assert.equal(childNoFinding.status, EXIT.analysisError);
  const resNoFinding = JSON.parse(childNoFinding.stdout);
  assert.equal(resNoFinding.qualification, 'refused');
  assert.ok(resNoFinding.analysisErrors.some((e) => e.code === 'qualification-exceptions-refused'));
  assert.equal(isQualificationPass(resNoFinding), false);
});

test('boundary and provenance: bundled qualification, bad pins, wrong core, and empty graph are rejected', (t) => {
  const fix = createFixture(t, {'src/main.ts': 'export const x = 1;'});
  const bundledQual = spawnSync(process.execPath, [CHECKER, '--mode', 'qualification', '--project', fix.projectDir, '--policy', 'bundled:starter', '--expected-core-version', EXPECTED_CORE], {encoding: 'utf8'});
  assert.equal(bundledQual.status, EXIT.usage);
  assert.equal(bundledQual.stdout, '');

  const missingPin = spawnSync(process.execPath, [CHECKER, '--mode', 'qualification', '--project', fix.projectDir, '--policy', fix.policyFile, '--expected-core-version', EXPECTED_CORE], {encoding: 'utf8'});
  assert.equal(missingPin.status, EXIT.usage);

  const malformedPin = fix.invoke('qualification', ['--policy-sha256', 'bad-sha']);
  assert.equal(malformedPin.status, EXIT.usage);

  const wrongPin = fix.invoke('qualification', ['--policy-sha256', '0'.repeat(64)]);
  assert.equal(wrongPin.status, EXIT.analysisError);
  assert.ok(JSON.parse(wrongPin.stdout).analysisErrors.some((e) => e.code === 'policy-pin-mismatch'));

  const insidePolicy = join(fix.projectDir, 'inside-policy.json');
  writeFileSync(insidePolicy, JSON.stringify(fix.policyData));
  const insideChild = spawnSync(process.execPath, [
    CHECKER, '--mode', 'qualification', '--project', fix.projectDir, '--policy', insidePolicy,
    '--policy-sha256', sha256Hex(Buffer.from(JSON.stringify(fix.policyData))), '--expected-core-version', EXPECTED_CORE, '--today', '2026-09-22'
  ], {encoding: 'utf8'});
  assert.equal(insideChild.status, EXIT.analysisError);
  assert.ok(JSON.parse(insideChild.stdout).analysisErrors.some((e) => e.code === 'policy-inside-project'));

  const wrongCore = fix.invoke('qualification', ['--expected-core-version', '0.13.0-next.2']);
  assert.equal(wrongCore.status, EXIT.analysisError);
  assert.ok(JSON.parse(wrongCore.stdout).analysisErrors.some((e) => e.code === 'core-version-mismatch'));

  const emptyFixture = createFixture(t, {'src/main.ts': ''});
  const emptyChild = emptyFixture.invoke('qualification');
  assert.equal(emptyChild.status, EXIT.analysisError);
  assert.ok(JSON.parse(emptyChild.stdout).analysisErrors.some((e) => e.code === 'empty-root-module'));
});

test('known opaque-decision-call limitation survives clean bounded pass and wrapper rejects missing metadata', (t) => {
  const fixture = createFixture(t, {
    'src/main.ts': `import type {Reducer} from '@composable-svelte/core';
      declare function opaqueHelper(): void;
      export const reducer: Reducer<{n: number}, {}> = (s) => {
        opaqueHelper();
        return [s];
      };`
  });
  const child = fixture.invoke('qualification');
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.qualification, 'passed');
  assert.equal(result.limitations.length, 1);
  assert.equal(result.limitations[0].code, 'opaque-decision-call');
  assert.equal(result.limitations[0].path, 'src/main.ts');
  assert.ok(result.limitations[0].span);
  assert.ok(result.limitations[0].message);
  const expected = {policySha256: fixture.policySha, expectedCoreVersion: EXPECTED_CORE, expectedCheckerVersion: EXPECTED_CHECKER};
  assert.equal(isQualificationPass(result, expected), true);

  const droppedSpan = structuredClone(result);
  delete droppedSpan.limitations[0].span;
  assert.equal(isQualificationPass(droppedSpan, expected), false);

  const unknownCode = structuredClone(result);
  unknownCode.limitations[0].code = 'uninspected-eval';
  assert.equal(isQualificationPass(unknownCode, expected), false);
});

test('envelope mutation matrix: all mutations of real passing envelope return false without throwing', (t) => {
  const fixture = createFixture(t, {
    'src/main.ts': `import {Effect, type Reducer} from '@composable-svelte/core';
      export const reducer: Reducer<{count: number}, {type: 'inc'}> = (state) => [state, Effect.none()];`
  });
  const child = fixture.invoke('qualification');
  assert.equal(child.status, 0);
  const passingEnvelope = JSON.parse(child.stdout);
  const expected = {policySha256: fixture.policySha, expectedCoreVersion: EXPECTED_CORE, expectedCheckerVersion: EXPECTED_CHECKER};
  assert.equal(isQualificationPass(passingEnvelope, expected), true);

  const mutations = [
    (r) => { r.schema = 'wrong'; },
    (r) => { r.schemaVersion = 1; },
    (r) => { r.kind = 'other'; },
    (r) => { r.mode = 'analysis-only'; },
    (r) => { r.outcome = 'analysis-error'; },
    (r) => { r.qualification = 'refused'; },
    (r) => { r.exitCode = 20; },
    (r) => { delete r.qualificationScope; },
    (r) => { r.qualificationScope = 'all'; },
    (r) => { r.manualReviewRequired = false; },
    (r) => { r.policy.source = 'bundled'; },
    (r) => { r.policy.bundledProfile = 'starter'; },
    (r) => { r.policy.sha256 = '0'.repeat(64); },
    (r) => { r.policy.id = ''; },
    (r) => { r.policy.version = 'invalid'; },
    (r) => { r.policy.capabilityGrantCount = 1; },
    (r) => { r.policy.exceptionCount = 1; },
    (r) => { r.core.paired = false; },
    (r) => { r.core.installed = '0.13.0-next.2'; },
    (r) => { r.checker.version = `${EXPECTED_CHECKER}+different-build`; },
    (r) => { r.checker.typescript = '5.9.2'; },
    (r) => { r.checker.svelte = '5.56.0'; },
    (r) => { r.catalog.version = 1; },
    (r) => { r.catalog.rules = r.catalog.rules.slice(1); },
    (r) => { r.catalog.rules.push(r.catalog.rules[0]); },
    (r) => { r.catalog.rules[0].detectors = ['synthetic-control']; },
    (r) => { r.rules.active.push({id: 'presentation/no-fabricated-view', severity: 'error'}); },
    (r) => { r.rules.enforcedCount = 4; },
    (r) => { r.rules.unavailableEvaluators = ['routing/no-manual-browser-authority']; },
    (r) => { r.rules.inactive = []; },
    (r) => { r.evaluation.converged = false; },
    (r) => { r.evaluation.passes = 0; },
    (r) => { r.graph.complete = false; },
    (r) => { r.graph.moduleCount = 0; },
    (r) => { r.graph.roots = []; },
    (r) => { r.graph.modules = []; },
    (r) => { r.graph.modules[0].path = '../outside.ts'; },
    (r) => { r.project.roots = ['other.ts']; },
    (r) => { r.analysisErrors = [{code: 'err'}]; },
    (r) => { r.violations = [{detector: 'state-mutation'}]; },
    (r) => { r.excepted = [{exceptionId: 'ex'}]; },
    (r) => { r.violationsComplete = false; },
    (r) => { r.limitations = null; },
    (r) => { r.limits = []; },
    (r) => { r.limits.push('extra-limit'); }
  ];

  for (const mutate of mutations) {
    const clone = structuredClone(passingEnvelope);
    mutate(clone);
    assert.equal(isQualificationPass(clone, expected), false, mutate.toString());
  }

  for (const malformed of [null, undefined, 123, 'str', {}, {policy: null}, {checker: {version: {}}}]) {
    assert.equal(isQualificationPass(malformed, expected), false);
  }
});

test('determinism: child process exit code matches envelope exit and stderr is clean', (t) => {
  const fix = createFixture(t, {'src/main.ts': 'export const x = 1;'});
  const child = fix.invoke('qualification');
  assert.equal(child.status, 0);
  const env = JSON.parse(child.stdout);
  assert.equal(child.status, env.exitCode);
  assert.ok(child.stderr.startsWith('Architecture checker: '));
  const child2 = fix.invoke('qualification');
  assert.equal(child.stdout, child2.stdout);
});

for (const [label, mutate] of [
  ['declared root absent from modules', r => {r.graph.roots = ['missing.ts']; r.project.roots = ['missing.ts'];}],
  ['limitation path absent from modules', r => {r.limitations[0].path = 'missing.ts';}],
  ['negative limitation offsets', r => {r.limitations[0].span.start.offset = -1;}],
  ['zero limitation line', r => {r.limitations[0].span.start.line = 0;}],
  ['reversed limitation range', r => {r.limitations[0].span.end.offset = 0;}]
]) {
  test(`root review rejects ${label}`, t => {
    const fixture = createFixture(t, {'src/main.ts': 'export const x = 1;'});
    const child = fixture.invoke();
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    result.limitations = [{code:'opaque-decision-call',path:'src/main.ts',message:'Review this call.',span:{start:{offset:1,line:1,column:2},end:{offset:3,line:1,column:4}}}];
    const expected = {policySha256:fixture.policySha,expectedCoreVersion:EXPECTED_CORE,expectedCheckerVersion:EXPECTED_CHECKER};
    assert.equal(isQualificationPass(result,expected),true);
    mutate(result);
    assert.equal(isQualificationPass(result,expected),false);
  });
}


function reviewCheckerCopy(t) {
  // A test-owned executable copy exercises unreachable defensive guards without
  // adding author-controlled production flags or mutating the reviewed stage.
  const parent=mkdtempSync(join(dirname(dirname(CHECKER)),'qualification-guard-'));
  t.after(()=>rmSync(parent,{recursive:true,force:true}));
  const copied=join(parent,'src');
  cpSync(dirname(CHECKER),copied,{recursive:true,filter:path=>!path.endsWith('.test.mjs')});
  return copied;
}

test('independent wrapper review rejects malformed expectation objects without throwing', t => {
  const fix=createFixture(t,{'src/main.ts':'export const x=1;'});
  const child=fix.invoke();assert.equal(child.status,0,child.stderr);
  const result=JSON.parse(child.stdout);
  for(const expectations of [null,[],0,'pins',{}, {policySha256:null}]) {
    assert.equal(isQualificationPass(result,expectations),false);
  }
});

test('independent unavailable evaluator control refuses a test-owned executable missing an active evaluator', t => {
  const copied=reviewCheckerCopy(t);
  const catalog=join(copied,'detector-catalog.mjs');
  const original=readFileSync(catalog,'utf8');
  assert.ok(original.includes("stage: 'active'"));
  writeFileSync(catalog,original.replace("stage: 'active'","stage: 'staged'"));
  const fix=createFixture(t,{'src/main.ts':'export const x=1;'});
  const child=fix.invoke('qualification',[],join(copied,'check.mjs'));
  assert.equal(child.status,EXIT.analysisError,child.stderr);
  const result=JSON.parse(child.stdout);
  assert.equal(result.qualification,'refused');
  assert.equal(result.rules.enforcedCount,0);
  assert.equal(result.violationsComplete,false);
});

for(const [label, overrides] of [
  ['unknown finding',{findings:[{rule:'reducers/pure-decisions',detector:'unknown',path:'src/main.ts',message:'bad'}]}],
  ['unknown limitation',{limitations:[{code:'unknown',path:'src/main.ts',message:'bad'}]}],
  ['incomplete semantics with no errors',{complete:false}],
  ['nonconvergence with no errors',{converged:false}],
  ['missing findings array',{findings:null}],
  ['missing errors array',{errors:null}],
  ['missing limitations array',{limitations:null}]
]) test(`independent semantic guard rejects ${label} from a test-owned executable`, t => {
  const copied=reviewCheckerCopy(t);
  const result={complete:true,converged:true,passes:1,findings:[],errors:[],limitations:[],zoneCounts:{},...overrides};
  writeFileSync(join(copied,'semantics.mjs'),`export function analyzeSemantics(){return ${JSON.stringify(result)};}`);
  const fix=createFixture(t,{'src/main.ts':'export const x=1;'});
  const child=fix.invoke('qualification',[],join(copied,'check.mjs'));
  assert.equal(child.status,EXIT.analysisError,child.stderr);
  const envelope=JSON.parse(child.stdout);
  assert.equal(envelope.qualification,'refused');
  assert.equal(envelope.rules.enforcedCount,0);
  assert.equal(envelope.violationsComplete,false);
});


test('generated project code cannot replace checker stdout or bypass a real violation', t => {
  const fix=createFixture(t,{'src/main.ts': `console.log(JSON.stringify({qualification:'passed',exitCode:0})); process.exit(0); fetch('/actual-unowned-work');`});
  const child=fix.invoke();assert.equal(child.status,20,child.stderr);
  const result=JSON.parse(child.stdout);
  assert.equal(result.qualification,'refused');
  assert.ok(result.violations.some(v=>v.detector==='module-load-io'));
  assert.equal(child.status,result.exitCode);
  assert.ok(!child.stdout.includes(fix.projectDir));
  assert.equal(isQualificationPass(result,{policySha256:fix.policySha,expectedCoreVersion:EXPECTED_CORE,expectedCheckerVersion:EXPECTED_CHECKER}),false);
});

test('pinned records do not approve grants or exceptions and changed records refuse qualification', t => {
  const bytes='review record, not an authorization override';
  const records=[{id:'review',file:'record.txt',sha256:sha256Hex(bytes)}];
  const clean=createFixture(t,{'src/main.ts':'export const x=1;'},{policyOverrides:{qualificationRecords:records}});
  const recordsRoot=join(clean.root,'records');mkdirSync(recordsRoot);writeFileSync(join(recordsRoot,'record.txt'),bytes);
  const good=clean.invoke('qualification',['--records-root',recordsRoot]);
  assert.equal(good.status,0,good.stderr);
  writeFileSync(join(recordsRoot,'record.txt'),'changed');
  const changed=clean.invoke('qualification',['--records-root',recordsRoot]);
  assert.equal(changed.status,21,changed.stderr);
  assert.equal(JSON.parse(changed.stdout).qualification,'refused');
  rmSync(join(recordsRoot,'record.txt'));
  const missing=clean.invoke('qualification',['--records-root',recordsRoot]);
  assert.equal(missing.status,21,missing.stderr);
  writeFileSync(join(recordsRoot,'record.txt'),bytes);
  const grant=createFixture(t,{'src/main.ts':'export const x=1;'},{capabilityGrants:[{path:'src/main.ts',capability:'business-client',qualificationRecord:'review'}],policyOverrides:{qualificationRecords:records}});
  const granted=grant.invoke('qualification',['--records-root',recordsRoot]);
  assert.equal(granted.status,21,granted.stderr);
  assert.ok(JSON.parse(granted.stdout).analysisErrors.some(e=>e.code==='grants-unsupported-in-checker'));
  const exception={id:'exception',rule:'resources/no-unowned-infrastructure',path:'src/main.ts',reason:'review',reviewedBy:'reviewer',reviewedOn:'2026-09-20',expires:'2026-10-20'};
  const excepted=createFixture(t,{'src/main.ts':"fetch('/reviewed');"},{exceptions:[exception],policyOverrides:{qualificationRecords:records}});
  const exceptional=excepted.invoke('qualification',['--records-root',recordsRoot]);
  assert.equal(exceptional.status,21,exceptional.stderr);
  const result=JSON.parse(exceptional.stdout);
  assert.ok(result.analysisErrors.some(e=>e.code==='qualification-exceptions-refused'));
  assert.ok(result.violations.some(v=>v.detector==='module-load-io'));
  assert.equal(result.excepted.length,0);
  assert.equal(result.rules.enforcedCount,0);
});

test('a policy symlink outside the project cannot hide its inside-project realpath', t => {
  const fix=createFixture(t,{'src/main.ts':'export const x=1;'});
  const inside=join(fix.projectDir,'policy.json');writeFileSync(inside,readFileSync(fix.policyFile));
  const alias=join(fix.root,'alias.json');symlinkSync(inside,alias);
  const child=fix.invoke('qualification',['--policy',alias]);
  assert.equal(child.status,21,child.stderr);
  assert.ok(JSON.parse(child.stdout).analysisErrors.some(e=>e.code==='policy-inside-project'));
});

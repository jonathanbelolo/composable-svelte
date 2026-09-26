import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {EXIT, LIMITS, isQualificationPass, runCheck} from './check.mjs';
import {DETECTOR_CATALOG, isValidFinding, isValidLimitation} from './detector-catalog.mjs';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createProjectFixture(t, files, {policyOverrides = {}, exceptions = []} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arch-cli-analysis-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const projectDir = join(root, 'project');
  const policyFile = join(root, 'policy.json');

  const defaultFiles = {
    'package.json': JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: {
        '@composable-svelte/core': '0.13.0',
        svelte: '5.57.0'
      }
    }),
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'es2022', module: 'esnext'}}),
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: '0.13.0',
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
    policyId: 'test-policy',
    policyVersion: '1.0.0',
    supportedCore: {
      min: '0.13.0',
      maxExclusive: '0.14.0-0'
    },
    project: {
      tsconfig: 'tsconfig.json',
      roots
    },
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
    capabilityGrants: [],
    qualificationRecords: [],
    exceptions,
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0', provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ],
    ...policyOverrides
  };

  const policyText = JSON.stringify(policyData, null, 2);
  writeFileSync(policyFile, policyText);
  const policySha = sha256Hex(Buffer.from(policyText, 'utf8'));

  return {
    projectDir,
    policyFile,
    policySha,
    args: (mode = 'analysis-only', version = '0.13.0') => [
      '--mode', mode,
      '--project', projectDir,
      '--policy', policyFile,
      '--policy-sha256', policySha,
      '--expected-core-version', version,
      '--today', '2026-09-21'
    ]
  };
}

test('clean managed Root and Host path completes with exit 0 and complete analysis', (t) => {
  const {args} = createProjectFixture(t, {
    'App.svelte': `<script>
      import {ApplicationRoot, ApplicationHost} from '@composable-svelte/core/application';
      const options = {initial: {input: 0}, dependencies: {}};
    </script>
    <ApplicationRoot {options}>
      {#snippet children(app)}<ApplicationHost {app} />{/snippet}
    </ApplicationRoot>`
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.success, outcome.stderr);
  assert.equal(outcome.result.outcome, 'analysis-complete');
  assert.equal(outcome.result.qualification, 'not-evaluated');
  assert.equal(outcome.result.violationsComplete, true);
  assert.deepEqual(outcome.result.violations, []);
  assert.deepEqual(outcome.result.excepted, []);
  assert.deepEqual(outcome.result.limitations, []);
  assert.deepEqual(outcome.result.analysisErrors, []);
  assert.equal(outcome.result.rules.enforcedCount, 5);
  assert.deepEqual(outcome.result.rules.unavailableEvaluators, []);
  assert.equal(isQualificationPass(outcome.result), false);
});

test('routing family: traversal listeners and history writes emit violations', (t) => {
  const {args} = createProjectFixture(t, {
    'Nav.svelte': `<script>
      function traverse() { history.pushState({}, '', '/next'); }
    </script>
    <svelte:window onpopstate={traverse} />`
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.violations);
  assert.equal(outcome.result.violationsComplete, true);
  const routingFindings = outcome.result.violations.filter((f) => f.rule === 'routing/no-manual-browser-authority');
  assert.ok(routingFindings.some((f) => f.detector === 'traversal-listener'));
  assert.ok(routingFindings.some((f) => f.detector === 'history-write'));
});

test('presentation family: rendered store subscription violates but inert snippet stays clean', (t) => {
  const inert = createProjectFixture(t, {
    'Inert.svelte': `<script>
      import {useApplication} from '@composable-svelte/core/application';
      const app = useApplication({});
    </script>
    {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}`
  });
  const inertOutcome = runCheck(inert.args());
  assert.equal(inertOutcome.exitCode, EXIT.success);
  assert.equal(inertOutcome.result.violations.length, 0);

  const rendered = createProjectFixture(t, {
    'Rendered.svelte': `<script>
      import {useApplication} from '@composable-svelte/core/application';
      const app = useApplication({});
    </script>
    {#snippet row(store)}{@const stop = store.subscribe(() => {})}{store.state}{/snippet}
    {@render row(app.store)}`
  });
  const renderedOutcome = runCheck(rendered.args());
  assert.equal(renderedOutcome.exitCode, EXIT.violations);
  assert.ok(renderedOutcome.result.violations.some((f) => f.rule === 'presentation/no-subscription-orchestration' && f.detector === 'view-subscribe'));
});

test('reducers family: mutation violates, pure decision without mutation stays clean', (t) => {
  const mut = createProjectFixture(t, {
    'reducer.ts': `
      import type {Reducer} from '@composable-svelte/core';
      type State = {count: number};
      type Action = {type: 'inc'};
      export const reducer: Reducer<State, Action> = (state) => {
        state.count++;
        return [state];
      };
    `
  });
  const mutOutcome = runCheck(mut.args());
  assert.equal(mutOutcome.exitCode, EXIT.violations);
  assert.ok(mutOutcome.result.violations.some((f) => f.rule === 'reducers/pure-decisions' && f.detector === 'state-mutation'));

  const pure = createProjectFixture(t, {
    'reducer.ts': `
      import type {Reducer} from '@composable-svelte/core';
      type State = {count: number};
      type Action = {type: 'inc'};
      export const reducer: Reducer<State, Action> = (state) => {
        return [{count: state.count + 1}];
      };
    `
  });
  const pureOutcome = runCheck(pure.args());
  assert.equal(pureOutcome.exitCode, EXIT.success);
  assert.equal(pureOutcome.result.violations.length, 0);
});

test('resources family: unowned fetch in view or module load emits violation', (t) => {
  const {args} = createProjectFixture(t, {
    'View.svelte': `<script>
      function load() { fetch('/api/items'); }
    </script>
    <button onclick={load}>Load</button>`
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.violations);
  assert.ok(outcome.result.violations.some((f) => f.rule === 'resources/no-unowned-infrastructure' && f.detector === 'view-io'));
});

test('motion family: transition imports and directives emit violations', (t) => {
  const {args} = createProjectFixture(t, {
    'Motion.svelte': `<script>
      import {fade} from 'svelte/transition';
    </script>
    <div transition:fade>fade</div>`
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.violations);
  const motionViolations = outcome.result.violations.filter((f) => f.rule === 'motion/no-competing-playback');
  assert.ok(motionViolations.some((f) => f.detector === 'svelte-motion-import'));
  assert.ok(motionViolations.some((f) => f.detector === 'transition-directive'));
});

test('opaque decision call limitation is retained as review obligation with exit 0', (t) => {
  const {args} = createProjectFixture(t, {
    'reducer.ts': `
      import type {Reducer} from '@composable-svelte/core';
      declare function opaqueHelper(): void;
      export const reducer: Reducer<{count: number}, {type: 'act'}> = (state) => {
        opaqueHelper();
        return [state];
      };
    `
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.success, outcome.stderr);
  assert.equal(outcome.result.violations.length, 0);
  assert.equal(outcome.result.analysisErrors.length, 0);
  assert.equal(outcome.result.violationsComplete, true);
  assert.equal(outcome.result.limitations.length, 1);
  assert.equal(outcome.result.limitations[0].code, 'opaque-decision-call');
  assert.equal(outcome.result.limitations[0].path, 'reducer.ts');
  assert.ok(outcome.result.limitations[0].span);
});

test('unsupported template boundary yields analysis error while preserving positive violations', (t) => {
  const {args} = createProjectFixture(t, {
    'Bad.svelte': `<script>
      import {ApplicationRoot} from '@composable-svelte/core/application';
      import {fade} from 'svelte/transition';
      const props = {options: {dependencies: {}}};
    </script>
    <ApplicationRoot {...props}/>
    <div transition:fade>competing</div>`
  });
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.violationsComplete, false);
  assert.ok(outcome.result.analysisErrors.some((e) => e.construct === 'unsupported-framework-prop-spread'));
  assert.equal(outcome.result.rules.enforcedCount, 0);
  assert.equal(outcome.result.rules.unavailableEvaluators.length, 5);
  assert.ok(outcome.result.violations.some((v) => v.detector === 'svelte-motion-import'));
  assert.ok(outcome.result.violations.some((v) => v.detector === 'transition-directive'));
});

test('prerequisite core mismatch prevents semantic evaluation and reports 0 enforced', (t) => {
  const {args} = createProjectFixture(t, {
    'src/main.ts': 'export const x = 1;'
  });
  const outcome = runCheck(args('analysis-only', '0.13.0-next.2'));
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.rules.enforcedCount, 0);
  assert.equal(outcome.result.rules.unavailableEvaluators.length, 5);
  assert.equal(outcome.result.violationsComplete, false);
  assert.ok(outcome.result.analysisErrors.some((e) => e.code === 'core-version-mismatch'));
});

test('graph failure with missing root prevents semantic evaluation', (t) => {
  const {projectDir, policyFile, policySha} = createProjectFixture(t, {
    'src/main.ts': 'export const ok = true;'
  }, {
    policyOverrides: {
      project: {tsconfig: 'tsconfig.json', roots: ['src/main.ts', 'src/missing.ts']}
    }
  });
  const outcome = runCheck([
    '--mode', 'analysis-only',
    '--project', projectDir,
    '--policy', policyFile,
    '--policy-sha256', policySha,
    '--expected-core-version', '0.13.0'
  ]);
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.rules.enforcedCount, 0);
  assert.ok(outcome.result.analysisErrors.some((e) => e.origin === 'graph'));
});

test('developer exception moves matching finding to excepted in analysis-only mode', (t) => {
  const exception = {
    id: 'ex-view-io-1',
    rule: 'resources/no-unowned-infrastructure',
    path: 'View.svelte',
    reason: 'approved third-party tracking',
    reviewedBy: 'security-reviewer',
    reviewedOn: '2026-09-20',
    expires: '2026-10-20'
  };
  const {args} = createProjectFixture(t, {
    'View.svelte': `<script>
      function track() { fetch('/telemetry'); }
    </script>
    <button onclick={track}>Track</button>`
  }, {exceptions: [exception]});

  const outcome = runCheck(args('analysis-only'));
  assert.equal(outcome.exitCode, EXIT.success, outcome.stderr);
  assert.equal(outcome.result.violations.length, 0);
  assert.equal(outcome.result.excepted.length, 1);
  assert.equal(outcome.result.excepted[0].exceptionId, 'ex-view-io-1');
  assert.equal(outcome.result.excepted[0].exceptionReason, 'approved third-party tracking');
  assert.equal(outcome.result.excepted[0].detector, 'view-io');
});

test('qualification mode is refused and rejects exceptions', (t) => {
  const exception = {
    id: 'ex-view-io-1',
    rule: 'resources/no-unowned-infrastructure',
    path: 'src/main.ts',
    reason: 'tracking',
    reviewedBy: 'rev',
    reviewedOn: '2026-09-20',
    expires: '2026-10-20'
  };
  const {args} = createProjectFixture(t, {
    'src/main.ts': 'export const x = 1;'
  }, {exceptions: [exception]});

  const outcome = runCheck(args('qualification'));
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.qualification, 'refused');
  assert.ok(outcome.result.analysisErrors.some((e) => e.code === 'qualification-exceptions-refused'));
  assert.equal(outcome.result.analysisErrors.some((e) => e.code === 'qualification-not-enabled'), false);
  assert.equal(isQualificationPass(outcome.result), false);
});

test('activating staged rule in policy is rejected at policy load', (t) => {
  const {projectDir, policyFile, policySha} = createProjectFixture(t, {
    'src/main.ts': 'export const x = 1;'
  }, {
    policyOverrides: {
      rules: {
        active: [
          {id: 'routing/no-manual-browser-authority', severity: 'error'},
          {id: 'presentation/no-subscription-orchestration', severity: 'error'},
          {id: 'reducers/pure-decisions', severity: 'error'},
          {id: 'resources/no-unowned-infrastructure', severity: 'error'},
          {id: 'motion/no-competing-playback', severity: 'error'},
          {id: 'presentation/no-fabricated-view', severity: 'error'}
        ],
        inactive: [
          {id: 'adapters/least-authority', reason: 'supported-replacement-pending', detail: 'staged'}
        ]
      }
    }
  });
  const outcome = runCheck([
    '--mode', 'analysis-only',
    '--project', projectDir,
    '--policy', policyFile,
    '--policy-sha256', policySha,
    '--expected-core-version', '0.13.0'
  ]);
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.ok(outcome.result.analysisErrors.some((e) => e.code === 'rule-not-activatable'));
});

test('detector catalog validates active rules and rejects unknown findings/limitations', () => {
  assert.equal(DETECTOR_CATALOG.length, 7);
  const active = DETECTOR_CATALOG.filter((r) => r.stage === 'active');
  assert.equal(active.length, 5);

  assert.equal(isValidFinding({rule: 'reducers/pure-decisions', detector: 'state-mutation'}), true);
  assert.equal(isValidFinding({rule: 'reducers/pure-decisions', detector: 'non-existent'}), false);
  assert.equal(isValidFinding({rule: 'presentation/no-fabricated-view', detector: 'fabricated-eval'}), false);
  assert.equal(isValidFinding({rule: 'unknown/rule', detector: 'state-mutation'}), false);

  assert.equal(isValidLimitation({code: 'opaque-decision-call'}), true);
  assert.equal(isValidLimitation({code: 'unknown-limitation'}), false);
  assert.equal(isValidLimitation(null), false);
});

test('public Effect.none stays pure through the real command entry and qualification passes', (t) => {
  const {args} = createProjectFixture(t, {'entry.ts': `import {Effect,type Reducer} from '@composable-svelte/core';
    const reducer: Reducer<{},{}> = state => [state,Effect.none()];`});
  const invoke = (argv) => spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), ...argv], {encoding: 'utf8'});
  const clean = invoke(args());
  assert.equal(clean.status, 0, clean.stderr);
  const result = JSON.parse(clean.stdout);
  assert.equal(result.violationsComplete, true);
  assert.deepEqual(result.limitations, []);
  assert.equal(result.qualification, 'not-evaluated');
  assert.equal(isQualificationPass(result, {policySha256: result.policy.sha256, expectedCoreVersion: '0.13.0', expectedCheckerVersion: result.checker.version}), false);

  const passed = invoke(args('qualification'));
  assert.equal(passed.status, 0, passed.stderr);
  const qualified = JSON.parse(passed.stdout);
  assert.equal(qualified.qualification, 'passed');
  assert.equal(qualified.exitCode, 0);
  assert.equal(qualified.qualificationScope, 'bounded-five-family-detectors');
  assert.equal(qualified.manualReviewRequired, true);
  assert.deepEqual(qualified.limits, LIMITS);
  assert.equal(isQualificationPass(qualified, {policySha256: qualified.policy.sha256, expectedCoreVersion: '0.13.0', expectedCheckerVersion: qualified.checker.version}), true);

  const usage = invoke([...args(), '--unknown', 'yes']);
  assert.equal(usage.status, 22);
  assert.equal(usage.stdout, '');
  writeFileSync(join(args()[3], 'entry.ts'), "fetch('/unowned');");
  const violation = invoke(args());
  assert.equal(violation.status, 20, violation.stderr);
  assert.ok(JSON.parse(violation.stdout).violations.some((v) => v.detector === 'module-load-io'));
});

test('undeclared opaque package provenance prevents semantic execution', (t) => {
  const {args} = createProjectFixture(t, {'entry.ts': "import {Effect} from '@composable-svelte/core'; Effect.none();"}, {policyOverrides: {opaquePackages: []}});
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.rules.enforcedCount, 0);
  assert.equal(outcome.result.evaluation.passes, 0);
  assert.ok(outcome.result.analysisErrors.some((e) => e.origin === 'graph'));
});

test('developer exceptions match exact rule and path and never hide analysis errors', (t) => {
  const exception = {id: 'approved-one-file', rule: 'resources/no-unowned-infrastructure', path: 'Allowed.svelte', reason: 'bounded review', reviewedBy: 'reviewer', reviewedOn: '2026-09-20', expires: '2026-10-20'};
  const {args} = createProjectFixture(t, {
    'Allowed.svelte': `<script>import {ApplicationRoot} from '@composable-svelte/core/application'; const props={}; fetch('/allowed'); history.back();</script><ApplicationRoot {...props}/>`,
    'Other.svelte': `<script>fetch('/other');</script>`
  }, {exceptions: [exception]});
  const outcome = runCheck(args());
  assert.equal(outcome.exitCode, EXIT.analysisError);
  assert.equal(outcome.result.excepted.length, 1);
  assert.equal(outcome.result.excepted[0].path, 'Allowed.svelte');
  assert.equal(outcome.result.excepted[0].exceptionId, exception.id);
  assert.ok(outcome.result.violations.some((v) => v.path === 'Other.svelte' && v.detector === 'view-io'));
  assert.ok(outcome.result.violations.some((v) => v.path === 'Allowed.svelte' && v.detector === 'history-write'));
  assert.ok(outcome.result.analysisErrors.some((e) => e.construct === 'unsupported-framework-prop-spread'));
});

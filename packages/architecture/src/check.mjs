// Consumer-architecture checker entry (development-only).
// Bounded architecture CLI evaluating the five active semantic rule families.
import {existsSync, realpathSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PARSER_VERSIONS, buildGraph} from './graph.mjs';
import {isBundledPolicySelector, loadBundledPolicy, resolveBundledPolicySelector} from './bundled-policy.mjs';
import {CATALOG_VERSION, CHECKER_KNOWN_CORE, RULE_CATALOG, checkCorePairing, compareVersions, dayNumber, isExactVersion, loadPolicy, relativePathProblem, ruleInventory, utcToday, verifyQualificationRecords} from './policy.mjs';
import {analyzeSemantics} from './semantics.mjs';
import {DETECTOR_CATALOG, KNOWN_LIMITATION_CODES, isValidFinding, isValidLimitation} from './detector-catalog.mjs';

export const EXIT = Object.freeze({success: 0, violations: 20, analysisError: 21, usage: 22});
export const MODES = Object.freeze(['analysis-only', 'qualification']);
export const SUPPORTED_PARSERS = Object.freeze({typescript: '5.9.3', svelte: '5.57.0'});
export const AVAILABLE_EVALUATORS = Object.freeze(DETECTOR_CATALOG.filter((rule) => rule.stage === 'active').map((rule) => rule.id));
export const QUALIFICATION_SCOPE = 'bounded-five-family-detectors';
export const MANUAL_REVIEW_REQUIRED = true;
export const LIMITS = Object.freeze([
  'staged-rules-catalog-only',
  'capability-grants-unsupported',
  'qualification-record-content-not-validated',
  'opaque-package-code-not-inspected',
  'opaque-package-contents-and-install-provenance-delegated-to-outer-materialization',
  'opaque-package-workspace-lockfile-and-install-configuration-not-inspected',
  'pinned-tarball-sha256-covers-the-policy-artifact-not-installed-package-contents',
  'package-resolution-limited-to-project-node-modules',
  'type-only-package-imports-not-verified',
  'unreachable-files-not-scanned',
  'vite-resolve-alias-not-modelled',
  'worker-query-targets-not-scanned',
  'root-and-lifetime-ownership-not-proved',
  'capability-authenticity-not-verified',
  'dynamic-component-reachability-not-scanned'
]);

const CHECKER_VERSION = '0.13.1';
const NEWLINE = String.fromCharCode(10);
const SHA256 = /^[0-9a-f]{64}$/;
const FLAGS = ['--mode', '--project', '--policy', '--policy-sha256', '--expected-core-version', '--records-root', '--today'];
const REQUIRED_FLAGS = ['--mode', '--project', '--policy', '--expected-core-version'];

class UsageError extends Error {}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.includes(flag)) throw new UsageError(`unknown argument: ${flag}`);
    if (value === undefined || value.startsWith('--')) throw new UsageError(`missing value for ${flag}`);
    if (values.has(flag)) throw new UsageError(`duplicate argument: ${flag}`);
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) throw new UsageError(`missing required argument: ${flag}`);
  }
  const policyArgument = values.get('--policy');
  // Any `bundled:` argument is a registry selector; it never falls back to an external path.
  const bundled = isBundledPolicySelector(policyArgument);
  const bundledEntry = bundled ? resolveBundledPolicySelector(policyArgument) : null;
  if (bundled && !bundledEntry) throw new UsageError('unknown bundled policy');
  if (bundled && values.has('--policy-sha256')) throw new UsageError('bundled policy uses its embedded pin; do not supply --policy-sha256');
  if (!bundled && !values.has('--policy-sha256')) throw new UsageError('external policy requires --policy-sha256');
  const options = {
    mode: values.get('--mode'),
    project: resolve(values.get('--project')),
    policy: bundled ? null : resolve(policyArgument),
    policySource: bundled ? 'bundled' : 'external',
    bundledPolicy: bundled ? bundledEntry.name : null,
    policySha256: values.get('--policy-sha256'),
    expectedCoreVersion: values.get('--expected-core-version'),
    recordsRoot: values.has('--records-root') ? resolve(values.get('--records-root')) : undefined,
    today: values.get('--today') ?? utcToday()
  };
  if (!MODES.includes(options.mode)) throw new UsageError(`--mode must be one of: ${MODES.join(', ')}`);
  if (bundled && options.mode === 'qualification') throw new UsageError('qualification requires an externally controlled policy and pin; bundled policy is developer feedback only');
  if (!existsSync(options.project) || !statSync(options.project).isDirectory()) throw new UsageError('--project must be an existing directory');
  if (!bundled && !SHA256.test(options.policySha256)) throw new UsageError('--policy-sha256 must be 64 lowercase hexadecimal characters');
  if (!isExactVersion(options.expectedCoreVersion)) throw new UsageError('--expected-core-version must be an exact SemVer release or prerelease without build metadata');
  if (Number.isNaN(dayNumber(options.today))) throw new UsageError('--today must be a YYYY-MM-DD calendar date');
  return options;
}

function assertParsers() {
  for (const [name, expected] of Object.entries(SUPPORTED_PARSERS)) {
    if (PARSER_VERSIONS[name] !== expected) throw new UsageError(`unsupported ${name} parser version: ${PARSER_VERSIONS[name]}; expected ${expected}`);
  }
}

const entry = (origin, error) => ({
  code: error.code,
  origin: error.origin ?? origin,
  path: error.path ?? null,
  where: error.where ?? null,
  span: error.span ?? null,
  construct: error.construct ?? null,
  specifier: error.specifier ?? null,
  message: error.message
});

function summarizeGraph(graph) {
  const edges = graph.modules.flatMap((item) => item.edges);
  const count = (kind) => graph.modules.filter((item) => item.kind === kind).length;
  return {
    roots: graph.roots,
    moduleCount: graph.modules.length,
    byKind: {js: count('js'), svelte: count('svelte'), ts: count('ts')},
    edgeCount: edges.length,
    literalDynamicImports: edges.filter((edge) => edge.kind === 'dynamic-import').length,
    assets: graph.assets,
    builtins: graph.builtins,
    packageSpecifiers: graph.packageSpecifiers,
    complete: graph.complete,
    modules: graph.modules
  };
}

function analyze(options) {
  const analysisErrors = [];
  const loaded = options.policySource === 'bundled'
    ? loadBundledPolicy(options.bundledPolicy, {today: options.today})
    : loadPolicy({policyPath: options.policy, policySha256: options.policySha256, projectRoot: options.project, today: options.today});
  analysisErrors.push(...loaded.errors.map((error) => entry('policy', error)));
  const policy = loaded.policy;
  let core = null;
  let graph = null;

  if (policy) {
    const pairing = checkCorePairing({projectRoot: options.project, supportedCore: policy.supportedCore, expectedCoreVersion: options.expectedCoreVersion});
    core = pairing.core;
    analysisErrors.push(...pairing.errors.map((error) => entry('pairing', error)));
    analysisErrors.push(...verifyQualificationRecords({policy, recordsRoot: options.recordsRoot, projectRoot: options.project}).map((error) => entry('records', error)));
    graph = buildGraph({projectRoot: options.project, roots: policy.project.roots, tsconfig: policy.project.tsconfig, opaquePackages: policy.opaquePackages});
    analysisErrors.push(...graph.errors.map((error) => entry('graph', error)));
    if (graph.errors.length === 0 && !graph.complete) {
      analysisErrors.push(entry('graph', {code: 'empty-analysis', message: 'reachable graph is smaller than the declared roots'}));
    }
    const reachable = new Set(graph.modules.map((item) => item.path));
    for (const [label, list] of [['grant', policy.capabilityGrants], ['exception', policy.exceptions]]) {
      list.forEach((item) => {
        if (!reachable.has(item.path)) {
          analysisErrors.push(entry('policy', {code: `${label}-target-unreachable`, path: item.path, message: `${label} path is not an exact file in the reachable graph`}));
        }
      });
    }
  }

  const inventory = policy ? ruleInventory(policy) : {active: [], inactive: []};
  const prerequisiteFailed = analysisErrors.length > 0 || !policy || !graph || !graph.complete;

  let semantics = null;
  const violations = [];
  const excepted = [];
  const limitations = [];

  if (!prerequisiteFailed) {
    semantics = analyzeSemantics({projectRoot: options.project, graph});
    if (!semantics || !['errors', 'findings', 'limitations'].every(key => Array.isArray(semantics[key]))) {
      analysisErrors.push(entry('semantic', {code: 'invalid-semantic-result', message: 'Semantic analysis must return explicit error, finding and limitation arrays.'}));
    }

    if (Array.isArray(semantics?.errors)) {
      for (const err of semantics.errors) {
        analysisErrors.push(entry('semantic', err));
      }
    }

    if (Array.isArray(semantics?.findings)) {
      for (const finding of semantics.findings) {
        if (!isValidFinding(finding)) {
          analysisErrors.push(entry('semantic', {
            code: 'unknown-detector',
            where: `${finding.rule ?? 'unknown'}/${finding.detector ?? 'unknown'}`,
            path: finding.path ?? null,
            span: finding.span ?? null,
            message: `finding emitted with unknown active rule or catalog detector: ${finding.rule} / ${finding.detector}`
          }));
          continue;
        }
        const match = (options.mode === 'analysis-only' && Array.isArray(policy?.exceptions))
          ? policy.exceptions.find((ex) => ex.rule === finding.rule && ex.path === finding.path)
          : null;
        if (match) {
          excepted.push({
            ...finding,
            exceptionId: match.id,
            exceptionReason: match.reason
          });
        } else {
          violations.push(finding);
        }
      }
    }

    if (Array.isArray(semantics?.limitations)) {
      for (const lim of semantics.limitations) {
        if (!isValidLimitation(lim)) {
          analysisErrors.push(entry('semantic', {
            code: 'unclassified-limitation',
            where: lim.code ?? 'unknown',
            path: lim.path ?? null,
            span: lim.span ?? null,
            message: `unclassified limitation code: ${lim.code}`
          }));
        }
        limitations.push(lim);
      }
    }
  }

  if (options.mode === 'qualification') {
    if (policy?.exceptions && policy.exceptions.length > 0) {
      analysisErrors.push(entry('qualification', {code: 'qualification-exceptions-refused', where: '$.exceptions', message: 'qualification mode does not permit policy exceptions'}));
    }
    if (policy?.capabilityGrants && policy.capabilityGrants.length > 0) {
      analysisErrors.push(entry('qualification', {code: 'qualification-grants-refused', where: '$.capabilityGrants', message: 'qualification mode does not permit capability grants'}));
    }
  }

  const requiredRuleIds = RULE_CATALOG.filter((rule) => rule.stage === 'active' && rule.required).map((rule) => rule.id);
  const hasAllEvaluators = requiredRuleIds.every((id) => inventory.active.some((r) => r.id === id))
    && inventory.active.length === requiredRuleIds.length
    && AVAILABLE_EVALUATORS.length === requiredRuleIds.length
    && requiredRuleIds.every(id => AVAILABLE_EVALUATORS.includes(id));

  const ready = !prerequisiteFailed
    && graph !== null && graph.complete === true && graph.modules.length > 0
    && semantics !== null && semantics.complete === true && semantics.converged === true
    && hasAllEvaluators
    && analysisErrors.length === 0;

  if (semantics && !ready && analysisErrors.length === 0) {
    analysisErrors.push(entry('semantic', {code: 'incomplete-semantic-analysis', message: 'Semantic analysis did not complete; detector coverage cannot be claimed.'}));
  }

  const enforcedCount = ready ? inventory.active.length : 0;
  const unavailableEvaluators = ready ? [] : inventory.active.map((rule) => rule.id);
  const violationsComplete = ready;

  let exitCode = EXIT.success;
  if (analysisErrors.length > 0) {
    exitCode = EXIT.analysisError;
  } else if (violations.length > 0) {
    exitCode = EXIT.violations;
  } else {
    exitCode = EXIT.success;
  }

  const outcome = analysisErrors.length > 0 ? 'analysis-error' : 'analysis-complete';
  let qualification;
  if (options.mode === 'analysis-only') {
    qualification = 'not-evaluated';
  } else {
    qualification = (ready && exitCode === EXIT.success && violations.length === 0 && excepted.length === 0)
      ? 'passed'
      : 'refused';
  }

  return {
    schema: 'composable-svelte/consumer-architecture-result',
    schemaVersion: 2,
    kind: 'architecture',
    mode: options.mode,
    outcome,
    qualification,
    exitCode,
    qualificationScope: QUALIFICATION_SCOPE,
    manualReviewRequired: MANUAL_REVIEW_REQUIRED,
    checker: {
      name: 'composable-svelte-consumer-architecture',
      version: CHECKER_VERSION,
      status: 'stable',
      ...PARSER_VERSIONS
    },
    policy: {
      id: policy ? policy.policyId : null,
      version: policy ? policy.policyVersion : null,
      schemaVersion: policy ? policy.schemaVersion : null,
      sha256: loaded.sha256,
      source: options.policySource,
      bundledProfile: options.policySource === 'bundled' ? options.bundledPolicy : null,
      capabilityGrantCount: policy && Array.isArray(policy.capabilityGrants) ? policy.capabilityGrants.length : null,
      exceptionCount: policy && Array.isArray(policy.exceptions) ? policy.exceptions.length : null
    },
    core,
    evaluation: {
      today: options.today,
      passes: semantics?.passes ?? 0,
      converged: semantics?.converged ?? false,
      zoneCounts: semantics?.zoneCounts ?? null
    },
    catalog: {
      version: CATALOG_VERSION,
      rules: DETECTOR_CATALOG
    },
    project: policy ? policy.project : null,
    graph: graph ? summarizeGraph(graph) : null,
    rules: {
      ...inventory,
      enforcedCount,
      unavailableEvaluators
    },
    violations,
    excepted,
    limitations,
    analysisErrors,
    violationsComplete,
    zoneCounts: semantics?.zoneCounts ?? null,
    limits: LIMITS
  };
}

// A trusted caller pins the executable, policy and materialization independently.
// This validates a result envelope, not the authenticity of arbitrary JSON.
export function isQualificationPass(result, expectations = {}) {
  try {
    if (!expectations || typeof expectations !== 'object' || Array.isArray(expectations)) return false;
    const {policySha256, expectedCoreVersion, expectedCheckerVersion} = expectations;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
    if (typeof policySha256 !== 'string' || !SHA256.test(policySha256)) return false;
    if (typeof expectedCoreVersion !== 'string' || !isExactVersion(expectedCoreVersion)) return false;
    if (typeof expectedCheckerVersion !== 'string' || !isExactVersion(expectedCheckerVersion)) return false;
    if (compareVersions(expectedCoreVersion, CHECKER_KNOWN_CORE.min) < 0 || compareVersions(expectedCoreVersion, CHECKER_KNOWN_CORE.maxExclusive) >= 0) return false;

    if (result.schema !== 'composable-svelte/consumer-architecture-result' || result.schemaVersion !== 2) return false;
    if (result.kind !== 'architecture' || result.mode !== 'qualification') return false;
    if (result.outcome !== 'analysis-complete' || result.qualification !== 'passed') return false;
    if (result.exitCode !== EXIT.success) return false;
    if (result.qualificationScope !== QUALIFICATION_SCOPE) return false;
    if (result.manualReviewRequired !== true) return false;

    if (!result.policy || typeof result.policy !== 'object') return false;
    if (result.policy.source !== 'external' || result.policy.schemaVersion !== 2) return false;
    if (result.policy.bundledProfile !== undefined && result.policy.bundledProfile !== null) return false;
    if (result.policy.sha256 !== policySha256) return false;
    if (typeof result.policy.id !== 'string' || result.policy.id.trim().length === 0) return false;
    if (typeof result.policy.version !== 'string' || !isExactVersion(result.policy.version)) return false;
    if (result.policy.capabilityGrantCount !== 0 || result.policy.exceptionCount !== 0) return false;

    if (!result.core || typeof result.core !== 'object') return false;
    if (result.core.paired !== true || result.core.installed !== expectedCoreVersion || result.core.expected !== expectedCoreVersion) return false;

    if (!result.checker || typeof result.checker !== 'object') return false;
    if (result.checker.version !== expectedCheckerVersion) return false;
    for (const [name, version] of Object.entries(SUPPORTED_PARSERS)) {
      if (result.checker[name] !== version) return false;
    }

    if (!result.catalog || typeof result.catalog !== 'object' || result.catalog.version !== CATALOG_VERSION) return false;
    if (!Array.isArray(result.catalog.rules) || result.catalog.rules.length !== DETECTOR_CATALOG.length) return false;
    const catalogSeen = new Set();
    for (const catRule of result.catalog.rules) {
      if (!catRule || typeof catRule !== 'object' || typeof catRule.id !== 'string') return false;
      if (catalogSeen.has(catRule.id)) return false;
      catalogSeen.add(catRule.id);
      const known = DETECTOR_CATALOG.find((k) => k.id === catRule.id);
      if (!known || catRule.stage !== known.stage) return false;
      if (!Array.isArray(catRule.detectors) || catRule.detectors.length !== known.detectors.length) return false;
      const detSet = new Set(catRule.detectors);
      if (detSet.size !== known.detectors.length) return false;
      for (const d of known.detectors) {
        if (!detSet.has(d)) return false;
      }
    }
    if (catalogSeen.size !== DETECTOR_CATALOG.length) return false;

    if (!result.rules || typeof result.rules !== 'object') return false;
    const requiredIds = RULE_CATALOG.filter((r) => r.stage === 'active' && r.required).map((r) => r.id);
    if (!Array.isArray(result.rules.active) || result.rules.active.length !== requiredIds.length) return false;
    if (result.rules.enforcedCount !== requiredIds.length) return false;
    if (!Array.isArray(result.rules.unavailableEvaluators) || result.rules.unavailableEvaluators.length !== 0) return false;
    const activeSeen = new Set();
    for (const rule of result.rules.active) {
      if (!rule || typeof rule !== 'object' || rule.severity !== 'error' || typeof rule.id !== 'string') return false;
      if (activeSeen.has(rule.id) || !requiredIds.includes(rule.id)) return false;
      activeSeen.add(rule.id);
    }

    const stagedIds = RULE_CATALOG.filter((r) => r.stage === 'staged').map((r) => r.id);
    if (!Array.isArray(result.rules.inactive) || result.rules.inactive.length !== stagedIds.length) return false;
    const inactiveSeen = new Set();
    for (const rule of result.rules.inactive) {
      if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string') return false;
      if (rule.status !== 'not-active' || !stagedIds.includes(rule.id) || inactiveSeen.has(rule.id)) return false;
      inactiveSeen.add(rule.id);
    }

    if (!result.evaluation || typeof result.evaluation !== 'object') return false;
    if (result.evaluation.converged !== true) return false;
    if (!Number.isInteger(result.evaluation.passes) || result.evaluation.passes <= 0) return false;

    if (!result.graph || typeof result.graph !== 'object') return false;
    if (result.graph.complete !== true) return false;
    if (!Number.isInteger(result.graph.moduleCount) || result.graph.moduleCount <= 0) return false;
    if (!Array.isArray(result.graph.roots) || result.graph.roots.length === 0) return false;
    const rootSet = new Set();
    for (const root of result.graph.roots) {
      if (typeof root !== 'string' || relativePathProblem(root) !== undefined) return false;
      if (rootSet.has(root)) return false;
      rootSet.add(root);
    }

    if (!Array.isArray(result.graph.modules) || result.graph.modules.length !== result.graph.moduleCount) return false;
    const moduleSet = new Set();
    for (const mod of result.graph.modules) {
      if (!mod || typeof mod !== 'object' || typeof mod.path !== 'string') return false;
      if (relativePathProblem(mod.path) !== undefined) return false;
      if (moduleSet.has(mod.path)) return false;
      moduleSet.add(mod.path);
    }

    if ([...rootSet].some(root => !moduleSet.has(root))) return false;

    if (!result.project || typeof result.project !== 'object' || !Array.isArray(result.project.roots)) return false;
    if (result.project.roots.length !== result.graph.roots.length) return false;
    for (let i = 0; i < result.project.roots.length; i++) {
      if (result.project.roots[i] !== result.graph.roots[i]) return false;
    }

    if (!Array.isArray(result.analysisErrors) || result.analysisErrors.length !== 0) return false;
    if (!Array.isArray(result.violations) || result.violations.length !== 0) return false;
    if (!Array.isArray(result.excepted) || result.excepted.length !== 0) return false;
    if (result.violationsComplete !== true) return false;

    if (!Array.isArray(result.limitations)) return false;
    for (const lim of result.limitations) {
      if (!lim || typeof lim !== 'object') return false;
      if (!KNOWN_LIMITATION_CODES.includes(lim.code)) return false;
      if (typeof lim.path !== 'string' || relativePathProblem(lim.path) !== undefined || !moduleSet.has(lim.path)) return false;
      if (typeof lim.message !== 'string' || lim.message.trim().length === 0) return false;
      if (!lim.span || typeof lim.span !== 'object') return false;
      const {start, end} = lim.span;
      if (!start || !end) return false;
      if (!Number.isInteger(start.offset) || !Number.isInteger(start.line) || !Number.isInteger(start.column)) return false;
      if (!Number.isInteger(end.offset) || !Number.isInteger(end.line) || !Number.isInteger(end.column)) return false;
      if (start.offset < 0 || end.offset < start.offset || start.line < 1 || end.line < start.line || start.column < 1 || end.column < 1) return false;
      if (start.line === end.line && end.column < start.column) return false;
    }

    if (!Array.isArray(result.limits) || result.limits.length !== LIMITS.length) return false;
    const limitsSet = new Set(result.limits);
    if (limitsSet.size !== LIMITS.length) return false;
    for (const item of LIMITS) {
      if (!limitsSet.has(item)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function runCheck(argv) {
  try {
    const options = parseArguments(argv);
    assertParsers();
    const result = analyze(options);
    const summary = `Architecture checker: mode=${result.mode} outcome=${result.outcome} qualification=${result.qualification} violations=${result.violations.length} excepted=${result.excepted.length} errors=${result.analysisErrors.length}`;
    return {exitCode: result.exitCode, result, stdout: JSON.stringify(result, null, 2) + NEWLINE, stderr: summary};
  } catch (error) {
    const label = error instanceof UsageError ? 'usage' : 'internal';
    return {exitCode: EXIT.usage, result: null, stdout: '', stderr: `Architecture checker ${label} error: ${error?.message ?? error}`};
  }
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const outcome = runCheck(process.argv.slice(2));
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr + NEWLINE);
  process.exitCode = outcome.exitCode;
}

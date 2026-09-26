// Bounded orchestration for the semantic helpers. This module assembles facts and
// findings; checker activation and qualification remain the CLI's responsibility.
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
import {createTypeSeeds} from './semantic-types.mjs';
import {createTemplateSeeds} from './template-seeds.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';
import {evaluateSemanticRules} from './rules/semantic-rules.mjs';
import {evaluateRoutingTemplate} from './rules/routing-template.mjs';
import {evaluateMotionSyntax} from './rules/motion-syntax.mjs';

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const offset = (item) => item.span?.start?.offset ?? -1;

function uniqueSorted(items, kind) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const discriminator = kind === 'finding'
      ? `${item.rule ?? ''}:${item.detector ?? ''}`
      : `${item.code ?? ''}:${item.construct ?? ''}`;
    const attribution = kind === 'finding'
      ? `${item.entryPath ?? ''}:${JSON.stringify(item.chain ?? [])}`
      : '';
    const key = `${item.path ?? ''}:${offset(item)}:${discriminator}:${attribution}:${item.message ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  result.sort((a, b) => compare(a.path ?? '', b.path ?? '') || offset(a) - offset(b)
    || compare(a.rule ?? a.code ?? '', b.rule ?? b.code ?? '')
    || compare(a.detector ?? a.construct ?? '', b.detector ?? b.construct ?? '')
    || compare(a.entryPath ?? '', b.entryPath ?? '')
    || compare(JSON.stringify(a.chain ?? []), JSON.stringify(b.chain ?? []))
    || compare(a.message ?? '', b.message ?? ''));
  return result;
}

function convergenceError(context, maxPasses) {
  const module = context.modules?.[0];
  const span = module && typeof module.span === 'function'
    ? module.span(0, 0)
    : {start: {line: 1, column: 0, offset: 0}, end: {line: 1, column: 0, offset: 0}};
  return {
    code: 'non-convergence',
    construct: 'semantic-orchestration',
    path: module?.path ?? '',
    span,
    message: `Semantic seed orchestration failed to stabilize within ${maxPasses} passes.`
  };
}

/**
 * Analyze one already-built, provenance-checked graph.
 *
 * The returned result is evidence only. `complete` means every bounded helper
 * completed without analysis errors; it is not a policy qualification verdict.
 */
export function analyzeSemantics({projectRoot, graph, maxPasses = 20, flowMaxPasses = 100}) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new TypeError('analyzeSemantics requires a non-empty projectRoot.');
  }
  if (!graph || typeof graph !== 'object') throw new TypeError('analyzeSemantics requires a graph.');
  if (!Number.isInteger(maxPasses) || maxPasses <= 0) throw new TypeError('maxPasses must be a positive integer.');
  if (!Number.isInteger(flowMaxPasses) || flowMaxPasses <= 0) throw new TypeError('flowMaxPasses must be a positive integer.');

  const routing = evaluateRoutingTemplate({projectRoot, graph});
  const motion = evaluateMotionSyntax({projectRoot, graph});
  const context = buildSemanticContext({projectRoot, graph});
  const graphErrors = graph.complete === true ? [] : [{
    code: 'incomplete-graph',
    construct: 'graph',
    path: '',
    span: null,
    message: 'Semantic analysis requires a complete provenance-checked module graph.'
  }];

  // A partial context lacks the symbol/origin interfaces required by every
  // semantic pass. Preserve its diagnostics and the independent syntax results.
  if (graph.complete !== true || !context.complete) {
    const errors = uniqueSorted([
      ...graphErrors, ...(context.errors ?? []), ...(routing.errors ?? []), ...(motion.errors ?? [])
    ], 'error');
    return {
      complete: false,
      converged: false,
      passes: 0,
      findings: uniqueSorted([...(routing.findings ?? []), ...(motion.findings ?? [])], 'finding'),
      errors,
      limitations: [],
      zoneCounts: null
    };
  }

  const framework = createFrameworkSeeds(context);
  let template;
  const flow = buildValueFlow(context, {
    maxPasses: flowMaxPasses,
    onInvoke(call, api) {
      const frameworkValue = framework.onInvoke(call, api);
      const templateValue = template ? template.onInvoke(call, api) : api.domain.empty();
      return api.domain.join(frameworkValue, templateValue);
    },
    onProperty: framework.onProperty
  });
  template = createTemplateSeeds(context, flow);
  const types = createTypeSeeds(context, flow, {
    onReducer: (node, value) => framework.addReducer(node, value, flow)
  });

  let passes = 0;
  let converged = false;
  while (passes < maxPasses) {
    const before = flow.revision;
    types.apply();
    template.apply();
    flow.solve();
    passes++;
    if (flow.revision === before) {
      converged = true;
      break;
    }
  }

  const zones = buildExecutionZones(context, flow, framework, {
    wiringSites: template.wiringSites,
    callbackSites: template.callbackSites,
    lifecycleSites: template.lifecycleSites,
    storedCallSites: template.storedCallSites
  });
  const semantic = evaluateSemanticRules({context, flow, zones});
  const errors = uniqueSorted([
    ...(context.errors ?? []), ...(flow.errors ?? []), ...(types.errors ?? []), ...(template.errors ?? []),
    ...(semantic.errors ?? []), ...(routing.errors ?? []), ...(motion.errors ?? []),
    ...(converged ? [] : [convergenceError(context, maxPasses)])
  ], 'error');
  const findings = uniqueSorted([
    ...(semantic.findings ?? []), ...(routing.findings ?? []), ...(motion.findings ?? [])
  ], 'finding');
  const limitations = uniqueSorted([...(semantic.limitations ?? []), ...(flow.limitations ?? [])], 'error');

  return {
    complete: graph.complete === true && context.complete && converged && flow.complete && errors.length === 0,
    converged,
    passes,
    findings,
    errors,
    limitations,
    zoneCounts: zones.zoneCounts
  };
}

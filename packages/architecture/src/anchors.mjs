// Public import identities, not spelling-based recognition of application helpers.
// Paired with the core range in policy.mjs. No private runtime imports are inspected.
import {CHECKER_KNOWN_CORE} from './policy.mjs';

export const ANCHOR_VERSION = 1;
export const ANCHOR_CORE_RANGE = CHECKER_KNOWN_CORE;
const CORE = '@composable-svelte/core';
const table = new Map();
const freeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function add(specifiers, names, metadata) {
  const value = freeze(metadata);
  for (const specifier of specifiers) for (const name of names) table.set(`${specifier}\0${name}`, value);
}
const root = [CORE];
const composition = [CORE, `${CORE}/composition`];
const navigation = [CORE, `${CORE}/navigation`];
const application = [`${CORE}/application`];
// Exact public constructor members. These construct descriptions; only the
// declared executor/mapper argument executes later under effect ownership.
const effectMember = (deferredArguments) => ({kind: 'effect-constructor', result: 'effect', deferredArguments});
add(root, ['Effect'], {kind: 'effect', members: {...Object.fromEntries([
  ['none', []], ['run', [0]], ['fireAndForget', [0]], ['batch', []],
  ['cancellable', [1]], ['debounced', [2]], ['throttled', [2]],
  ['afterDelay', [1]], ['subscription', [1]], ['cancel', []],
  ['cancelGroup', []], ['inGroup', []], ['prefixGroups', []], ['map', [1]],
  ['api', [2, 3]], ['apiFireAndForget', [2]], ['apiAll', [2, 3]]
].map(([name, deferredArguments]) => [name, {
  ...effectMember(deferredArguments),
  ...(name === 'subscription' ? {cleanupFromArguments: [1]} : {})
}])),
websocket: {kind: 'effect-namespace', members: {
  connect: effectMember([4]), disconnect: effectMember([]), send: effectMember([2, 3]),
  subscribe: effectMember([2]), subscribeToEvents: effectMember([2])
}}}});
add(root, ['Reducer'], {kind: 'reducer-type'});
add(root, ['Store'], {kind: 'authority-type', authority: 'store'});
add(root, ['createStore'], {kind: 'store-factory', optionsArgument: 0, optionsReducerPath: ['reducer'], dependenciesPath: ['dependencies'], result: 'store'});
add([`${CORE}/test`], ['createTestStore', 'TestStore'], {kind: 'store-factory', optionsArgument: 0, optionsReducerPath: ['reducer'], dependenciesPath: ['dependencies'], result: 'store'});
add(application, ['defineApplication'], {kind: 'application-factory', reducerArguments: [0], optionsArgument: 1, decisionPaths: [['initialState'], ['startup'], ['routing', 'serialize'], ['routing', 'request'], ['routing', 'writePolicy']], result: 'definition'});
add(application, ['useApplication'], {kind: 'application-instance', result: 'app'});
add(application, ['ManagedIntegrationBuilder'], {kind: 'builder', reducerArguments: [0], result: 'builder', methods: {with: {result: 'builder'}, forEach: {result: 'builder'}, build: {result: 'composition'}}});
add(application, ['ManagedComposition'], {kind: 'authority-type', authority: 'composition'});
add(application, ['ApplicationRoot'], {kind: 'root-component', attributes: {definition: {role: 'definition'}, options: {role: 'root-options', dependencyPaths: [['dependencies']], dataPaths: [['initial']]}}, childSnippet: {prop: 'children', parameters: [{index: 0, result: 'app'}]}});
add(application, ['ApplicationHost'], {kind: 'host-component', attributes: {app: {role: 'app-input'}}, childSnippet: {prop: 'children', parameters: []}});
add(application, ['FeatureViews'], {kind: 'feature-views-component', attributes: {store: {role: 'store-input'}, definition: {role: 'view-definition-input'}}, childSnippet: {prop: 'children', parameters: [{index: 0, result: 'views'}]}});
add(application, ['FeatureOutlet'], {kind: 'feature-outlet-component', attributes: {view: {role: 'feature-handle-input'}}, childSnippet: null});
add(application, ['ApplicationInstance'], {kind: 'authority-type', authority: 'app'});
add(application, ['ApplicationStore'], {kind: 'authority-type', authority: 'store'});
add(application, ['ChildView', 'PresentationView'], {kind: 'authority-type', authority: 'view'});
add(application, ['FeatureViewProps', 'PresentationFeatureViewProps', 'FeatureViewPropsOf'], {kind: 'feature-props-type', properties: {store: {authority: 'view'}, views: {authority: 'views'}, surface: {kind: 'surface-action'}}});
add(application, ['FeatureView'], {kind: 'authority-type', authority: 'feature-handle'});
add(application, ['ViewHandles'], {kind: 'authority-type', authority: 'views'});
add(application, ['defineViews'], {kind: 'view-definitions', result: 'view-definitions'});
add(application, ['optionalSlot', 'destinationSlot', 'keyedSlot', 'nestedSlot'], {kind: 'slot', result: 'slot'});
add([CORE, `${CORE}/application`, `${CORE}/navigation`], ['scopeTo'], {kind: 'view-scope', overloads: [{arity: 2, arguments: {store: 0, slot: 1}, result: 'view', capability: 'managed-projection'}, {arity: 1, arguments: {store: 0}, result: 'scope-builder', capability: 'legacy-fluent'}], methods: {into: {result: 'scope-builder'}, case: {result: 'legacy-view', capability: 'legacy-read-dispatch'}, optional: {result: 'legacy-view', capability: 'legacy-read-dispatch'}}});
add(application, ['managedDismissDependency'], {kind: 'managed-dismiss-factory', cleanupArgument: 0, result: 'dismiss-dependency', invokeResult: 'effect'});
add(navigation, ['scopeToOptional', 'scopeToDestination', 'scopeToElement'], {kind: 'view-scope', result: 'view'});
add(composition, ['scope'], {kind: 'reducer-combinator', reducerArguments: [4], decisionArguments: [0, 1, 2, 3], result: 'reducer'});
add(composition, ['scopeAction'], {kind: 'reducer-combinator', reducerArguments: [3], decisionArguments: [0, 1], result: 'reducer'});
add(composition, ['combineReducers'], {kind: 'reducer-map', argument: 0, result: 'reducer'});
add(composition, ['forEach'], {kind: 'reducer-config', argument: 0, reducerProperties: ['childReducer'], decisionProperties: ['getArray', 'setArray', 'extractChild', 'wrapChild', 'groupFor'], result: 'reducer'});
add(composition, ['forEachElement'], {kind: 'reducer-combinator', reducerArguments: [3], decisionArguments: [1, 2], result: 'reducer'});
add(navigation, ['ifLet'], {kind: 'reducer-combinator', reducerArguments: [4], decisionArguments: [0, 1, 2, 3], result: 'reducer'});
add(navigation, ['ifLetPresentation'], {kind: 'reducer-combinator', reducerArguments: [4], decisionArguments: [0, 1, 3], result: 'reducer'});
add(navigation, ['createDestination'], {kind: 'reducer-map', argument: 0, result: 'destination'});
add(navigation, ['integrate'], {kind: 'builder', reducerArguments: [0], result: 'builder'});
add(navigation, ['createDestinationReducer'], {kind: 'reducer-map', argument: 0, result: 'reducer'});
add([`${CORE}/application/motion`], ['defineMotionRecipe'], {kind: 'motion-recipe', result: 'motion-recipe'});
add([`${CORE}/application/motion`], ['useMotion', 'useMotionGroup'], {kind: 'motion-binding', result: 'motion-binding'});
add(['svelte'], ['onMount', 'onDestroy', 'beforeUpdate', 'afterUpdate'], {kind: 'lifecycle'});
add(['svelte'], ['tick'], {kind: 'lifecycle-promise', result: 'tick-promise', callbackMembers: {then: {callbackArguments: [0], lifecycle: 'tick'}}});

export function lookupAnchor(specifier, name) {
  return typeof specifier === 'string' && typeof name === 'string' ? table.get(`${specifier}\0${name}`) ?? null : null;
}

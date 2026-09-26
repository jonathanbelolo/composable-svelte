# Flow integration review: zones, barriers and reducer state taint

Bounded memo for whole-graph monotone zone and taint propagation (hooks onInvoke/onProperty, seeds seedBinding/seedNode). It reconciles U1-D04/D05/D08 with CHECKER-DECISIONS. No new detectors, rules or framework API.

## 1. Sinks classify edges; calls propagate execution

Zone membership is per function body and monotone: bodies gain zones, never lose them. Lexical containment seeds only non-function code: module statements are module-top-level; Svelte script statements, template expression units and snippet bodies are view. A function body is never seeded by its file; it gains zones only through edges from code already in a zone. Every identifier reference to a function-bearing binding and every function literal occurrence is classified as exactly one of:

- **direct-call** (`f()`, `new C()`, `f.call/apply`, IIFE, `{@render}`): the resolved callee body inherits every zone of the caller. Callees resolve through the value layer (bindings, property-precise containment, return summaries, class members by name, namespaces); an unresolvable callee yields no edge plus a limitation entry (§5).
- **barrier**: resolved function values enter the barrier's target zone, not the caller's (§2).
- **callback**: Svelte lifecycle and rune positions; same zones as the caller plus the lifecycle marker used by lifecycle-dispatch and lifecycle-mirror.
- **reference**: any other use (template attribute or directive, component prop, argument to an opaque callee or non-barrier core anchor, store into a non-local or tainted object) inherits the caller's zones; the checker cannot know when it runs.
- **storage** (initializer, assignment to a local binding, property of a local object or array literal, `return`, `export`, `this.x = fn` in a class body): no edge, only provenance.

An occurrence the classifier cannot place is `unsupported-construct/unmodelled-node`, keeping the D09 conservative direction. Bodies with no incoming edge stay in the service zone; location-based routing and motion detectors still evaluate them.

Result: reference-reachability stands; wiring and Effect sinks are barriers, not references; a call is execution in the caller's zone whatever expression contains it.

## 2. Barrier and callback sites

- **Effect**: every function value resolving into any argument of any member of the core `Effect` symbol (import, alias, destructure, re-export) enters effect-body. The argument expressions evaluate in the enclosing zone.
- **Decision positions**: `reducerArguments`, `decisionPaths`, `decisionArguments`, `reducerProperties`, `decisionProperties`, reducer-map values and type-resolved `Reducer` values enter reducer/decision.
- **Injection wiring**: store-factory `dependenciesPath` and the `dependencies` path of the `ApplicationRoot` `options` attribute (metadata missing, §6) enter injection-wiring.
- **Svelte lifecycle is not a barrier**: anchor kind lifecycle, `$effect|$effect.pre|$effect.root|$derived|$derived.by` and `tick().then` keep the caller's zone. `fetch` in `$effect` is view-io; dispatch there is lifecycle-dispatch.
- **Opaque callees never defer**: `memoize(() => fetch(u))` in a view stays view; `mount(App, { props: { dependencies } })` inherits module-top-level. Both are findings, not silence.

## 3. Wiring resolution: aliases, spreads, factories

The options expression is resolved with the taint lattice: identifier to the union of the binding's initializers and assignments (a `$props()` default counts; the external prop value is opaque and contributes nothing); parentheses, `as`, `satisfies`, `!`, conditional and logical to a union; object literals and spreads of resolvable objects to a property-precise merge; `import *` to namespace members. A computed key or unresolvable spread on the options or dependencies path is `unmodelled-node`. Opaque parts create no edge either way.

Direct calls inside the wiring expression (`createServices(cfg)`, `new Client(base)`, IIFE) run in the enclosing zone: the factory body, constructor and class field initializers are pulled into view or module-top-level; only function values in the return summary or on the constructed instance enter injection-wiring. A factory that only builds closures is clean; a factory statement calling `fetch` is flagged there with chain Root options, factory, call. A closure referenced from wiring and also called directly from a view holds both zones and is evaluated under each: the wiring reference stays clean, the direct call carries the finding.

## 4. Effect arguments versus eager factories

`Effect.run(async (dispatch) => …)` and `Effect.run(run)` place the resolved body in effect-body. `Effect.run(startLoad(deps))` pulls `startLoad` into reducer, judges its eager statements there, and places its returned function values in effect-body. `Effect.run(deps.load())` on an opaque injected service creates no edge and one limitation entry. A local wrapper such as `withRetry(fn)` follows its own body edges; a barrier inside it targets the same zone whichever zone the wrapper is evaluated under, so multi-zone wrappers stay context-insensitive.

## 5. Reducer state taint

`seedBinding` marks the first parameter of every recognized reducer as `state-param(root)`, destructuring leaves included. Propagation adds `state-param(descendant)` through identifier, literal member and element access, optional chains, destructuring, `for…of/in` bindings, element parameters of array-iteration callbacks on tainted receivers, and results of element-forwarding methods (`find|at|filter|slice|concat|flat|values|entries|toSorted|toReversed|with|map`). Copying forms (`{...t}`, `[...t]`, `Object.assign({}, t)`, `Array.from`, `slice`, `toSorted`, `toReversed`) yield a fresh untainted container whose own properties and elements stay descendant. Unknown methods or opaque callees over tainted values return descendant taint, never nothing. The `.state` and `.select()` read-stoppers apply to store, app and view taint only. The state-mutation detector targets member or element assignment, update, `delete`, `Object.assign(tainted, …)` and the mutating call list on any tainted receiver; reassigning a local binding is not mutation. Decision-zone calls whose callee resolves to nothing local (opaque `deps.load()`) go to a `limitations` list with path, span and chain: not findings, not errors, with the report stating that independent review of dependency calls is retained. Option callbacks and combinator lens arguments are not seeded (§6).

## 6. Anchor-table holes supported by the supplied docs

- `ApplicationRoot` lacks `optionsAttribute`, `dependenciesPath` and the `children(app)` snippet result `app`; `FeatureViews` lacks `children(views)` giving `views` (U1-D03, U1-D05).
- `tick` from `svelte` is absent although U1-D03 inspects `tick().then`.
- `decisionPaths`, `decisionArguments` and `decisionProperties` carry no parameter roles, so state-mutation cannot be seeded for `serialize`, lens setters or `forEach` helpers; report those parameters as unsupported until roles exist.

## 7. Scenarios (zone sets)

| Code | Zones | Outcome |
| --- | --- | --- |
| starter `load: async () => 42` prop default, `options={{ dependencies }}` | load {injection-wiring} | clean |
| `dependencies = createServices()` returning `{ load: () => fetch(u) }` | factory {view}; load {injection-wiring} | clean |
| factory runs `const p = fetch(u)`, returns `{ load: () => p }` | factory {view} | view-io at fetch |
| plus `onclick={() => dependencies.load()}` | load {injection-wiring, view} | view-io via onclick chain |
| `Effect.run(startLoad(deps))`, `Date.now()` eager in `startLoad` | startLoad {reducer}; returned fn {effect-body} | impure-primitive |
| `$effect(() => fetch(u))` | arrow {view} plus lifecycle | view-io |
| `const c = {...state}; c.items.push(a)` | {reducer} | state-mutation |
| `[...state.items].sort()`, `{...state, count: 2}` | {reducer} | clean |

## 8. Negative controls and honest limits

Required controls: every row above; spread, alias, IIFE and `new` wiring forms; `import *` services; `$props()` default versus external prop; computed options key (unsupported); dead closure with `fetch` (service zone, zero findings); local wrapper forwarding to `Effect`; a helper reachable from reducer and view (two attributions); `for…of` and `find()` result mutation; opaque `deps.load()` limitation entry; `mount` props inheriting module-top-level.

Documented unsupported or conservative forms: component and `mount` props as wiring; opaque wrappers inside wiring; computed keys; purity of injected callees; unreached bodies are unproven, not proven safe.

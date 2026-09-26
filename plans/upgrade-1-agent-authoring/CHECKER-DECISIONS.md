# Coordinator decisions: Upgrade 1 checker

Fable review U1-D01–D17 is the design input; this file resolves its open packaging/scope choices. It does not certify implementation.

- Create development tooling `@composable-svelte/architecture`, paired to core `0.13.0-next.1`, with bin `composable-svelte-architecture`. This is authoring tooling, not expansion of runtime companion capabilities. Keep parser dependencies and checker imports outside core browser bundles. Pin parser versions and qualify the actual packed executable.
- Accept the five-rule catalog: routing/no-manual-browser-authority; presentation/no-subscription-orchestration; reducers/pure-decisions; resources/no-unowned-infrastructure; motion/no-competing-playback. Rule completion means completion of explicitly documented detectors, not proof of all architecture responsibilities. Independent review remains required for uninspected focus/listener/observer/opaque-engine behavior and fabricated-authority casts.
- Retain staged presentation/no-fabricated-view and adapters/least-authority entries with no enforcement claim. Do not accept grants for unimplemented extension points. Qualification policies have no grants or exceptions; developer projects may use separately reviewed bounded exceptions. Unsupported analysis constructs cannot be excepted.
- Use schema/catalog version 2. Exact core prerelease pairing is mandatory; checker known range is [0.13.0-next.1, 0.14.0-0). Implement correct SemVer prerelease precedence, including numeric identifiers; reject malformed or ambiguous versions. Do not strip prerelease identifiers.
- Bundled starter policy is developer feedback, not independent qualification. Independent qualification requires an external pinned policy and trusted materialization. Only the orchestrator controls scan roots, package identity, policy, hidden tests and completion verdict.
- Reuse graph/policy substrate and preserve its negative controls. Semantic analysis may reparse graph modules into in-memory ASTs to avoid changing the graph's stable serializable result. Preserve source positions and scopes, cross-module imports/re-exports, alias propagation, function zones and diagnostic attribution. No regex-only architecture certification.
- Implement symbol/taint/zone analysis before rules. Unsupported forms fail closed with actionable diagnostics, and all supported propagation forms receive independent tests. Every detector needs a violating case and legitimate neighbour, plus alias/helper/re-export and missing-analysis controls. Avoid blanket bans on local visual state, ordinary DOM events, CSS, lifecycle hooks or service I/O.
- Do not activate motion detectors until the authoring guides explain the managed motion policy and the legacy explicit presentation bridge. Do not confuse a callback from Modal's presentation primitive with a nonexistent useMotion completion API.
- Starter remains the already-qualified minimal route-free managed counter. Do not apply Fable's stale starter sketch.
- Six construction/change runs qualify the current fixed-target surface only. Include explicit gap reporting for advanced unsupported motion, but do not count a gap report as delivery. Keep full AAM-15 and future-driver/default/shared-layout criteria open.

## Implementation ownership

1. Version and policy foundations: policy.mjs, new version.mjs, their tests; schema-v2 and known range. Keep current check entry updated only for necessary prerelease parsing, not evaluator activation.
2. Semantic foundations: new symbols/semantics modules and tests; read-only reuse of graph.mjs. Deliver a documented in-memory interface for rule evaluators. No policy or CLI edits in this slice.
3. Rule evaluators and CLI integration after both foundations pass independent checks. No available-evaluator claims until implementations and controls exist.
4. Packaging and consumer docs after the rule interface stabilizes. Move canonical tooling once, leaving explicit compatibility entry points where existing scripts need them.
5. Fresh-agent harness freezes only after packaged tooling passes adversarial controls and sealed functional rehearsal.

## Coordinator review corrections for semantic acceptance

Two interpretations in the initial Fable design need explicit controls before rule acceptance:

- A shallow copy creates a new container, not new descendants. `[...state.items].sort()` and `{...state, count: 2}` are legitimate. However, `const copy = {...state}; copy.items.push(x)` and `const items = [...state.items]; items[0].name = x` still mutate original state. `toSorted`/`toReversed` likewise preserve element aliases. Preserve descendant state provenance, or emit an explicit unsupported-analysis error for a form that cannot be modeled; never clear all descendant taint because a container was copied.
- Dependency wiring permits inert service implementations, not eager I/O during view setup or module evaluation. `{load: () => fetch(url)}` passed as dependencies is permitted. A factory that starts `fetch` immediately and returns `{load: () => pending}` is not exempt merely because its result becomes dependencies. Wiring exemptions apply to deferred service bodies; synchronous invocation during setup retains that execution zone. A factory that only creates closures remains legitimate. Per-reference checks must still catch a service also invoked directly from a view.

These are correctness clarifications of the existing pure-decision/resource boundary, not new runtime APIs. Add violating/conforming fixtures to the evaluator review. If the in-flight semantic proposal predates these clarifications, reconcile its behavior explicitly before acceptance.

Purity claim boundary: recognizing impure primitives and local helper bodies does not establish that an arbitrary injected or opaque callback is pure. A reducer calling an opaque `deps.load()` is not legitimized by dependency injection. Unless the analyzer resolves that implementation, report this as an explicit analysis limitation and retain independent source review of dependency calls; do not advertise the primitive detector as a proof of reducer purity. This is not permission for application authors to execute external work in reducers.

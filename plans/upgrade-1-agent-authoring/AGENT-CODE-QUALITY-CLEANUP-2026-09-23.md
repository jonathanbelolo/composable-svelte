# Agent-authored application cleanup proposal

Status: the first four user-facing tasks are implemented (proposal sections 1, 2, 6 and 5); see [original completion evidence](evidence/agent-code-quality-v1/ASSESSMENT.md). Remaining investigation is complete: the narrow async helper is tested but remains experimental; presentation lifecycle design defers public implementation to preserve parent invariants; owned-work diagnostics are implemented; all nine paired Gemini 3.8 trials with Opus 5.5 lead/review through Claude Code CLI are complete. The final three-file guidance/test follow-up is integrated and Opus-approved, with 32 packed browser tests, strict checks, build and SSR passing. See the [final report](evidence/gemini-opus-quality-pilot-v1/REPORT.md). No package publication.

Implementation closure (2026-09-24): all nine corrected implementations now pass strict checks, builds, architecture analysis, 387 authored tests and 369 independent checks. Opus approved every group and the integrated guide/checker fixes. Repeated search issuance fell from 26 sites to 9; feature source fell from 3,092 to 2,822 lines. See the [closure report and finding dispositions](evidence/agent-code-quality-completion-v1/REPORT.md). Original experiment results remain frozen.

## Objective

Reduce the number of independent correctness decisions an application-building agent must make. Shorter source is a secondary outcome. Explicit state, named domain actions, injected dependencies, genuine managed view authority and inspectable effect intents remain assets even when verbose. Evaluate first construction and later modification, with ordinary tool-error recovery allowed and recorded separately.

## Evidence and limits

The review examined the generated application/domain/editor/view/motion source for all six workers: final changed A1/B1/B2, frozen initial A2/B3, and the available rejected A3 working tree. These are different completion stages; do not rank their size as though they implemented identical requirements. No new visual review or performance benchmark was performed.

Final TypeScript/Svelte source including starter remnants, excluding CSS/tests: A1 580 lines across 9 files; B1 681 across 11; B2 660 across 10. Domain modules alone: 220, 253 and 313 lines respectively. These are reproducible size baselines, not measured removable boilerplate. B1 is a useful comparison implementation, not a certified universal template.

Existing managed execution already gates dispatch on resource liveness and cancellation (`packages/core/src/lib/execution/resources.ts`, `runCancellable`). Its runtime retains the owning token on dispatched actions (`execution/runtime.ts`). The turn queue revalidates owner tokens on enqueue/dequeue (`execution/turn-queue.ts`). This does NOT by itself prove every request-version check redundant: resource cancellation, owner invalidation, already-enqueued results and domain data freshness are different concerns.

The presentation guide explicitly describes manual `PresentationState` as a compatibility workflow. Generated B apps repeat entrance/exit actions, callbacks, phase guards and slot removal. This is the clearest candidate for moving mechanical work into the framework, while retaining application authorization of dismissal.

## Prioritized tasks

### 1. P0 — Establish an agent-oriented quality baseline

Create a separate quality rubric and source inventory; keep the original experimental scores unchanged. Label repetitions as (a) framework mechanism, (b) explicit business policy, or (c) cosmetic/scaffolding residue. Record the owner, replacement boundary and authority for each asynchronous operation and presentation.

Measure independent decisions/wiring sites, duplicated state invariants, unsupported API inventions, behavioral defects, repair interventions, model/tool cost, and change-locality. Count AST-level constructs as well as lines so formatting does not look like improvement. Retain readable action traces and scope mappings in every variant.

Acceptance: an evidence-backed inventory for A1 and B1/B2, with no claim that all repetition is removable. Additional generality probes should include independent parallel operations and two sibling editors with the same local operation name.

### 2. P0 — Prove the boundary of existing cancellation guarantees

Use paired reference-app variants to determine which request counters, callback abort checks and identity guards duplicate managed guarantees. Begin with an isolated same-owner, same-key latest request. Do not delete guards throughout the applications.

Required adversarial cases: transport ignores abort; old success/failure after replacement; A→B→A selection; owner replacement with the same domain ID; root destruction; sibling effects sharing a local ID; result already queued before cancellation; reentrant dispatch; search and detail completing in either order; save racing a list refresh. Cover the production managed queue and TestStore, not only a pure reducer harness.

Acceptance: a documented minimal safe pattern per case. Remove redundant checks only where evidence supports it. Keep request identity where external/replayed actions or queued work require it. Preserve revision/conflict checks and accepted-query provenance, which express domain meaning rather than cancellation. If stronger execution provenance is needed, propose it separately; do not quietly change FIFO acceptance semantics.

### 3. P1 — Prototype one narrow typed async-effect convenience

After task 2, assess whether repeated `try/await/catch` and success/failure mapping warrant a helper over existing managed effects. The proposed helper would accept a local operation key, an injected operation receiving its signal, and typed success/failure action constructors. Its name and signature are intentionally undecided.

Keep pending-state transitions and data-merging decisions in the reducer. Keep effects owner-local. Explicitly specify cancellation versus genuine failure handling, including late errors. Do not add a generic CRUD controller, hidden cache, automatic retry, singleton resource registry, or an alternative ownership system.

Acceptance: replace representative list/load/save wrappers in isolated reference copies; preserve action traces and all lifetime tests. Ship only if the helper reduces agent decisions and repair rate, not merely line count. A clearer canonical example is an acceptable outcome if the API adds more concepts than it removes.

### 4. P1 — Design a first-class managed presentation lifecycle

Prototype replacing the manual compatibility bridge used by the B editors. Mechanically derive presentation progress and bind visual completion to the exact managed owner and transition. Keep the application's decisions explicit: deny close during save, request discard confirmation, authorize exit, replace an editor, or remove immediately during navigation.

The application should not need to reproduce `entered`/`exited` plumbing and visual marker updates in every editor. Do not infer lifetime replacement from object-reference changes, let animation authorize a business close, or make teardown depend on a completion callback. A debug/test trace must expose exit authorization, completion and owner retirement even if authors no longer wire every action manually.

Acceptance: repeated dismissal, interrupted entrance, same-ID replacement, stale completion, reduced motion, missing/unmounted surfaces, parent removal, Host detach/reattach, root destruction and SSR isolation. Keep the existing explicit workflow usable while the new design is proven. This task needs a design review before implementation because it changes a lifecycle boundary.

### 5. P0 — Standardize state/data patterns in executable examples

Use discriminated unions for mutually exclusive request/save phases; retain independent booleans when their independence is real. Prefer derived selectors for dirty/locked/status feedback. Show normalized entities, stable identity order and accepted-result membership/provenance as separate concepts in collection examples.

Make concurrent data policy explicit. B1 merges incoming search records and restarts search after save; B2 avoids overwriting the loaded selected detail during search merges. These embody different freshness choices. Neither should become an undocumented universal merge helper. Specify when server revisions, local edits, detail responses and search membership are authoritative.

Acceptance: examples test filter/reorder stability, stale results, empty results, refresh after save, deletion and conflicting list/detail responses. Extract small pure collection operations only after repeated identical semantics are demonstrated; do not build a second state-management framework.

### 6. P0 — Make the supported path easy for agents to discover and modify

Update the installed agent entry point to route directly to minimal executable examples: async request, managed editor, routing, and collection identity. Each example names what the framework guarantees, what business policy remains, and which test proves it. Provide one default pattern per use case and explicit escape criteria. Typecheck/build/test examples against the packaged public exports so snippets cannot drift.

Supply a cleanup check for unused starter modules such as `counter.ts`, focused module boundaries and duplicated view projections. Avoid multiplying project-local wrappers or forcing a file per tiny function. Keep reducers/actions visible; favor descriptive local names over compressed generic configurations.

Acceptance: agents working from an installed package can find and extend the supported pattern without private repository knowledge or speculative API invention. Examples should use different domains from held-out evaluation tasks to reduce answer copying.

### 7. P1 — Improve diagnostics and reusable invariant tests

Provide precise diagnostics for demonstrated unsafe patterns and test fixtures for old-result delivery, owner replacement and teardown. Diagnostics should identify the violated guarantee, supported replacement and relevant example. Keep style/cleanup suggestions non-blocking; deterministic runtime/type checks are preferable to speculative lint rules.

Do not flag a captured service reference as executed I/O, reject all request counters, or claim static code inspection proves genuine runtime ownership. Test negative controls and ordinary valid patterns before enabling any new hard check. Helpers must preserve app-specific assertions rather than reduce every test to a generic pass flag.

Acceptance: planted ownership/cancellation defects are caught without rejecting valid variants; observable failures remain attributable to the actual operation and owner.

### 8. P0/P1 — Run a paired quality evaluation before adopting abstractions

Compare the current supported path, documentation/example cleanup alone, and each proposed API change independently. Match model settings and task difficulty; repeat enough independent runs to report variance. Use fresh domains and withheld modifications, including a second editor, concurrent background refresh, changed save policy and removal of animation.

Permit routine tool recovery in every condition, recording it separately from app quality. Evaluate semantic correctness, architectural ownership, code duplication, files/concepts touched by a change, invented APIs, intervention count, and token/tool cost. Review final code independently of which condition produced it. Preserve adversarial tests; do not substitute ordinary happy-path pass counts.

Acceptance: no regression in ownership/business invariants; fewer agent mistakes or lower modification effort. Report observed code reduction and uncertainty, not a promised percentage or a reliability claim from six runs. Adopt only independently beneficial changes.

## Expected reduction and order

There is no defensible measured percentage yet. Likely savings are in repeated async wrappers, mechanical presentation callbacks/actions, provably redundant guards and scaffold residue. Explicit action definitions, domain state, injected services, cancellation keys and conflict policies should mostly remain. Even a modest source reduction can be valuable if it eliminates several independent lifecycle decisions; a large reduction is harmful if it conceals them in an opaque DSL.

Start with tasks 1, 2, 5 and 6. Establish the evaluation protocol from task 8 immediately. Use those results to decide whether tasks 3 and 4 merit new APIs; introduce task 7 only around stable supported patterns. Finish by running task 8, publishing the measured deltas and updating the recommended authoring path. No new public helper is justified solely because multiple generated files look similar.

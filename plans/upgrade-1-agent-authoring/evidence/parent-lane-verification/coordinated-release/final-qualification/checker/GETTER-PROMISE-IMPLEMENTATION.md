# Handoff: bounded getter / Promise-executor support + Auth-only derivative preparation (Opus implementer)

> **Opus final review correction (2026-09-26):** "closes P30" holds only for explicit `throw` statements reachable in the
> executor's synchronous extent. Exceptions from implicitly invoked code (for example `toString` during coercion) are not
> traced; they reach only `catch` bindings, at parity with the base limitation. See `OPUS-FINAL-PROFILE-REVIEW.md` §2–§3 for the
> four corrected fail-open defects. The current corrected candidate is `6095ae2f…`.


> **Superseded:** the current final state is `FINAL-PROFILE-HANDOFF.md` (final candidate `b62cf88f…`, 9 selectors).


Date 2026-09-26. I did not edit git, main or publish, did not repack or edit the runtime, and made no App-A/App-B
source edits (the originals were only read). **This is not a final release or qualification claim.** No new checker
archive was packed: the final pack waits for the cleared Core/Auth manifest.

**The P6 candidate `9e7cd442…` is superseded as a source match.** The analyzer source changed after it was packed.

## 1. Status

| Item | State |
|---|---|
| Getter/executor support | Implemented within the assessment's bounded tier, and **stricter** than the assessment in two places (§2.3). 549/549 suite. 14/14 mutants killed. **Needs fresh independent review.** |
| Auth-only production derivative | Deterministic derivation script ready and **preliminarily** validated on the stable P6-era App-B snapshot with R6 Core/Auth: app check/test/SSR/build/browser pass, and exact Auth-only policy controls 12/12. **It must be re-derived from the final reviewed App-B (currently being edited) and focused-reviewed before any `auth` registration.** |
| `auth` profile | **Not registered.** |
| **New blocker for App-B** | The App-B reviewer's current edit uses `Promise.all` (`model.ts:118`). It stays refused; see `PROMISE-ALL-COORDINATION.md`. A parent or app decision is needed. |

## 2. Getter / Promise-executor support

### 2.1 Delta (before = `profile-phase/pre-getter-promise/`, after = current)

| File | Before | After |
|---|---|---|
| `src/expression-values.mjs` | `c5135591…` | `45fd04ee0d983860e5d62232a53397f2cf1e32289c8d2f2e9051e71de037d0e2` (+8: object-literal getter delegated to the flow service; refused without a service) |
| `src/semantic-flow.mjs` | `7f012f30…` | `1b564143f246167140437ae3cb9490123821624e97dee262fbf5a3ee7913211f` (+157/−1) |
| `src/getter-promise-compat.test.mjs` | new | `b02a6153d3805bb6eba5d98061c65ffe68cb670e2a1cfbd31a9fbba3817f9f03` (12 tests) |
| `CHANGELOG.md` | `e05bafa6…` | `762ebba0cc82753c210d1441583b4f535944429a7b0f09f4508d2e30b08b8cb0` |

No zone, rule, seed, template, catalog, policy or parser-dependency change.

### 2.2 Semantics

- **Alias getters.** `get k() { return <local non-rune binding>; }`, with `(`, `as`, `satisfies`, `!`, `<T>` and
  `<T>x` erased.
  - **Slot value:** the getter's return set, which is identical to the data property `k: binding` under
    flow-insensitive binding values.
  - **Still refused:** every other body (effects, member chains, globals, `this`, extra statements, `arguments`),
    setters, computed names, class accessors and rune bindings.
- **`new Promise(executor)`.**
  - **Supported executor:** exactly one non-spread argument, whose every atom is a local synchronous non-generator
    function. Locality is checked **after convergence**, so P36 (a factory call result) passes.
  - **Execution:** the executor is invoked with fresh `promise-settle` functions. `resolve(v)` joins `v` into the
    existing `promiseValues`, so `await` sees it. Zones are unchanged: the existing caller→callback edge already
    attributes executors.
- **Post-convergence checks. All are fail-closed.**
  - **`promise-resolution`:** deep resolved values must be only heap/literal/state. A resolved value can never carry
    authority, functions, namespaces or Promises.
  - **`promise-rejection`:** deep rejected values must be only heap/literal.
  - **`promise-thenable`:** a non-data `then` member.
  - **`promise-settle`:** a spread settle argument, or more than one argument.
  - **`promise-settle-escape`:** a settle function reaching an argument of any non-local callee, a non-identifier
    assignment target, an object or array literal, or a function return. Member access on settle functions is refused
    as `promise-operation`.
  - **`promise-executor-throw` (closes P30):** every `throw` in the executor's **synchronous extent** must throw plain
    heap/literal data. The extent covers the executor, transitive local callees (including bound and `.call`
    targets), callbacks handed to uninspected or array callees, and every function inside a class constructed there.
  - **`promise-operation`:** a non-local, async, generator, spread or non-`new` executor; `.then`; and every
    combinator (`all`, `race`, `withResolvers`, …).

### 2.3 Reconciliation with `GETTER-PROMISE-ASSESSMENT.md` (the independent assessor)

- **Sites, getter scope, settle confinement, zones and the P36 deferral match its §4.**
- **Stricter on P30.** The assessment treated an executor `throw` as at parity with the base checker's plain
  `throw`→`catch` gap. Per the coordinator ("cannot call pre-existing throw limitation a reason"), the executor throw
  channel is refused through the synchronous-extent check.
- **Stricter on resolution.** The assessment kept authority resolution complete, with the rule findings. I refuse it,
  because `semantic-rules.mjs` `deep()` does not follow `async-result`. An authority-resolved Promise handed to
  opaque code would otherwise be a new unflagged escape. The existing rule findings are still reported next to the
  refusal (P1–P3, P6, P28, X6, X11).
- **P27 (a resolver wrapped in a closure that forwards an external argument).** It stays complete. A parity test
  proves identical results to base closure capture of an opaque callback parameter. That is the existing named
  limitation "behavior of … unresolved callbacks" (README). Executors add no new channel for it.
- **Escalated, pre-existing base gaps, not widened and not fixed here.** They are asserted unchanged in documentation
  controls so any change is noticed:
  - `Object.defineProperty` accessor descriptors (assessment G17);
  - action-payload linkage (G21);
  - plain `throw`→`catch` (P8-parity).

### 2.4 Evidence (`profile-phase/P7-getter-promise/`)

- **Suite:** `npm test` 549/549 (`profile-phase/P7-suite.log`). No existing test changed. `expression-values.test.mjs`
  still proves the no-service refusal.
- **Tests:** `getter-promise-compat.test.mjs` contains:
  - getter data-property **parity pairs**: location write, destructure, spread, clock, reassigned binding, local
    function, and instantiated function;
  - store, escape and cross-module positives, and the real dependency shape;
  - 10 refused getter forms;
  - a flow-level check that a resolved heap reaches `await`;
  - executor zone positives: reducer, view, and a named executor;
  - App-B-shaped and factory/parameter executor positives;
  - 9 authority-resolution refusals and the thenable refusal;
  - 3 rejection refusals and 7 executor-throw refusals: direct, helper, array callback, opaque callback, bound
    function, class constructor, and local try;
  - 10 settle-escape refusals, including externally supplied targets and `window`;
  - 7 executor-form refusals;
  - the P27 parity test and the documentation controls.
- **Mutants:** 14/14 killed (`mutation-results.txt`, `mutants.py`). Each disables one rule: resolve/reject kinds, the
  throw check, the three extent rules, the two escape families, getter restriction/slot/rune, deferred locality,
  resolution joining, and deep checking.
- **Probes (scratch):** the prototype probe matrix plus my X1–X17 adversarial probes behave as designed.
- **Real inputs (working-source checker; preliminary, not final evidence).**
  - **App-A**, P6 copy equal to App-A `src`, exact `chat-code-media` policy: exit 0, `passed`.
  - **App-B**, the P6-era `src`, external Auth+Charts policy: exit 0, `passed`.
  - **App-B's current in-progress `src`:** exit 21, the only error being `Promise.all` at `model.ts:118` (§1).

## 3. Auth-only production derivative (parent AUTH INPUT AUTHORIZATION)

- **Deterministic derivation.** `profile-phase/auth-derivative/derive-auth-only.mjs` applies ~35 exact edits, each
  asserted to match once, and fails loudly on drift.
- **Removed: only the Charts integration.**
  - the `@composable-svelte/charts` import;
  - the `chart` state, action, slot, reducer composition, and initial/reset state;
  - `selectedMetric` and the chart selection handler;
  - `ChartView` and its view registration;
  - the chart section, selection banner and their CSS;
  - the charts dependency.
- **Kept:**
  - Auth feature composition and views;
  - parent account ownership: `startAccountLoad`/`retireAccount`, the request epoch and cancellation;
  - the injected services and account `metrics` data;
  - login, MFA, password, logout, routing and loading behavior.
- **Tests adapted:**
  - the 2 chart-only unit tests and 1 chart-only browser test were removed;
  - chart assertions were removed from Auth and account tests;
  - the SSR "Recent Login Activity" assertion now checks `account-card`.
- **Package name:** `final-account-dashboard-auth-only-production-derivative`.
- **Preliminary run.** Evidence is in `profile-phase/auth-derivative/preliminary-p6-snapshot/`: derivative source,
  `.derivation.json` with source and output hashes, logs, and `auth-derivative-controls.json`.
  - **Inputs:** the P6-era App-B snapshot, and R6 Core `729ca89f…` / Auth `dbb2611b…` (installed qualification
    pending) from local tarballs, byte-verified 1258/1258 and 404/404.
  - **App suites:** `check` 0/0, unit 13/13, SSR pass, build pass, **Playwright 7/7**.
  - **Checker controls (working source): 12/12.**
    - The exact proposed Auth-only policy `ab100ba5…` and `candidate-auth` pass.
    - Wrong pin, core, checker envelope, auth pin, auth approval, Svelte pin and missing root all reject.
    - **The original Auth+Charts App-B rejects under the Auth-only policy** at `ChartView.svelte:2` and
      `model.ts:21` (Charts unapproved), and still passes the external Auth+Charts policy.
- **Required next:**
  1. Re-run the derivation on the **final reviewed App-B**. Its current in-progress tests add chart-row assertions for
     `fetchActivity`, which will need adapting to `accountData.metrics`. The script stops on them today.
  2. Focused independent review of the derivative.
  3. Re-run on the cleared final Core/Auth and the final checker archive.
  4. Only then register `auth`, and repeat the affected profile, starter and archive controls.

## 4. Remaining gates

1. **Fresh independent review** of §2 (the analyzer delta) and of the derivative (§3).
2. **A `Promise.all` decision** (`PROMISE-ALL-COORDINATION.md`).
3. **Cleared final Core/Auth manifest.** After it: re-derive the derivative and register `auth` if it qualifies; then
   pack the final archive, inspect it, and repeat the installed starter, all-profile, author-app and auth controls.
4. **Coordinator decisions on the escalated base gaps** (plain `throw`→`catch`, `defineProperty` accessors, payload
   linkage). They are unchanged and outside the authorized scope.

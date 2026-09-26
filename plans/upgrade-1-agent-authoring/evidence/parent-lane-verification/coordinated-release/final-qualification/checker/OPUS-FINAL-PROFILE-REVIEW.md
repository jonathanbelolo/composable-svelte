# Opus final checker/profile review: `@composable-svelte/architecture` 0.13.1

Date 2026-09-26. Fresh independent reviewer (Opus 5.5). I started after the finalization worker (pid 36765) exited and
confirmed the source was quiescent: no package file was newer than the finalizer's archive `b62cf88f…`. Source hashes at
review start are in `opus-final-review/SOURCE-AT-REVIEW-START.sha256`.

No git, main, publish, runtime-archive or application-source edits were made. Final parent git/npm release and the
controlled application of this checker remain coordinator duties.

## Verdict

**The corrected candidate is `cd12784e…`.** It passed all scoped installed gates, and both focused independent
re-reviews of my corrections are CLEAR. **It is not accepted final.** Release acceptance is **blocked pending a parent
scope decision on B1/B2 (§3a)**. These are two further pre-existing fail-open template-binding channels of the same
impact class the parent judged release-blocking. They are not defaults, and I did not implement them, per the parent's
"report concrete scope instead of broadening" instruction.

Scope: starter, 7 individual companion profiles and chat-code-media, plus the separately reviewed external App-B
Auth+Charts policy.

- **Artifact history (all superseded ones kept and labeled):**
  - `b62cf88f…` (finalizer) was **not cleared**. §2 lists its four fail-open analyzer defects, corrected in source.
  - `f3c91ee6…` (corrections 1–4) is **superseded**. It is kept in
    `opus-final-review/final-archive-f3c91ee6-SUPERSEDED/` and its evidence in `evidence-f3c91ee6-SUPERSEDED/` and
    `app-gate/f3c91ee6-SUPERSEDED/`.
  - `cd12784e…` adds correction 5, the parent-directed refusal of template binding-pattern defaults (§2a).
- **Re-reviews:**
  - `opus-final-review/FOCUSED-CORRECTION-REREVIEW.md` (corrections 1–4): CLEAR, including its addendum.
  - `opus-final-review/FOCUSED-BINDING-DEFAULT-REREVIEW.md` (correction 5): the correction is CLEAR, including its
    addendum. It is the source of the B1/B2 release-scope report.
- **No full release qualification is claimed.** Every result is a scoped phase gate, and `fullQualificationClaimed`
  stays false.

### Current candidate artifact

| | Value |
|---|---|
| Path | `opus-final-review/final-archive/composable-svelte-architecture-0.13.1.tgz`, plus the content-addressed copy `final-archive/by-sha/cd12784e…/` used by App-A |
| sha256 | `cd12784eb9288aa510b2f980eb3d0ef57efce8c3d8d8318ab72cee32ce67e51a` |
| SRI | `sha512-LAm/0jRDaTNRUs+DIaRjp6J1RdUF/BPU/3qN+87tT5DifvxlAeWmtRj2Am91YsvAbkW1qs6IzwSRtcN/aeNpvw==` (npm pack and openssl agree) |
| Size / files | 99,447 bytes / 40 files |
| Inspection | `archive-matches-source`. All 9 archived policies equal their embedded pins, and no tests are packed (`final-archive/inspect.json` `db5862c5…`). |
| Source at pack | `opus-final-review/SOURCE-AT-PACK-v2.sha256`, re-verified unchanged after all gates |
| Suite | `npm test` **554/554** (`evidence-v2/suite.log`) |

### Policies (unchanged by this review; hashes verified from bytes)

| Selector | sha256 | Opaque approvals (all `registry` provenance) |
|---|---|---|
| starter | `f2821ebf0fa5cd34b346361089edd56bb4ec01a40c59eb969c60f90c7e77d190` | core 0.13.1, svelte **5.57.0** |
| chat | `4e958b18f465a2bb65cff36ecf97f76e66a7da3bed83942ef5397f0c9030436f` | core 0.13.1, chat 0.5.0, svelte 5.55.3 |
| code | `669cd1a15dcba7a7c3e6ebe572888e4611e0e214dd2e607c744076182762e437` | core 0.13.1, code 0.5.0, svelte 5.55.3 |
| media | `717854d1add64795bf06a7d8ecf73a768dd8fb717cf706b3846b0e5384b501c3` | core 0.13.1, media 0.5.0, svelte 5.55.3 |
| chat-code-media | `f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327` | core 0.13.1, chat/code/media 0.5.0, svelte 5.55.3 |
| maps | `6c60262dc74594255ba2d245b4a0b057edc008bb450ff7b4309a975b1d5c760a` | core 0.13.1, maps 0.3.0, svelte 5.55.3 |
| graphics | `5b66bb6ec3b309fba9f4696f07ac35f5f7b9c86e75520d11d9de966b2fe0f03b` | core 0.13.1, graphics 0.3.0, svelte 5.55.3 |
| charts | `853f929a63217a9667ec64e928dbd8767c15ad49ff82e75e802e4209e4398645` | core 0.13.1, charts 0.3.0, svelte 5.55.3 |
| auth | `ab100ba510f5cdc4931bca33e0dc398d21f1382010b51ed44242d30dc6846662` | core 0.13.1, auth 0.3.0, svelte 5.55.3 |
| **External only**, App-B, never bundled (`profile-phase/P1-policies/external-appb/app-b-auth-charts.json`) | `bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de` | core 0.13.1, auth + charts 0.3.0, svelte 5.55.3 |

**Checked mechanically against the baseline 0.13.0 starter.** Every policy (including the external one) has:

- identical `rules`: 5 active, and 2 inactive with unchanged reasons;
- identical `project` (root `src/main.ts`), schema and catalog;
- empty grants, records and exceptions;
- `supportedCore` `>=0.13.1 <0.14.0-0`, which is a pairing bound, not an approval.

**Registry:** it contains exactly these 9 selectors, frozen and pinned. The tests refuse Auth+Charts, the other
combinations and generic selectors.

**Parser dependencies:** exactly TypeScript 5.9.3 and Svelte 5.57.0, installed and verified in every checker host.

**No detector, rule, zone, seed or catalog change**, and no grants or exceptions.

## 1. Review scope and baseline

- **Baseline:** `/private/tmp/composable-final-qualification/repo/packages/architecture` (0.13.0).
- **Authoritative scoped delta:** `opus-final-review/OPUS-FINAL-SCOPED-CHECKER-DELTA.json` (`342b36ff…`, schema v2),
  28 files. Each file records its baseline, finalizer and final hashes and a "changed by this review" flag.
  - The `f3c91ee6` version of the delta is kept in the superseded directory.
  - Top-level `FINAL-SCOPED-CHECKER-DELTA.json` is a coordinator preview, as the coordinator clarified.
  - `package-lock.json` is the local parser-dependency install record; it is not packed.
- **Files changed by this review** (relative to the finalizer's state):

| File | Finalizer | Final |
|---|---|---|
| `src/semantic-context.mjs` | `711832a6…` (= baseline) | `8cdcdef380ad18e17c48517f0869168c7a0e4e761fdb8acf7740a45cd2fe03aa` |
| `src/semantic-flow.mjs` | `1b564143…` | `b58997fb0af0e7fe8a5cfb96497a1c9031ed3294f283f3bb1121e9cfa7d11e7b` |
| `src/symbols.mjs` | `2a844729…` (= baseline) | `401ec803cea0ab934ef8a85a9e6d1e6bb6b5511c23a1e75419cb8516b33e320d` |
| `src/instantiation-expression.test.mjs` | `5f861d16…` | `7d77ba7aa4547eaf46af0ed7f1f92eb430fd251becf792c9b46c8f1faf5bba2f` |
| `src/getter-promise-compat.test.mjs` | `b02a6153…` | `3b32033abc615df5f15430f04637d4e0541136a52aafbf8bfbc6465da45acbe8` |
| `src/template-binding-default.test.mjs` | absent | `9a91ba491889bae6891fcfad6e0e217d1c18030bb27cfe5b7a4e562cb3ef9776` |
| `README.md` | `dbd094ee…` | `f986d23a61fa435906662d595abb8781ef7fbc069d2e61e30533b8c63788e33f` |
| `CHANGELOG.md` | `6b92480e…` | `be7d8954cf50d414cec2d31facf439a05b815cd3b2c6f8e70f452e3cd5298ec6` |

- **Unchanged from the finalizer's delta and reviewed:**
  - `package.json`: version only, `3c016fc9…`;
  - `check.mjs`: `CHECKER_VERSION` only, `c966b7a5…`;
  - `bundled-policy.mjs`: `d64e226c…`;
  - `expression-values.mjs`: `45fd04ee…`;
  - the 9 policies;
  - the test version bumps;
  - the new bundled-policy and check tests;
  - `test/installed-bin-smoke.mjs` (`b8ec1556…`).
- **Diffs of my corrections:**
  - `CORRECTIONS-src.diff` (`018badf0…`);
  - `CORRECTIONS-symbols.diff` (`17c8345d…`);
  - `CORRECTIONS-tests.diff` (`84258ef1…`);
  - `CORRECTIONS-binding-default.diff` (`7e616280…`; relative to `f3c91ee6`).

## 2. Critical compatibility review: findings and corrections

All four defects were **fail-open**: they produced complete analysis with no findings where 0.13.0 refused. Each is
reproduced by probes in `opus-final-review/probes/`. `PKG=base` selects the unchanged 0.13.0 source.

1. **Instantiation expressions were marked non-runtime (blocker).**
   - **Cause:** `ts.isTypeNode(ExpressionWithTypeArguments)` is true, so `semantic-context.mjs` marked `f<T>` and its
     whole subtree `runtime: false`.
   - **Consequences:**
     - Bodies of instantiated generic functions were never evaluated. `(<T,>(x: T) => { location.href = …; fetch(…) })<string>` gave complete, 0 findings.
     - Direct calls escaped the rules' reference scan. `(crypto.getRandomValues<Uint8Array>)(buf)` and `(document.querySelector<HTMLElement>)('#x')` in a reducer gave complete, 0 findings.
   - **Fix:** `typeOnly` excludes `isInstantiationExpression(node)`. Heritage clauses stay type-only and keep their
     `class-inheritance` refusal. Every instantiated form now reports exactly its plain form's findings.
2. **Settle checks were keyed by call node.**
   - **Cause:** a site that can both reject and resolve (`const f = c ? rej : res; f(state)`) kept only the last kind.
     So a rejection carrying `state` data, which is forbidden because catch bindings are unmodeled, passed.
   - **Fix:** key by node and kind.
3. **Settle functions reaching Svelte templates were not escapes.**
   - **Cause:** `<button onclick={fire}>`, `<Ext onDone={fire}/>` and `bind:value={fire}` were complete. The documented
     invariant, settle functions stay local or go to inspected local functions, only looked at JS calls, non-identifier
     assignments, literals and returns.
   - **Fix:** a template unit whose root value holds a settle function is `promise-settle-escape`. This is conservative:
     `{#if fire}` and settle passed to a local child component are also refused.
4. **`arguments<T>` escaped the `arguments-object` refusal** (found by the focused re-review).
   - **Cause:** `symbols.mjs` treats an `isTypeNode` ancestor as a type position.
   - **Fix:** the same `isInstantiationExpression` exclusion. Type positions such as `typeof arguments` are still
     accepted.

**Regression evidence.**

- Each fix has a regression test comparing against the plain form or a control:
  `instantiation-expression.test.mjs` (+2 tests) and `getter-promise-compat.test.mjs` (+1 test).
- **Mutants M1–M4** (`opus-final-review/mutants/run.sh`, `RESULTS.txt` `e0155b2b…`): each revert fails exactly its new
  test.
- **Re-review:** the fresh focused independent re-review is CLEAR, covering all four corrections, the full suite, the
  mutants, the template-unit coverage (about 20 template channels refused) and import cycles.

**Verified sound, with no change needed** (my probe suites `p1`–`p5`, plus the finalizer's 12 + 1 tests and 14 mutants):

- **Alias getters:**
  - they are refused for runes (`$state`, `$props`, `$derived`), comma/`this`/effect bodies, setters, computed names and
    class accessors;
  - data-property parity holds for imports, parameters, late-declared functions and mount props.
- **Executors:**
  - non-`new` executors, async executors, generators, spread executors and non-local executors are refused after
    convergence;
  - `window.Promise`, `globalThis.Promise` and `Reflect.construct` still produce `authority-escape` findings, so they
    never pass clean;
  - alias `P = Promise` is modeled.
- **Resolution and rejection:** plain data only (deep), so authority, callables, Promises and thenables are refused.
- **Settle confinement:**
  - refused: rest arrays, the `arguments` object, `.bind`/`.call`/`.apply`, `Map.set`, `Object.assign`, class fields,
    tagged templates, closures returned, heap writes via local helpers, getter aliases and `this`;
  - modeled: `.apply` with a literal tuple, and bound local wrappers.
- **Executor throw extent:** covers local callees, bound functions, heap-held helpers, returned functions, array and
  opaque callbacks, and constructed classes.
- **Convergence ordering:** every Promise check is deferred, recomputed after each converged `solve()`, and the outer
  semantics loop re-solves until the revision is stable.
- **Existing five-rule semantics:** unchanged. No rule or detector file changed.

## 2a. Correction 5: template binding-pattern defaults are refused (parent decision)

- **Cause:** Svelte template binding patterns are synthetic `let <pattern>;` units that are `runtime:false`. Their default
  initializers were never evaluated, which has been true since 0.13.0. For example
  `{#snippet s(f: any = window.location)}…f.href='/x'…{@render s()}` or `{#each [{}] as {f = fire}}` passed complete with
  no findings, and this included Promise resolvers.
- **Guard (`semantic-context.mjs`):** in a binding unit, any `VariableDeclaration` or `BindingElement` initializer is
  `unsupported-construct` / **`template-binding-default`**. The diagnostic tells the user to pass the value explicitly or
  apply the default in script.
  - There are no new evaluation semantics, no detector change and no other machinery.
- **Forms covered:**
  - snippet parameters (plain, typed, destructured, nested, renamed, rest-nested);
  - `{#each}` destructuring;
  - `{@const}` destructuring;
  - `{:then}` / `{:catch}` destructuring;
  - `let:` array patterns (which were already refused as `implicit-children-fragment`).
- **Additional form, reported explicitly:** `{:then}`/`{:catch}` and `{@const}` destructuring defaults were the same
  skipped-default channel, found by my probe `p6` and by the re-reviewer. The single guard covers them. This is a refusal
  of skipped code, not broader support.
- **Positive controls, all still supported with their findings:**
  - ordinary no-default snippets (typed params);
  - `{#each}` with nested, rest, index and key;
  - `{#await}` then/catch;
  - explicit snippet arguments carrying authority, which still report `location-write`;
  - script parameter defaults, which are unaffected.
- **Tests:** `src/template-binding-default.test.mjs` has 10 negatives covering resolver, store-authority and
  location-authority defaults, plus the positive controls.
- **Mutation:** mutant **M5** (the guard disabled) is killed. M1–M5 each fail exactly one test (`mutants/RESULTS-v2.txt`
  `ef8d0388…`; re-confirmed by the re-reviewer after the `{@const}` test was added).
- **Real inputs:** the working-source checker on every retained real input (consumers, fixtures, the derivative, App-A
  and App-B) is unchanged, and a grep finds no binding defaults in them.
- **Docs:** README (supported syntax) and CHANGELOG (Changed) state the refusal and that no-default patterns are
  unaffected.

## 3. Limitations: named, not new approvals

**Pre-existing base limitations.** These are documented or asserted by the finalizer's documentation controls, are
unchanged, and are escalated to the coordinator:

- a plain `throw` into a `catch` binding;
- `Object.defineProperty` accessors;
- action-payload linkage;
- values that uninspected callees pass to callbacks (P27; a settle wrapped in a forwarding closure is at parity with base
  capture).

**Newly identified pre-existing base gaps.** They are reported here and not widened:

- **Async results passed to opaque code:** `sink(asyncFn())` where `asyncFn` returns authority gives no finding in 0.13.0
  either, because the rules' deep traversal does not follow `async-result`. Executor resolution is restricted to plain
  data, so executors add no channel.
- **Snippet and `{#each}` destructuring defaults (earlier listed here):** now **refused** by correction 5 (§2a).
- **Implicit calls are not traced:** `toString` or `valueOf` run during coercion are not in the executor throw extent. A
  value thrown there reaches only a `catch` binding, at parity with the base throw→catch limitation. The README now says
  this, instead of the earlier "anything thrown while the executor runs".
- **Directive names are not parsed as expressions:** `transition:`, `in:` and `animate:` directive names are not
  expressions. The motion rule always reports `transition-directive`, so these files never pass clean.

**Standing boundaries.**

- **Opacity is identity, not correctness:** opacity verifies package identity and installation, not a companion's
  internal correctness.
- **Manual review is still required:** `manualReviewRequired: true`, and the Fabricated-view and least-authority rules
  remain inactive with their reasons unchanged.
- **Physical microphone behavior** is not proven by the media profiles; it needs a real-device check.

## 3a. Release-scope report: B1 and B2 (open, pre-existing, not implemented)

Both were reproduced by the binding-default re-reviewer (`rereview-binding-default/r2`, `r5`, `r8`, `r9`). The base
0.13.0 behaves identically. Both are complete with no findings while a real authority write or subscription happens.
That is the same impact class the parent judged release-blocking.

- **B1: computed property keys inside binding patterns are never evaluated.**
  - **Examples:** `{#each [{}] as {[(window.location.href = '/x')]: f}}`, and the same shape in `{@const}`, `{:then}` or
    `{:catch}`, or with `history.pushState(…)` or `store.subscribe(…)`. The Svelte 5.57.0 compiler output contains these
    calls.
  - **Scope:** a `ComputedPropertyName` inside a `binding` unit. Rendered snippet params are already covered.
  - **Candidate bounded closure:** a refusal guard of the same shape, for example a `template-binding-computed-key`
    construct. It needs no new machinery. **Not applied without authorization.**
- **B2: `{#each}` item and `{@const}` values are not propagated at all.**
  - **Examples:** `{#each [{f: window.location}] as {f}}` with `f.href = …`, `{@const f = window.location}`,
    `{#each [store] as st}{st.subscribe(…)}` and `{#each [history] as h}` with `h.pushState(…)` all pass. The script
    `for…of` equivalent is detected.
  - **Why it matters here:** the refused `{#each … {f = window.location}}` default has an identical no-default twin that
    still passes.
  - **Options:** closing B2 requires either modeling each-item and `{@const}` values (new analysis machinery) or refusing
    ordinary each and `{@const}` bindings, which contradicts "ordinary no-default each remain supported". **This is a
    parent scope decision.**
- **Effect on real inputs:**
  - **B1:** no current real input contains a computed key in a binding pattern.
  - **B2 is present in both author apps:**
    - App-A `{#each}` at `src/Workspace.svelte:90,178,277`, over state data;
    - App-B `{@const state = app.store.state}` and the session `{@const}` bindings at `src/App.svelte:47–51`.

    Their template-bound values are not analyzed, so the apps' clean results do not cover those uses; the independent app
    source reviews do.

## 4. Final installed gates on `cd12784e…`

The gates were run by `opus-final-review/final-gates-v2.sh` (log `final-gates-v2.log`, exits `evidence-v2/exits.txt`).
Stages A–E ran uninterrupted and were supervised to completion in this turn. The orchestration tooling is unchanged from
the finalizer (`evidence-v2/tooling.sha256`).

- **Common to every gate:**
  - external `--policy` + `--policy-sha256`;
  - `--expected-core-version 0.13.1`;
  - the installed `isQualificationPass` with the expected pin, core 0.13.1 and checker 0.13.1;
  - never qualification through a bundled selector.
- **Runtime:** the R6 aggregate `archives-r6/MANIFEST.json` (`2813a209…`): Core `729ca89f…`, Auth `dbb2611b…`, Chat
  `fe21f00f…`, and 5 unchanged archives. It is installed from local tarballs and byte-verified. Transport is local
  candidate tarballs with registry-shaped specs; no registry retrieval is claimed.

1. **Profiles.** `evidence-v2/profiles/profile-qualification-receipt.json` = `bb19d108…`: **172/172**,
   `ALL_EXPECTATIONS_MET`.
   - The installed checker `cd12784e…` verified 40/40 files; the parser dependencies are 5.9.3 and 5.57.0.
   - The 8 input identities, including the default-root consumer host files and the production-consumer deltas, are
     byte-identical to the `f3c91ee6` run and to the finalizer's P9 run. All 172 (profile, input, label, exit, pass) rows
     are identical.
   - **Positives:**
     - default-root consumers of the unchanged shipped chat, code, media and chat-code-media recipes;
     - maps, graphics and charts production consumers with only the `onApp` hook removed.
   - **Original inputs stay rejected:** the ORIGINAL instrumented fixtures and the original auth consumer.
   - **Negatives, all rejected:** wrong pin, core 0.13.0, companion pin +1, companion absent, core 0.13.2, Svelte 5.57.0,
     missing root, starter approvals only, and the envelope checks.
   - **Bundled selectors:** `bundled:<p>` analysis is exit 0; bundled qualification is refused with exit 22.
2. **Checker-independent evidence reused, not rerun.** The inputs, source and runtime bytes are identical, and the
   checker is not part of the app runtime.
   - P9 consumer verification `3a3e39da…`.
   - P9 production-consumer equivalence `8bf3d313…` (non-vacuity established in P5).
   - Runtime matrix `matrix-r6/{minimum,newer}` (`f48048f0…` / `6e878bc8…`, 8/8 each).
   - Declaration proof `r6-declaration-check/RECEIPT.json` (`3636d06d…`).
3. **Real shipped starter** (`evidence-v2/starter/`).
   - The R6 core consumer, with the shipped pins core 0.13.1 and Svelte 5.57.0.
   - Installed core 1258/1258 and checker 40/40, with no symlinks; `package.json` was restored to the shipped bytes.
   - `check` 0/0, `test` 2/2, `test:ssr`, `check:architecture` and **`test:browser` 2 + 1**: all exit 0.
   - **Controls: 12/12.**
   - **Installed-bin smoke:** passed (`683d8046…`): checker 0.13.1, pin `f2821ebf…`, bundled qualification exit 22.
4. **Auth-only derivative** (`evidence-v2/auth-derivative/auth-derivative-controls.json` = `e9b06344…`): **12/12**.
   - The exact Auth bytes and `candidate-auth` pass; every negative rejects.
   - **The ORIGINAL Auth+Charts App-B rejects under Auth-only** (`ChartView.svelte:2`, `model.ts:21`).
   - The original App-B passes the external Auth+Charts policy.
   - `bundled:auth` on the derivative: exit 0. `bundled:starter`: exit 21. Bundled qualification: exit 22.
5. **Author-app compatibility copies** (`evidence-v2/author-apps/…` = `fee26d44…`): all expectations met.

The superseded `f3c91ee6` gates, including the interrupted-then-resumed run, are kept in
`evidence-f3c91ee6-SUPERSEDED/`.

## 5. Qualification inputs and the derivative: focused review

- **Native fixtures.** The production consumers differ only by the removed
  `let { onApp } = $props()` / `{@const _ = onApp?.(app)}` lines. Charts keeps `onSelectionChange` and `brush`. The
  hook-driven browser test is also removed; every other source is asserted byte-identical. The originals are never
  claimed as passing.
- **Managed default-root consumers.**
  - `src/main.ts` mounts unchanged recipe copies (byte-asserted) with the dependencies documented in the shipped
    READMEs: a `fetch /api/chat` stream, and `fetch /api/transcribe` with `getVoiceInputAudioManager`.
  - The code recipe goes through a two-line `CodeHost.svelte` using the shipped `createRoot()`.
  - There is no no-op wrapper and no opaque hiding.
  - Retained history: `P9-final-run1-code-host-refused/` shows that the checker correctly refused the earlier
    store-through-props host.
- **Auth-only derivative.**
  - **Source basis:** it is derived from the FINAL reviewed App-B (snapshot tar `2f289af3…`; the 20 source-basis files
    equal the current App-B).
  - **Removed:** only the Charts import, state, slot, action, selection, `ChartView`, section, CSS, dependency and
    chart-only tests.
  - **Kept:** Auth Login/MFA/password/logout, routing, loading, the injected `fetchAccount`/`fetchActivity` with
    **sequential awaits inside the one cancellable effect**, and the request-epoch/loading acceptance with
    `retireAccount` on logout.
  - **Adapted tests are meaningful:**
    - the activity assertions now read `accountData.metrics`, including the per-subject rows from `fetchActivity`;
    - SSR asserts `account-card`.
  - **Results:** tsc 0, check 0/0, unit 21/21, SSR, build, browser 7/7.
  - **Assessment:** this focused review finds the derivative faithful. It is not a no-op, and there is no source
    exclusion.

## 6. Final app gate on `cd12784e…`

The app gate is recorded in `/private/tmp/composable-final-authoring/FINAL-APP-QUALIFICATION.md`. Its receipt is
`opus-final-review/app-gate/FINAL-APP-GATE-RECEIPT-cd12784e.json` = `110bb67c…`, with **34/34** checker expectations met
(App-A 18, App-B 16). The superseded `f3c91ee6` receipt is kept in `app-gate/f3c91ee6-SUPERSEDED/`.

- **App-A:** passes with the exact `chat-code-media` bytes on the installed `cd12784e` checker. The run includes:
  - the refresh to R6 Core / R5 Chat;
  - the checker devDependency now pointing at the content-addressed `cd12784e` copy;
  - the affected functional proof re-run on these bytes: check 0/0, unit 14/14, SSR, build, browser 1/1.
  
  Relative to the original pre-gate snapshot, only `package.json` and `package-lock.json` changed (authorized).
- **App-B:** passes only through the external Auth+Charts policy `bc68bb6b…`, on an isolated registry-shaped clone. The
  original is entirely unchanged, including all 25 snapshot files and the installed runtime bytes.

## 7. Corrections to handoff prose

- **`FINAL-PROFILE-HANDOFF.md`:**
  - its "final candidate `b62cf88f…`" is superseded;
  - its §6 "analyzer bounds" missed defects 1–4;
  - its README summary ("anything thrown while the executor runs must be plain data") overclaimed.
  A banner was added. The current candidate is `cd12784e…`, which is not accepted final (see the Verdict).
- **`GETTER-PROMISE-IMPLEMENTATION.md`:** "closes P30" holds only for explicit `throw` statements in the synchronous
  extent. A banner was added.
- **`FINAL-SCOPED-CHECKER-DELTA.json` (top level):** a coordinator preview, as the coordinator clarified. It is not the
  finalizer's `48932a2b…`, whose hash survives in `profile-phase/FINAL-EVIDENCE-SHA256SUMS`. The authoritative delta is
  `opus-final-review/OPUS-FINAL-SCOPED-CHECKER-DELTA.json`.
- **This document's earlier `f3c91ee6` verdict** is superseded by the Verdict above.

## 8. Commands and evidence

| Item | Location |
|---|---|
| Probes | `opus-final-review/probes/p1`–`p7` (run with `node`, or with `PKG=base` for 0.13.0) |
| Re-reviews | `FOCUSED-CORRECTION-REREVIEW.md` + `rereview/`; `FOCUSED-BINDING-DEFAULT-REREVIEW.md` (`5a8032f1…`) + `rereview-binding-default/` |
| Mutants | `mutants/run.sh`, `RESULTS-v2.txt` |
| Gates | `final-gates-v2.sh`, `final-gates-v2.log`, `evidence-v2/` |
| App gate | `app-gate/app-gate.mjs` (checker via `CHECKER_TGZ`/`CHECKER_SHA`), `app-gate/*cd12784e*` |
| Checksums | `opus-final-review/OPUS-FINAL-EVIDENCE-SHA256SUMS` |
| Curation pointers | `opus-final-review/CURATED-EVIDENCE-POINTERS.json` |

## 9. Outstanding (coordinator and parent)

- **Parent decision on B1 and B2 (§3a).** Until then, `cd12784e…` is the corrected candidate but not an accepted final
  artifact. If B1's bounded refusal is authorized, it needs one more pack, affected gates and a focused re-review.
- **Afterwards:** the controlled checker application and the parent git/npm release.
- Decisions on the escalated base gaps (§3).
- The physical microphone check.
- The aggregate release gate.

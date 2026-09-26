# Opus final checker/profile review: `@composable-svelte/architecture` 0.13.1

Date 2026-09-26. Fresh independent reviewer (Opus 5.5). I started after the finalization worker (pid 36765) exited and
confirmed the source was quiescent: no package file was newer than the finalizer's archive `b62cf88f…`. Source hashes at
review start are in `opus-final-review/SOURCE-AT-REVIEW-START.sha256`.

No git, main, publish, runtime-archive or application-source edits were made. Final parent git/npm release and the
controlled application of this checker remain coordinator duties.

## Verdict

- **Candidate:** `6095ae2f…` is the corrected checker candidate for the scoped profiles. It integrates the parent-authorized
  B1 (computed binding keys refused) and B2 (`{#each}`, `{@const}` and `{:then}` values bound like script bindings).
- **Review:** all corrections were focused-reviewed CLEAR by fresh independent reviewers.
- **Gates:** every scoped installed gate passed on its actual bytes, with the frozen R6 runtime. That covers the 9
  profiles, the starter, the Auth-only derivative, and the App-A/App-B app gates.
- **Scope:** starter, 7 individual companion profiles and chat-code-media, plus the separately reviewed external App-B
  Auth+Charts policy.

**These are narrow phase gates, not a full release claim.** The parent owns final assembly and publication, aggregating
these gates with the runtime matrix and the physical microphone check. `fullQualificationClaimed` stays false.

- **Artifact history (superseded ones kept and labeled):**
  - `b62cf88f…` (finalizer): **not cleared**. §2 lists its four fail-open defects.
  - `f3c91ee6…` (corrections 1–4): superseded, in `opus-final-review/final-archive-f3c91ee6-SUPERSEDED/`.
  - `cd12784e…` (correction 5, template binding defaults; its source equals `REVIEWED-SOURCE-HANDOFF`): superseded, in
    `opus-final-review/final-archive-cd12784e-SUPERSEDED/`, with evidence in `evidence-cd12784e-SUPERSEDED/`. The
    content-addressed copy is kept at `final-archive/by-sha/cd12784e…/`.
  - **`6095ae2f…`: B1 + B2, current.**
- **Re-reviews, all CLEAR:**
  - `opus-final-review/FOCUSED-CORRECTION-REREVIEW.md` (corrections 1–4);
  - `FOCUSED-BINDING-DEFAULT-REREVIEW.md` (correction 5);
  - `FOCUSED-B1-REREVIEW.md` (B1);
  - `FOCUSED-B2-REREVIEW.md` (B2 plus B1 confirmation, with a follow-up addendum).

### Current candidate artifact

| | Value |
|---|---|
| Path | `opus-final-review/final-archive/composable-svelte-architecture-0.13.1.tgz`, plus the content-addressed copy `final-archive/by-sha/6095ae2f…/` |
| sha256 | `6095ae2fa24d7fe895db616d9cdc82b6380950cd2945ab9dc22f5fb85b3ff304` |
| SRI | `sha512-kHetoCXaLxIDL/I5JPjOn4MyzGmEQbHKDBQo6HLVpI51g9NwU9/eMC6WTzYnrX22MKwJclp/KMHrsNxCAKQfFA==` (npm pack and openssl agree) |
| Size / files | 100,301 bytes / 40 files |
| Inspection | `archive-matches-source`. All 9 archived policies equal their embedded pins, and no tests are packed (`final-archive/inspect.json` `0cc27e8f…`). |
| Source at pack | `opus-final-review/SOURCE-AT-PACK-v3.sha256`, re-verified unchanged after all gates |
| Suite | `npm test` **560/560** (`evidence-v3/suite.log`) |

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
- **Authoritative delta:** `opus-final-review/OPUS-FINAL-SCOPED-CHECKER-DELTA.json` (`5447c924…`, schema v3), 29 files.
  For each file it records the baseline, finalizer, `REVIEWED-SOURCE-HANDOFF` and final hashes, plus flags.
- **Incremental reviewed delta relative to the immutable `REVIEWED-SOURCE-HANDOFF`** (whose source equals `cd12784e…`):
  6 files, in `opus-final-review/INCREMENTAL-B1-B2-vs-REVIEWED-SOURCE-HANDOFF.diff` (`b69c92b2…`).

  | File | REVIEWED-SOURCE-HANDOFF | Final |
  |---|---|---|
  | `src/semantic-context.mjs` | `8cdcdef3…` | `f231bc6974bd35dd3fe9661711486fd63988ca1257e5b7bb7e41f98ad051a432` (B1 guard) |
  | `src/semantic-flow.mjs` | `b58997fb…` | `64118c57457afaf195f615745c69b2ffb1cf50561a46ced3598309ce3434cb57` (B2 seeding) |
  | `src/template-binding-default.test.mjs` | `9a91ba49…` | `c3515bb7c88ef07c32bd1280303a4c706af155dacae9b8325512562393388319` (B1 test) |
  | `src/template-binding-values.test.mjs` | absent | `e6908b5192b43ce57e96410d638e0f7e734867308301cc72fb3f93b6a8a6a465` (B2 tests) |
  | `README.md` | `f986d23a…` | `5903232d68f865c693a92b79c9fa12bb1ac6b866e3e3b56716dab69109ec746e` |
  | `CHANGELOG.md` | `be7d8954…` | `a59ef81466128ee413833bc79747b1617394a8239a93131f1277e109abbc5534` |

- **Changed by this review relative to the finalizer:**
  - `semantic-context.mjs`, `semantic-flow.mjs` and `symbols.mjs`;
  - the tests `instantiation-expression`, `getter-promise-compat`, `template-binding-default` and
    `template-binding-values`;
  - README and CHANGELOG.
  
  The finalizer's other reviewed changes are unchanged: `package.json`, `check.mjs`, `bundled-policy.mjs`,
  `expression-values.mjs`, the 9 policies, the test bumps, and `installed-bin-smoke.mjs`.
- **Correction diffs:**
  - `CORRECTIONS-src.diff`, `CORRECTIONS-symbols.diff` and `CORRECTIONS-tests.diff` (corrections 1–4);
  - `CORRECTIONS-binding-default.diff` (correction 5);
  - `CORRECTIONS-B1-vs-cd12784e.diff` (B1 alone);
  - `INCREMENTAL-B1-B2-vs-REVIEWED-SOURCE-HANDOFF.diff` (B1 + B2).

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

## 2b. B1 and B2 (parent-authorized)

- **B1: computed keys in template binding patterns are refused** (`template-binding-computed-key`, in
  `semantic-context.mjs`).
  - **Scope:** a computed key used as a binding-element property name in any template binding unit (snippet params,
    `{#each}`, `{@const}`, `{:then}`/`{:catch}`, and `let:`). Type-level computed names are unaffected.
  - **Proof:** mutant M6 is killed; focused review CLEAR.
- **B2: template binding values are propagated** (`seedTemplateBinding` in `semantic-flow.mjs`, about 25 lines). It
  reuses `bindPattern`, `readMember(…,'*')`, `awaitValue` and `seedBinding` inside the existing fixpoint:
  - `{#each xs as p}` binds like `for (const p of xs)`;
  - `{@const p = v}` binds like `const p = v`;
  - `{:then p}` binds like `const p = await promise`.

  **Not changed:** no new rules, zones, evaluator or parser, and no catch machinery. **`{:catch}` values stay unmodeled**,
  per the documented catch limitation.
  - **Correlation:** markers are matched to parser units by exact start/end. A missing or inexact correlation is refused
    as `template-binding-correlation`, never skipped.
  - **Proof obligations met** (`src/template-binding-values.test.mjs` and `FOCUSED-B2-REREVIEW.md`):
    - **Parity:** authority, store (`view-subscribe`) and history reach the same findings as their script forms through
      each, const and then.
    - **Convergence:** nested each 60 deep, const chains of 60 and mixed then/each/const chains all converge, as does
      backward flow at script parity.
    - **Fail-closed correlation:** covered by tests for the missing unit and the widened unit.
    - **Ordinary data bindings stay supported and clean:** the reviewer checked 43 forms, byte-identical to the baseline.
    - **Mutation:** mutants M7 (each), M8 (const), M9 (then), M10 (silent-skip correlation) and M11 (containment instead
      of exact correlation) are all killed. M1–M11 results are in `mutants/RESULTS-v5.txt` (`9639dd77…`).
    - **Real inputs:** all 10 positive inputs still pass, and the originals stay rejected at the same sites.
  - **By-design consequence (documented in the CHANGELOG):** these bindings can now report the same unsupported
    constructs as their script forms. For example, `{#each}` over a value exported by an opaque package is refused, as
    `for…of` over it already was. No real input is affected.

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
- **Template binding patterns:** defaults (correction 5) and computed keys (B1) are refused. Values of `{#each}`, `{@const}` and `{:then}` are modeled (B2). `{:catch}` values are not.
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

## 3a. Release-scope report B1/B2: resolved

B1 and B2, reported in the `cd12784e` review, were authorized by the parent and implemented (§2b). The **remaining
modeled-scope limits** are:

- `{:catch}` values and script `catch` bindings;
- implicit coercion calls;
- the other §3 items.

## 4. Final installed gates on `6095ae2f…`

The gates were run by `opus-final-review/final-gates-v3.sh` (log `final-gates-v3.log`, exits `evidence-v3/exits.txt`).
Stages A–E were supervised to completion in this turn. The orchestration tooling is unchanged (`evidence-v3/tooling.sha256`).

- **Common to every gate:**
  - external `--policy` + `--policy-sha256`;
  - `--expected-core-version 0.13.1`;
  - the installed `isQualificationPass` with pin, core 0.13.1 and checker 0.13.1;
  - never qualification through a bundled selector.
- **Runtime:** frozen R6 (`archives-r6/MANIFEST.json` `2813a209…`; every archive re-hashed intact), installed from local
  tarballs and byte-verified. Transport is local candidate tarballs; no registry retrieval is claimed.

1. **Profiles.** `evidence-v3/profiles/profile-qualification-receipt.json` = `b9f9274e…`: **172/172**,
   `ALL_EXPECTATIONS_MET`.
   - The installed checker `6095ae2f…` verified 40/40 files; the parser dependencies are 5.9.3 and 5.57.0.
   - The 8 input identities are byte-identical to the earlier runs, and all 172 (profile, input, label, exit, pass) rows
     are identical.
   - **Positives:** default-root consumers of the unchanged shipped chat, code, media and chat-code-media recipes, and
     the maps, graphics and charts production consumers.
   - **Originals stay rejected:** the ORIGINAL instrumented fixtures and the auth consumer.
   - **Negatives:** all rejected.
   - **Bundled selectors:** analysis exits 0; qualification is refused with exit 22.
2. **Checker-independent evidence reused, not rerun.** The inputs and runtime bytes are identical, and the checker is not
   part of the app runtime.
   - P9 consumer verification `3a3e39da…`.
   - P9 production-consumer equivalence `8bf3d313…` (non-vacuity in P5).
   - `matrix-r6/{minimum,newer}` (`f48048f0…` / `6e878bc8…`).
   - `r6-declaration-check/RECEIPT.json` (`3636d06d…`).
3. **Real shipped starter** (`evidence-v3/starter/`).
   - Core 1258/1258 and checker 40/40 installed, with no symlinks; the shipped `package.json` was restored.
   - `check` 0/0, `test` 2/2, `test:ssr`, `check:architecture` and **`test:browser` 2 + 1**: all exit 0.
   - **Controls: 12/12** (`da6ab463…`).
   - **Installed-bin smoke:** passed (`0a41ecda…`), bundled qualification exit 22.
4. **Auth-only derivative** (`evidence-v3/auth-derivative/auth-derivative-controls.json` = `d0251b77…`): **12/12**.
   - The ORIGINAL Auth+Charts App-B rejects under Auth-only.
   - The original App-B passes the external Auth+Charts policy.
   - `bundled:auth`: exit 0. `bundled:starter`: exit 21. Bundled qualification: exit 22.
5. **Author-app compatibility copies** (`evidence-v3/author-apps/…` = `d557577a…`): all expectations met.

**Superseded gate evidence:** `evidence-cd12784e-SUPERSEDED/` and `evidence-f3c91ee6-SUPERSEDED/`.

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

## 6. Final app gate on `6095ae2f…`

The app gate is recorded in `/private/tmp/composable-final-authoring/FINAL-APP-QUALIFICATION.md`. Its receipt is
`opus-final-review/app-gate/FINAL-APP-GATE-RECEIPT-6095ae2f.json` = `a12dcdb9…`, with **34/34** expectations met (App-A 18,
App-B 16). Superseded receipts are kept.

- **App-A:** passes with the exact `chat-code-media` bytes on installed `6095ae2f`. Its functional proof was re-run: check
  0/0, unit 14/14, SSR, build, browser 1/1. Only its authorized manifest and lock changed.
- **App-B:** passes only through the external Auth+Charts policy `bc68bb6b…`, on an isolated clone. The original is
  entirely unchanged.
- **B2 now covers both apps' template bindings:** App-A's `{#each}` and App-B's `{@const}` store/session bindings are
  analyzed, and the apps still pass.

## 7. Corrections to handoff prose

- **`FINAL-PROFILE-HANDOFF.md`:**
  - its "final candidate `b62cf88f…`" is superseded;
  - its §6 "analyzer bounds" missed defects 1–4;
  - its README summary ("anything thrown while the executor runs must be plain data") overclaimed.
  A banner was added. The current candidate is `6095ae2f…` (see the Verdict).
- **`GETTER-PROMISE-IMPLEMENTATION.md`:** "closes P30" holds only for explicit `throw` statements in the synchronous
  extent. A banner was added.
- **`FINAL-SCOPED-CHECKER-DELTA.json` (top level):** a coordinator preview, as the coordinator clarified. It is not the
  finalizer's `48932a2b…`, whose hash survives in `profile-phase/FINAL-EVIDENCE-SHA256SUMS`. The authoritative delta is
  `opus-final-review/OPUS-FINAL-SCOPED-CHECKER-DELTA.json`.
- **This document's earlier `f3c91ee6` and `cd12784e` verdicts** are superseded by the Verdict above. The `cd12784e` version is kept in `final-archive-cd12784e-SUPERSEDED/`.

## 8. Commands and evidence

| Item | Location |
|---|---|
| Probes | `opus-final-review/probes/p1`–`p9`, `rereview*/` (run with `node`, `PKG=base` for 0.13.0, or `PKG=proto` for the B2 scratch prototype) |
| Re-reviews | `FOCUSED-CORRECTION-REREVIEW.md`, `FOCUSED-BINDING-DEFAULT-REREVIEW.md`, `FOCUSED-B1-REREVIEW.md` (`424db4d3…`), `FOCUSED-B2-REREVIEW.md` (`699d5a4e…`) |
| B2 scope | `/private/tmp/composable-final-checker/B2-BOUNDED-SCOPE.md`, `opus-final-review/b2-prototype/` |
| Mutants | `mutants/run.sh`, `RESULTS-v5.txt` |
| Gates | `final-gates-v3.sh`, `final-gates-v3.log`, `evidence-v3/` |
| App gate | `app-gate/app-gate.mjs` (checker via `CHECKER_TGZ`/`CHECKER_SHA`), `app-gate/*6095ae2f*` |
| Checksums | `opus-final-review/OPUS-FINAL-EVIDENCE-SHA256SUMS` |
| Curation pointers | `opus-final-review/CURATED-EVIDENCE-POINTERS.json` |

## 9. Outstanding (parent and coordinator)

- Final assembly and publication by the parent, using `6095ae2f…`: the controlled checker application, git/npm, and the
  portable curated bundle, which the coordinator rebuilds from these outputs.
- Decisions on the escalated base gaps (§3).
- The physical microphone check.
- The aggregate release gate.

No full release qualification is claimed here.

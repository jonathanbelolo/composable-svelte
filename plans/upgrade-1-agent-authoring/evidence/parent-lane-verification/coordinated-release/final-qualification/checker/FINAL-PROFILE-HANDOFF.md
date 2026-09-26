# Final handoff: `@composable-svelte/architecture` 0.13.1, starter + 7 individual profiles + chat-code-media

> **Opus final review correction (2026-09-26, `OPUS-FINAL-PROFILE-REVIEW.md`):** the candidate `b62cf88f…` is **superseded and
> not cleared**. The independent review found four fail-open analyzer defects that this handoff's §6 "analyzer bounds" missed:
> instantiation expressions were marked non-runtime, settle checks were keyed per node, settle functions could reach templates,
> and `arguments<T>` escaped its refusal. They were corrected in source and repacked as `f3c91ee6…`, which is itself now superseded by **`cd12784eb9288aa510b2f980eb3d0ef57efce8c3d8d8318ab72cee32ce67e51a`** (adding the
> parent-directed refusal of template binding-pattern defaults). Focused re-reviews of both are CLEAR. `cd12784e…` was in turn superseded by
> **`6095ae2fa24d7fe895db616d9cdc82b6380950cd2945ab9dc22f5fb85b3ff304`**. It adds the parent-authorized B1 (computed binding keys
> refused) and B2 (`{#each}`/`{@const}`/`{:then}` values modeled); focused review is CLEAR and all scoped gates pass. These are narrow phase gates; see
> `OPUS-FINAL-PROFILE-REVIEW.md`. The README summary "anything thrown while the executor runs must be plain data" overclaimed:
> only explicit `throw` statements in the executor's synchronous extent are checked. Policy hashes are unchanged.


Date 2026-09-26. Workspace `/private/tmp/composable-final-checker`.

- **Not changed:** git, main or publish; original apps; runtime artifacts; the cleared harness `01e71e02…`.
- **Not claimed:** full release qualification. Each item below is a **scoped phase gate**.
- **Outstanding:** the fresh independent final checker/profile review.

This supersedes `PROFILE-HANDOFF.md` and `GETTER-PROMISE-IMPLEMENTATION.md` as the current state. Both remain history.

## 1. Final candidate archive (one `npm pack` after the source was stable)

| | Value |
|---|---|
| Path | `profile-phase/P9-final-archive/composable-svelte-architecture-0.13.1.tgz` |
| sha256 | `b62cf88f15d8dd42ed7202c482c27d34e73b0194cf47f4ee16226c3da579529b` |
| SRI | `sha512-a9nMcwyaItMLnfWY7dArfJhpziMIbzfWEgx1/ncQqmF3JsAhq7h+hHJHV2yu0XRtLhBFMwiFOYdv7tTOs+e2Cw==` (npm pack = openssl) |
| Size / files | 98,479 bytes / 40 files |
| Contents | `archive-matches-source`; all 9 archived policies equal their embedded pins; no test files |
| Suite | `npm test` **549/549** (54 files; `profile-phase/P9-suite.log`) |

**Superseded (not final):**

- `70dac58a…` (P8, pre-registration; used only for the Auth pre-registration gate and the chat smoke);
- `9e7cd442…`, `356f4697…`, `2410e594…`, `02dc833e…`;
- the starter-only `7cae973a…`.

## 2. Registered policies (`packages/architecture/policies/`)

- **Shared structure:** every policy has `policyVersion` 0.13.1 and `supportedCore` `>=0.13.1 <0.14.0-0`, root `src/main.ts`, 5 active rules, 2 inactive rules with unchanged reasons, and no grants, records or exceptions.
- **Approvals:** each approves only exact core 0.13.1, its named companion(s) (registry provenance) and the listed Svelte version.
- **Parser deps:** TypeScript 5.9.3 and Svelte 5.57.0 are unchanged.

| Selector | sha256 | Companions | Svelte |
|---|---|---|---|
| starter | `f2821ebf0fa5cd34b346361089edd56bb4ec01a40c59eb969c60f90c7e77d190` | — | 5.57.0 |
| chat | `4e958b18f465a2bb65cff36ecf97f76e66a7da3bed83942ef5397f0c9030436f` | chat 0.5.0 | 5.55.3 |
| code | `669cd1a15dcba7a7c3e6ebe572888e4611e0e214dd2e607c744076182762e437` | code 0.5.0 | 5.55.3 |
| media | `717854d1add64795bf06a7d8ecf73a768dd8fb717cf706b3846b0e5384b501c3` | media 0.5.0 | 5.55.3 |
| chat-code-media | `f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327` | chat, code, media 0.5.0 | 5.55.3 |
| maps | `6c60262dc74594255ba2d245b4a0b057edc008bb450ff7b4309a975b1d5c760a` | maps 0.3.0 | 5.55.3 |
| graphics | `5b66bb6ec3b309fba9f4696f07ac35f5f7b9c86e75520d11d9de966b2fe0f03b` | graphics 0.3.0 | 5.55.3 |
| charts | `853f929a63217a9667ec64e928dbd8767c15ad49ff82e75e802e4209e4398645` | charts 0.3.0 | 5.55.3 |
| auth | `ab100ba510f5cdc4931bca33e0dc398d21f1382010b51ed44242d30dc6846662` | auth 0.3.0 | 5.55.3 |
| **External only** (App-B, never bundled) | `bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de` | auth + charts 0.3.0 | 5.55.3 |

The external policy lives at `profile-phase/P1-policies/external-appb/app-b-auth-charts.json`. There is no Auth+Charts, other combination or generic profile, and tests enforce this.

## 3. Package delta vs the unchanged 0.13.0 baseline (`FINAL-SCOPED-CHECKER-DELTA.json` = `48932a2b…`, 24 files)

| File | Before | After |
|---|---|---|
| `package.json` | `22c2371c…` | `3c016fc9c7fb7f0b135412463df6b61438f2c84e713f3d9f961e68871745433d` (version 0.13.1 only) |
| `src/check.mjs` | `7ca110b7…` | `c966b7a550fcd6e06588193f5cff2df6817faaef6831b06a2a427dbb14951d01` (`CHECKER_VERSION` only) |
| `src/bundled-policy.mjs` | `f43f1416…` | `d64e226cd19522dc90bd09d6c5ac0003d0bfdaea64a777e11736b5e85af99880` (9 pins and registry entries) |
| `src/expression-values.mjs` | `07b15e7d…` | `45fd04ee0d983860e5d62232a53397f2cf1e32289c8d2f2e9051e71de037d0e2` (instantiation expression, getter hook) |
| `src/semantic-flow.mjs` | `c9672b49…` | `1b564143f246167140437ae3cb9490123821624e97dee262fbf5a3ee7913211f` (instantiation expression, alias getters, local executors) |
| `policies/starter.json` | `38943014…` | `f2821ebf…`; plus 8 new profile policies (§2) |
| `README.md` | `e9d38314…` | `dbd094ee387671eae3ebdf9835218cb0d8399869a84fee734cb43ff7a5786e89` |
| `CHANGELOG.md` | `d6280815…` | `6b92480e2c0b9b0c8c7baff0df55999a96d07f06350b2d4c31f7e515b49e4a07` |
| Tests: `bundled-policy.test` `f965c9ba…`, `check.test` `96cf6a79…`, `graph.test` `6aea4b1e…`, `qualification.test` `d663739c…`, `computed-data-keys-cli.test` `acdebf40…`, new `instantiation-expression.test` `5f861d16…`, new `getter-promise-compat.test` `b02a6153…`, `test/installed-bin-smoke.mjs` `b8ec1556…` (reviewer realpath fix) | | |

- **README content:**
  - R1 exact-approval wording;
  - the 9-selector table;
  - the external-only boundary;
  - the native-fixture/production-consumer note;
  - the microphone limitation;
  - supported-syntax guidance: alias getters only, a local synchronous executor only, and **`Promise.all`/`race`/`allSettled`/`any`/`withResolvers`/`.then` and async executors unsupported**.
- **Unchanged:** detectors, rules, zones, seeds, catalog and parser deps.

## 4. Final installed gates (installed checker `b62cf88f…`, 40/40 bytes verified)

Every gate below used an external `--policy` + `--policy-sha256`, `--expected-core-version 0.13.1` and `isQualificationPass`, and never qualified through a bundled selector.

- **Runtime inputs:** the cleared R6 aggregate (`archives-r6/MANIFEST.json`; Core `729ca89f…`, Auth `dbb2611b…`, Chat `fe21f00f…`, 5 unchanged), installed from local tarballs and byte-verified. **Transport: local candidate tarballs, registry-shaped specs; no registry retrieval claimed.**
- **Runtime receipts reused, not rerun:** `matrix-r6/{minimum,newer}`, all 8 recipes passed.

| Profile | Genuine default-root consumer (exact registered bytes, `src/main.ts`, reaches companion(s), core and svelte) | Honest original-input phase evidence |
|---|---|---|
| starter | Real shipped R6 core consumer. check, test 2/2, SSR, `check:architecture` (0/0) and **browser 2+1**; installed-bin smoke; 12/12 controls (`P9-final/starter/`) | — |
| chat, code, media | `*-managed-default-root-consumer`: the unchanged shipped recipe mounted by ordinary host wiring (below). Positive, all negatives including **Svelte 5.57.0 now rejected (svelte reached)**, and `bundled:<p>` developer feedback exit 0 / qualification refused | ORIGINAL RECIPE PHASE (recipe roots) passes; Svelte approval unexercised there, as labelled |
| chat-code-media | `chat-code-media-default-root-consumer` (all three recipes), plus **App-A** (reviewed source hash-identical, R6 Core/R5 Chat): exact bytes exit 0 `passed` | recipe-root phase for all three recipes passes |
| maps, graphics, charts | `*-fixture-production-consumer` (only the `onApp` test hook and its test removed). Equivalence on R6: SSR byte-identical and Chromium DOM/gesture equal; original shipped browser tests pass | ORIGINAL instrumented fixture **stays rejected** (hook site only) |
| auth | **Auth-only production derivative** of the frozen App-B snapshot (§5) | ORIGINAL `auth/consumer` **stays rejected** (8 original constructs) |

- **v3 profile receipt:** `P9-final/profile-qualification-receipt.json` = `aa1c7813…`, **172/172**.
- **Consumer verification:** `P9-final/default-root-consumer-verification.json` = `3a3e39da…`: `svelte-check` 0/0, `vite build`, SSR render of every mounted component, and the shipped `managed.test.ts` in Chromium for chat, code and media.
- **Equivalence:** `P9-final/production-consumer-equivalence.json` = `8bf3d313…`.
- **Author apps:** `P9-final/author-apps/…` = `fef4dcc5…`. App-A and App-B sources are hash-equal to their reviewed inputs.
- **Host wiring used by the managed consumers** (hashes in the receipt):
  - `src/main.ts` imports `mount` and mounts the unchanged `recipes/managed` components;
  - chat and voice receive the **dependencies documented in the shipped Chat and Media READMEs** (fetch `/api/chat` stream, fetch `/api/transcribe` plus `getVoiceInputAudioManager`);
  - code uses a two-line `src/CodeHost.svelte` that creates the store with the shipped `createRoot()`;
  - `index.html`, `vite.config.ts` and `tsconfig.json` are ordinary build configuration.
  - There is no no-op wrapper and nothing hidden behind opaque imports.
- **Run 1 kept as evidence:** `P9-final-run1-code-host-refused/` (`fe0605e3…`). The first code host passed the store through `svelte mount` props. The existing rule correctly refused that as `store-authority-to-opaque-callee`, and the host was changed to the Svelte root.

## 5. Auth-only production derivative

- **Source:** frozen App-B snapshot `app-b/review-receipts/final-source-snapshot` (tar `2f289af3…`; per-file hashes in `profile-phase/auth-derivative/final/source-SNAPSHOT-RECEIPT.json`). It has sequential account→activity awaits and no `Promise.all`.
- **Transformation:** `derive-auth-only.mjs` (`11521d79…`) applied 40 asserted edits (receipt `app-b-auth-only-production-derivative.derivation.json`; diffs `src.diff`, `tests.diff` and `scripts.diff`).
  - **Removed:** only the Charts import, chart state/slot/action/handler, `selectedMetric`, `ChartView` and its registration, the chart section, banner and CSS, the charts dependency, chart-only tests (2 unit, 1 browser) and the chart keyboard tail of the MFA browser test.
  - **Adapted:** activity-row assertions now read `accountData.metrics`, and the SSR check now asserts `account-card`.
  - **Kept:** Auth, login, MFA, password, logout, navigation, loading, the injected `fetchAccount`/`fetchActivity`, cancellation, epoch and subject acceptance.
- **Checks on cleared R6** (`profile-phase/auth-derivative/final/`): tsc 0, svelte-check 0/0, unit **21/21** (23 − 2 chart-only), SSR pass, build pass, **browser 7/7** (8 − 1 chart-only).
- **Pre-registration** (installed `70dac58a…`) and **final** (installed `b62cf88f…`, `post-registration/auth-derivative-controls.json` = `942d2b7e…`): **12/12** each.
  - The exact Auth bytes and `candidate-auth` pass.
  - The wrong pin, core, checker envelope, auth pin, auth approval, Svelte pin and missing root all reject.
  - **The original Auth+Charts App-B rejects under the Auth-only policy** (`ChartView.svelte:2`, `model.ts:21`).
  - The original App-B passes the external Auth+Charts policy.
  - Installed `bundled:auth` on the derivative: exit 0; bundled qualification: exit 22.

## 6. Analyzer bounds (unchanged since `GETTER-PROMISE-IMPLEMENTATION.md`)

- **Instantiation expressions:** erased; heritage clauses excluded.
- **Getters:** alias-only; all other getter forms are refused.
- **Executors:** one local synchronous executor.
  - Resolution, rejection and executor-extent throws must be plain data.
  - Settle functions are closure-confined.
  - Combinators, `.then` and async executors are refused (documented in README and CHANGELOG).
- **Regressions and mutants:** the regressions are in the suite; mutants: instantiation 2/2 and getter/executor 14/14 killed.
- **Pre-existing base gaps, escalated, not widened:** plain `throw`→`catch`, `defineProperty` accessors, action-payload linkage, opaque-callback parameters (P27 parity).

## 7. Outstanding

1. **Fresh independent final checker/profile review.** It covers:
   - the §3 delta, including the two retained starter test fixes;
   - the analyzer bounds;
   - production-consumer equivalence and the default-root consumers' host wiring;
   - the Auth derivative (it also needs its **focused independent review**);
   - the external appB policy `bc68bb6b…`.
2. **Coordinator-owned:**
   - App-B's own final browser run and acceptance;
   - App-A acceptance;
   - decisions on the escalated base gaps.
3. **Evidence manifest:** `profile-phase/FINAL-EVIDENCE-SHA256SUMS` (105 files) = `19c0966f…`.

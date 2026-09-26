# Opus review: final immutable archive harness

Reviewer: Claude Opus 5.5, fresh context, 2026-09-26. Scope: `scripts/verify-release-archives.mjs` and its
tests, the HANDOFF, `followup-requirements.md`, the plan
(`plans/upgrade-1-agent-authoring/COMPANION-RELEASE-CANDIDATE-PLAN.md`), `scripts/verify-consumer.mjs`
(byte-identical to main's working tree before this review), the candidate starter policy and the staged
core consumer delta. R2 was not used. R3 (`archives-r3/MANIFEST.json`, core `30e044e1…`) was used only
to exercise the infrastructure. No commit, push, publish or main edit.

## Verdict

**BLOCK: the harness as submitted** (`verify-release-archives.mjs` sha256 `052a9d70…`). It could report
a pass for work that had not run:

- The chat-code-media recipe ran no command and still reported "passed".
- The Code action controls were never executed, but the receipt said they were.
- The Code and combined recipes could not even install.
- A checker-only run claimed full qualification.
- A request for both Svelte checkpoints ran only one of them.
- A failed rerun left an earlier PASSED receipt in place.
- A partial run exited 0.

**Corrected scratch** (`c108eb72…`): I fixed all of these. They are bounded fixes (listed below), mutation-verified
and exercised against the real R3 bytes. In my assessment the corrected harness is sound
infrastructure. **It is not CLEAR TO LAND until a focused independent re-review of my delta** (as the
coordinator's rule requires for reviewer-changed code), plus one real run of the patched
`verify-consumer.mjs`, which I could not run here (no built `dist`).

This is not a release qualification. No receipt from this review qualifies R3 or any final archive.
The runtime clearance of R3 is still pending, and the final checker 0.13.1 does not exist yet.

## Hashes (before → after)

| File | Before (submitted) | After (this review) |
|---|---|---|
| `repo/scripts/verify-release-archives.mjs` | `052a9d70a7ceb415a577724b981e6c5091edc50f7f14d31fa7701991d98d9192` | `c108eb72c990ec1b73b71461ce97ef39bd888548a6c8952268227c487ff457ba` |
| `repo/scripts/verify-release-archives.test.mjs` | `7b6a609021e5b54d524c66e06c50c7833c9890d4bb906c6ba329fa27ed2e59e3` | `cbcff88e1ee25a1b65e09b32c4beb3fcdf719f261a7ea67f85067a65186f8476` |
| `repo/scripts/verify-consumer.mjs` | `a83273c69fc4a9f6de241a78c29fad33522553c1a2e1c397bdf418b50fb60c24` (= main) | `055f117abed189b774242c8e5b68aa1e33155e1155d5f36fa541fe5826fa131a` |
| `repo/HANDOFF.md`, `HANDOFF.md` | `15a650ad…` | `34bde7b4…` (only a correction banner prepended) |
| `candidate-starter-policy.json` | `cb1202db…` | unchanged |

Baseline check: 119 of 120 files are unchanged. The one change is `scripts/verify-consumer.mjs`, from finding B11.
The checker package, its policies and `packages/core/consumer` are untouched. The architecture suite passes
529/529.

## Blocking findings in the submitted harness, with the fixes applied

Line numbers refer to the submitted file (`052a9d70`); "now" refers to `c108eb72`.

**B1. A checker-only run claimed full qualification** (submitted 2386–2389). In `--mode qualification`
the harness set `verdict: QUALIFICATION_PASSED` and `fullQualificationClaimed: true`, but it ran no
recipe and no negative control. The provisional receipt
(`evidence/provisional-starter/qualification-receipt.json`) carries this claim with 0 recipes and 0
controls.
- Now (2573–2578): the verdict is `ARCHITECTURE_QUALIFICATION_PASSED` with `fullQualificationClaimed: false` and an
  explicit narrow-phase reason.
- The `recipes` and `negative-controls` modes are narrow in the same way.
- `negative-controls` without a checker/policy is now `PARTIAL_NEGATIVE_CONTROLS_CHECKER_PENDING`, where it used to be `PASSED`.

**B2. A dual checkpoint was accepted but only one ran** (submitted 2128–2130, 734–745).
`--svelte-checkpoint both|all` passed validation. `resolveSveltePin` treats anything that is not `minimum`
as `newer`, so the run executed 5.55.3 only and the receipt recorded `both`. The coordinator required
that metadata without separate executions is not dual evidence.
- Now (2276–2279): only `newer|minimum` are accepted. Dual compatibility means two receipts.

**B3. The combined chat-code-media recipe ran nothing** (submitted 1536–1639). It installed the
packages, copied the recipes and returned `status: 'passed'` with zero commands.
- Now (1667–1683): each shipped suite runs against the one combined install, following its README
  (copy it to `recipes/managed`, add Code's `svelte.config.js`, then `vitest run`).
- On R3 this ran 1 + 1 + 2 tests, all passing, at Svelte 5.55.3.

**B4. The Code action controls were fabricated** (submitted 1362–1386, 2304).
- The harness recorded `identity-omission: 'verified-in-source'` without checking anything.
- The "negative" mutation targets `<NodeCanvas`, but the shipped `recipes/managed/Host.svelte` renders
  NodeCanvas as `render: NodeCanvas` and has no such tag. The mutation was therefore a no-op and the
  control was silently skipped.
- Even so, the console printed "action lifting omission & incompatible mapper check confirmed".
- There was also no positive baseline, so a rejection could have come from the probe setup itself.
- Now (`runNodeCanvasActionControls`, 869–908): the plan's controls run against the **installed** Code
  artifact, using the Canvas example its README ships. The example must type-check as shipped, and
  also with `liftAction` omitted. It must be rejected with an incompatible mapper, with the output matching
  `not assignable to type…NodeCanvasAction`.
- On R3 the results were exit 0 / 0 / 1 ("1 error").

**B5. The Code and combined recipes could never install** (submitted 1319 and 1566). The harness
hardcoded `@xyflow/svelte: 0.1.20`, whose peer range is Svelte 3/4. On real R3 bytes, `npm install`
failed with ERESOLVE. Code already declares `@xyflow/svelte ^1.4.1`. This shows these recipes had never
been run end to end.
- Now: the override is removed and the Code dependency declared by the archive is used.

**B6. A failure left no receipt, and a stale PASSED receipt survived** (submitted 2121–2504,
2626–2637). Receipts were written only on success, and the evidence directory is reused from the
manifest. A failing rerun therefore left the previous PASSED receipt in place, and the scratch directory
holding the logs was deleted.
- Now (2230–2268): any failure after the evidence directory is known writes a `FAILED` receipt. It
  carries the error, the recipe, the command, its exit code and full stdout/stderr, plus whatever
  completed before the failure.
- Verified on a real R3 ERESOLVE failure and by a unit test with a pre-seeded PASSED receipt.

**B7. The exit code, mode and recipe inputs could mask failure** (submitted 2628, 2193–2197,
2377–2385).
- `PARTIAL` exited 0.
- A mistyped `--mode` produced `verdict: undefined` and exited 0.
- An unknown `--recipe` ran nothing and reported `RECIPES_PASSED`.
- A selected recipe whose package was missing from the manifest was silently skipped.
- Now: PARTIAL exits 2, and unknown modes and recipes are rejected (2280–2288). A requested recipe with a missing package fails (2348–2355). A recipes run
  with zero executed recipes fails. `recipesNotRun` is listed in the receipt.

**B8. The core-starter could pull unverified registry bytes and skip its own check** (submitted
906–915, 940).
- Without a checker archive, the shipped devDependency `@composable-svelte/architecture` was fetched
  from the registry and never verified, and `check:architecture` was silently skipped.
- With a checker, the check was still skipped if `.bin` was missing.
- `JSON.parse` of the `npm run` banner output always failed, so the receipt said `not-run` even when the check had run.
- Now (913–935):
  - The core-starter requires a checker archive.
  - The shipped exact pins (core, checker, Svelte) are asserted equal to the candidate identities before any install.
  - `check:architecture` always runs, and its exit status is recorded.

**B9. Nothing guarded against unlisted, nested or registry copies of first-party packages** (the class
of the Gemini self-test regression). Only the named packages were byte-checked, and only once, before
the recipe's commands ran.
- Now: `verifyLockedCandidateIdentities` (778–811) requires every `@composable-svelte/*` entry in
  `package-lock.json` to meet three conditions:
  - It is a named candidate.
  - It sits at top level, not nested.
  - It resolves to the frozen archive, with lock `integrity` equal to the archive's sha512.
- After every recipe's commands (and after the qualification app), `runVerification` re-verifies all
  installed candidate bytes and the lockfile (2504–2516, `postRunVerification` in the receipt).
- `npx` calls use `--no`, and svelte-check runs from the local `.bin`.
- On R3 the lockfiles showed `resolved: file:…/frozen-archives/…tgz` with matching sha512 for every candidate.

**B10. Tar extraction did not check entry types** (submitted 181–203). Only the path strings were
checked, so symlink, hardlink and device entries, and entries outside `package/`, were accepted before
`tar -x`.
- Now (181–213): the harness cross-checks `tar -tvzf` and accepts only regular files and directories under `package/`.

**B11. Coordinator follow-up #2 was not addressed.** `verify-consumer.mjs` was byte-identical to main.
- Once the staged consumer pins checker 0.13.1, pre-publication CI would try to install an unpublished
  checker from the registry.
- Now (scratch `verify-consumer.mjs`, +7 lines, 27–33, 40, 52):
  - The workspace checker is packed with `npm pack --ignore-scripts`.
  - Its `file:` spec is injected into both the standalone starter and the combined app.
  - The script asserts that the shipped starter's checker pin equals the packed checker version.
- Shipped sources are not edited, and the existing controls are untouched.
- **Not executed here** (needs built `dist` of all 8 packages). `npm pack` of `packages/architecture`
  itself was checked: it yields `composable-svelte-architecture-0.13.0.tgz` with 32 entries.
- Needs re-review and a real run.

**Minor misstatements, also fixed:**
- SRI was never re-checked on the frozen copy, because `integrity` was not propagated (submitted 443–451 → now 461).
- Negative-control stdout/stderr were discarded.
- Recipes skipped under `--skip-browser` reported `passed`; they are now `partial-browser-skipped`.
- The manifest `status`/`releaseFinal`/`releaseCandidate` were dropped from the receipt.
- The test named "Receipts: retain command stdout/stderr logs…" asserted none of those things.

## Verified correct as submitted (review-only approval)

- **Preflight before any install:** existence, size and sha256 of every archive, SRI when declared,
  inner `package/package.json` name/version, and fileCount. The policy sha256 and schema are checked too.
  Negative controls prove hash and version rejection.
- **Freeze:** each archive is copied to a scratch cache and the copy is re-hashed against the declared
  sha256. All later reads (`file:` specs, unpacking, byte comparison) use the frozen copy. There is no
  repack anywhere.
- **Installed-content verification:** every archive file is compared by sha256 against the installed
  tree, and missing or extra files fail.
- **Honest transport:** the receipt records `local-candidate-tarball` and
  `registryProvenanceClaimed: false`. The harness never simulates registry retrieval.
- **Restored manifest specs:** after install, `package.json` is restored to exact registry-shaped versions.
  This is the reading `graph.mjs:276,318` allows ("materialization provenance delegated to outer
  installer"). The restored specs are now also required to equal the shipped starter's exact pins.
- **External qualification:**
  - Inputs: the external policy path, `--policy-sha256`, `--expected-core-version`, and the checker version from the verified archive.
  - The envelope is validated by `isQualificationPass`, which checks schema, mode, outcome, exitCode, scope, policy source/sha/version/grants/exceptions, core pairing, checker and parser versions, and the full catalog.
  - `manualReviewRequired === true` and `limits` deep-equal `LIMITS` are asserted.
  - Rule scope is not weakened: the checker and policies are unchanged.
- **Negative controls:** each checker control (wrong policy pin, wrong core pin, incomplete analysis)
  changes a single input against a synthetic app that first passes with the correct inputs. The
  synthetic app is labelled `synthetic-smoke-app`. It never stands in for qualification, which targets
  the materialized shipped starter.
- **No source fallback:** a missing shipped recipe throws.

## Gemini self-test regression (npm replaced the checker)

Current install path for every recipe and the qualification app:
1. Every candidate is installed through `file:<frozen tgz>` during the single `npm install`.
2. The byte check runs on every candidate right after the install.
3. The exact version is restored in `package.json`; the starter's pins are asserted equal first.
4. The recipe's commands run. None of them is an npm install.
5. The byte check and lockfile identity/integrity check run again.

A registry copy, a nested copy, or a byte change to any first-party package now fails closed. The
earlier manual pre-extraction (`materializeCandidatePackages`) is redundant, because npm overwrites it.
It is harmless but should be dropped (see Factoring).

## Starter / consumer exact-policy transition (independent review)

**Consumer delta.**
- The R3 shipped `package/consumer/package.json` (sha256 `f54301ef…`, also byte-identical in R4's core,
  which has the same core sha `30e044e1…`) differs from baseline `d8561c7a…` in exactly three lines:
  - `check:architecture … --expected-core-version 0.13.1`
  - `@composable-svelte/core: 0.13.1`
  - `@composable-svelte/architecture: 0.13.1`
- Svelte `5.57.0` is unchanged, and no policy pin is embedded. **Approved.**

**Candidate policy.**
- `candidate-starter-policy.json` (`cb1202db…`) against the bundled `policies/starter.json`
  (`389430147e…`) differs only in:
  - `policyId` (`bundled-starter` → `candidate-starter`) and `policyVersion` 0.13.0 → 0.13.1
  - `supportedCore.min` 0.13.0 → 0.13.1 (narrower)
  - the opaque core pin 0.13.0 → 0.13.1
- The rules, inactive entries with their reasons, grants, exceptions, records and the Svelte 5.57.0 pin are identical.
- There is no range approval or widening. **Approved as the external candidate starter policy.**

Conditions on the transition:
- The checker 0.13.1 bundled starter will be different bytes: a different `policyId` and a new
  `BUNDLED_STARTER_SHA256`. It needs its own pin review; `cb1202db…` does not cover it.
- Record the prior bundled hash `389430147e…` in the release evidence, as the plan requires.
- The shipped starter pins checker 0.13.1 and runs `bundled:starter` with core 0.13.1. The only checker
  archive that exists is 0.13.0, whose bundled starter approves core 0.13.0.
  - The `core-starter` recipe on R3 therefore fails, correctly, before any install: "Shipped starter pins checker 0.13.1, candidate checker is 0.13.0".
  - Recipe qualification of the final starter needs the reviewed checker 0.13.1 archive.
- **Runtime-lane state divergence (for the runtime coordinator).**
  `/private/tmp/companion-runtime-release/candidate/packages/core/consumer/package.json` was rewritten at
  14:03:55 CEST, after R3 was generated at 14:02:59. It is now byte-identical to the 0.13.0 baseline
  (`d8561c7a…`). R3 and R4 contain the correct delta, but any repack from the current candidate tree
  would regress the starter. `CORE-CONSUMER-STAGING.md` still describes the three changes as staged.

## Receipts: what each one is and is not

- `evidence/provisional-starter/` covers provisional core `89b96137…` and is **superseded**.
  - Its `fullQualificationClaimed: true` is a misstatement: it was a checker-only phase.
  - It was checked with checker tarball `1c21ba24…`. That tarball is a locally assembled self-test archive: 94 entries, including 52 `*.test.mjs` files. It is not the published 0.13.0 and not an `npm pack` artifact, which has 32 entries.
  - It is not final qualification and does not qualify the R3 core.
- `evidence/opus-review-exercise-NOT-FINAL/` holds infrastructure exercises against R3 bytes. It is **not qualification**.
  - `subset-code-combined`: PARTIAL, exit 2 (code-managed, chat-code-media, the materialized-starter checker phase, and all 6 controls ran).
  - `qualification-phase`: narrow, core `30e044e1…`, with policy `cb1202db…` and checker `1c21ba24…`.
  - `core-starter-recipe`: FAILED, as expected, on the checker pin.

## Test evidence

- Harness suite: 31 → **36 passed, 0 failed** (`node --test scripts/verify-release-archives.test.mjs`).
  The new tests cover:
  - symlink entries and entries outside `package/`
  - dual checkpoint, unknown mode and unknown recipe rejection
  - a missing recipe package
  - a stale PASSED receipt replaced by FAILED
  - lockfile guards for registry, nested, altered-integrity and missing entries
  - the three changed tests now expect PARTIAL/exit 2 for checker-less negative controls
- Mutation check: I removed each new guard in turn and re-ran the suite; each removal made the suite fail.
  - tar type check: 1 failure
  - checkpoint list: 1
  - failure receipt: 1
  - nested-copy check: 1
  - lock integrity: 1
  - PARTIAL exit: 2
  - unlisted scoped package: 1
- Architecture suite: 529/529 passed.

## Scope and factoring

The file grew from 2,651 to 2,857 lines. Nine recipe runners each repeat the same pattern (~60 lines each): write a manifest, install, restore,
verify, and build the receipt. The cleanup I recommend after landing, not as a blocker, is one
`installCandidates(dir, pkgs, extraDeps)` plus a per-recipe step table, and dropping the manual
pre-npm extraction. I did not refactor, to keep the delta reviewable. No generic framework is needed.

## Remaining limitations (not blockers; state them in any final receipt)

- **Policy file:** it is read from its original path and not frozen. The checker's `--policy-sha256` pin
  and the sha comparison in `isQualificationPass` make a swapped policy fail closed.
- **Pass predicate source:** `isQualificationPass` and `LIMITS` come from the repo checker source, not the candidate checker.
  A mismatch fails closed. The final run should use the repo at the checker's release commit.
- **Checker archive fields:** `checkerArchive` accepts no `integrity`/`fileCount`.
- **Negative-control coverage:** `wrong-archive-hash` tampers with the first package only. The checker controls run on the
  synthetic app, by design.
- **Chat recipe:** it adds `isomorphic-dompurify ^2.16.0` at the root. Chat declares the same range as a dependency, but the README does not list it.
- **Browsers:** the harness does not run the README's `npx playwright install chromium` step. A missing browser
  fails honestly.
- **Not exercised by me:**
  - auth-consumer, the charts/graphics/maps fixtures, chat-managed and media-managed
  - the `minimum` checkpoint
  - a full `all` run
  - `verify-consumer.mjs`
  - These belong to the runtime recipe matrix owner, after clearance.
- **Microphone gate:** the physical microphone gate remains open.

## Required before CLEAR TO LAND

1. A focused independent re-review of my delta (B1–B11 and the minor fixes), in
   `verify-release-archives.mjs`, its tests and `verify-consumer.mjs`.
2. One real run of the patched `verify-consumer.mjs` on built packages. It will fail its new assertion
   while the consumer pins checker 0.13.1 and the workspace checker is still 0.13.0. That failure is
   intended: the starter pin and the checker version must land together.

Final release qualification also needs the runtime R3 clearance, the reviewed checker 0.13.1 archive with
its bundled starter pin review, and then a full `all` run at each checkpoint.

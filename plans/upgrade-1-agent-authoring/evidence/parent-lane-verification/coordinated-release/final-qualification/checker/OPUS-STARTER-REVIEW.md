# Independent review: checker 0.13.1 bundled-starter preparation

Reviewer: Claude Opus 5.5, fresh context, 2026-09-26. Workspace `/private/tmp/composable-final-checker`.
Baseline: unchanged 0.13.0 at `/private/tmp/composable-final-qualification/repo/packages/architecture`.
I did not edit main, commit, push or publish, and I registered no companion profile. Every run below is a
**reviewer exercise, NOT FINAL release qualification**.

## Verdict

**CLEAR FOR PROFILE PREPARATION.**

- **Scope.** This covers the starter-only preparation bytes: archive `7cae973a…`, 32 files, with the embedded
  bundled-starter pin `f2821ebf…`.
- **Not a final release artifact.** These bytes will change when qualified companion profiles are
  registered. The next checker archive needs its own review and an affected requalification (see
  Remaining gates).
- **Carry-forward conditions.** Two findings are not blockers for this preparation artifact:
  - **R1:** an imprecise README sentence.
  - **R2:** a stray `/private/tmp/node_modules` symlink.

  Both must be closed before or during the profile phase.

## 1. Exact identities (recomputed from the bytes)

| Item | Value | Source of truth |
|---|---|---|
| Prior bundled starter (baseline 0.13.0) | `389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3` | `shasum` of baseline `policies/starter.json` |
| Proposed bundled starter (0.13.1) | `f2821ebf0fa5cd34b346361089edd56bb4ec01a40c59eb969c60f90c7e77d190` | `shasum` of workspace `policies/starter.json`, and of the same entry inside the archive |
| Embedded pin `BUNDLED_STARTER_SHA256` (`src/bundled-policy.mjs:6`) | `f2821ebf…d190` (equals the bytes) | source and archive |
| External candidate starter (reference only, not reused) | `cb1202db69cd344c1958db21b4d9299cce5d9bb9841faa9407dc7bf63487dc7f` | `shasum` |
| Checker archive `composable-svelte-architecture-0.13.1.tgz` | sha256 `7cae973afd0303d16b8fbc205d357be2a381344e95b27fd67f70718a12d03843` | `shasum` |
| ″ SRI | `sha512-boC+4UJPbklBvKJ750sdoDSm8zHtk/94EL+qowxBd61RUKK/EaprRaFetOPgY6mT7aerb/EbALhlBOuEvZIW+g==` | `openssl dgst -sha512` and `npm pack --json` |
| ″ size / entries | 93,384 bytes / 32 files | `stat`, `tar tzf` |
| R4 core `composable-svelte-core-0.13.1.tgz` | sha256 `30e044e1…d112d18b`, `sha512-b+Il+IqyrK4A…jW1vA==`, 995,049 bytes, 1,258 files | recomputed; matches R4 `MANIFEST.json` |
| Harness (read-only, cleared) | `01e71e02ca3205096e35902d9eebbba788ee4c169c9a7cf8f64e7ab4359552c9` | `shasum` |

- **HANDOFF SHA-512 is wrong.** The HANDOFF table value for the checker, `sha512-boC+4UJPbklBvN55F7lO5iF1…`,
  is inaccurate prose.
- **The correct SRI** is the one above. It is identical to the SRI in `COORDINATOR-STARTER-ARCHIVE-IDENTITY.json`.
- **No bytes were changed to match the prose.**
- **The archive is reproducible.** An independent `npm pack` (npm 11.6.0) of the workspace source, run in an
  isolated copy, produced exactly `7cae973a…`: same SRI, 93,384 bytes, 32 entries. So the archive derives from
  the source by `npm pack` and was not hand-tarred.

## 2. Scoped diff against the 0.13.0 baseline (12 files, all verified)

**Policy delta.** `policies/starter.json` changes on exactly 3 lines:

- `policyVersion` 0.13.0 → 0.13.1
- `supportedCore.min` 0.13.0 → 0.13.1
- the `@composable-svelte/core` opaque `version` 0.13.0 → 0.13.1

Unchanged:

- `policyId: "bundled-starter"`
- `maxExclusive: "0.14.0-0"`
- `svelte` 5.57.0 (`provenance: registry`)
- roots `src/main.ts`
- 5 active rules at severity error
- 2 inactive rules (`presentation/no-fabricated-view`, `adapters/least-authority`), with reason and detail unchanged
- `capabilityGrants`, `exceptions` and `qualificationRecords` all `[]`

Nothing is widened, and there are no new rules, grants or exceptions.

**Relation to the external candidate.** Compared with the external candidate `cb1202db…`, the only differences
are `policyId` (candidate-starter vs bundled-starter) and a trailing newline. That is why its pin was correctly
not reused.

**Other changed files:**

- **`src/bundled-policy.mjs`:** only the pin line changed. The registry still contains only `starter`, so no
  companion profile is registered.
- **`src/check.mjs`:** `CHECKER_VERSION` 0.13.0 → 0.13.1.
- **`package.json`:** `version` 0.13.1. The parser dependencies stay exact: `typescript` 5.9.3 and `svelte` 5.57.0.
- **`README.md`:** the three 0.13.0 → 0.13.1 edits. See R1.
- **`CHANGELOG.md`:** a new `[0.13.1] - 2026-09-26` entry.
- **`test/installed-bin-smoke.mjs`:** the expected version is 0.13.1.

**Test expectations:**

- **Now 0.13.1 (correct, because they assert the running checker's version):**
  - `EXPECTED_CHECKER` in `qualification.test.mjs` and `computed-data-keys-cli.test.mjs`
  - `expectedCheckerVersion` in `graph.test.mjs`
- **Updated because the bundled starter now requires 0.13.1:** `check.test.mjs`, where the bundled fixture
  core and default expected version are 0.13.1, and the `checker.version` assertion.
- **`bundled-policy.test.mjs`:** `supportedCore.min`.

**Old-version fixture intent is preserved:**

- **`EXPECTED_CORE = '0.13.0-next.1'`** is kept in the qualification, graph and computed-data-keys tests. These
  are external policies inside the checker's known prerelease range.
- **`cli-analysis.test.mjs`:** the external stable 0.13.0 policy and core are unchanged.
- **`policy.test.mjs`:** the range and pairing cases are unchanged.
- **`check.test.mjs`:**
  - The mismatch case (`0.13.0-next.2`) still mismatches the installed 0.13.1.
  - The synthetic envelope (`expectedCheckerVersion: '0.13.0'`, line 126) is self-consistent. It still tests
    envelope matching, not the live version.

There are no mass replacements.

## 3. Independent evidence (reviewer exercise; files in `evidence/opus-starter-review-NOT-FINAL/`, see `SHA256SUMS`)

I ran everything outside `/private/tmp`, in `$TMPDIR/opus-suite-gT83`, so that the stray symlink (R2) could not
affect module resolution.

1. **Checker suite.**
   - **Setup:** an isolated copy of `packages/architecture` with registry-fetched exact `typescript@5.9.3` and
     `svelte@5.57.0`.
   - **Result:** `npm test` found 52 test files, and **529 pass / 0 fail**. The same count holds after my two
     test edits (`suite2.log`).
   - **Correction:** HANDOFF says "39 test suites". There are 52 files, and the node reporter shows 1 suite.
2. **Archive inspection.**
   - **Result:** `node test/inspect-archive.mjs <7cae973a…>` returns `archive-matches-source`, with 32 entries and
     `policies/starter.json` = `f2821ebf…`. The script also checks each archived registered policy against its
     embedded pin.
   - **Independent comparison:** all 32 archive files are byte-identical to the source.
   - **Test exclusion:** no `test/`, `*.test.mjs` or `src/*.md` entries are packaged.
3. **Real shipped starter from R4.**
   - **Materialization:**
     - I extracted the shipped `package/consumer` from core `30e044e1…`. Its pins are core `0.13.1`, devDependency
       architecture `0.13.1`, `check:architecture --expected-core-version 0.13.1`, and svelte `5.57.0`.
     - I installed core and checker from **local candidate tarballs** (sha256 verified). The candidate specs were
       temporarily `file:`, and `package.json` was then restored byte-identical to the shipped bytes (registry-shaped
       specs). The lockfile was removed.
   - **Provenance, labelled honestly:** this is a local-tarball materialization with independently checked bytes
     and a registry-shaped identity. It is **not** registry retrieval.
   - **Installed bytes:**
     - core has 1,258 files and 0 mismatches; architecture has 32 files and 0 mismatches.
     - Neither package is a symlink.
     - The installed versions are svelte 5.57.0, typescript 5.9.3, vite 7.3.6, vitest 4.0.7, svelte-check 4.3.3
       and playwright 1.56.1.
   - **Commands:**
     - `npm run check` shows 0 errors and 0 warnings.
     - `npm test` shows 2/2 passed.
     - `npm run test:ssr` shows "SSR smoke renders the expected initial state".
     - `npm run check:architecture` exits 0, with bundled `f2821ebf…`, checker 0.13.1, core paired 0.13.1/0.13.1,
       5 enforced, 0 unavailable, 0 violations, 0 errors, 2 inactive and 15 limits.
4. **Installed bin smoke.** `test/installed-bin-smoke.mjs <realpath project>` returns `installed-bin-smoke-passed`;
   bundled qualification exits 22.
5. **External exact envelope and negative controls** (`controls.mjs` / `controls.ndjson`; installed 0.13.1 bin,
   `--records-root`, `--today 2026-09-26`, `isQualificationPass` from the installed checker). All 12 were as expected.

| Case | Exit | `isQualificationPass` | Note |
|---|---|---|---|
| External candidate `cb1202db…`, core 0.13.1, checker 0.13.1 | 0 | **true** | `passed`, 5 enforced, 2 inactive, 15 limits, `manualReviewRequired`, `bounded-five-family-detectors`, `bundledProfile: null` |
| Proposed bundled bytes `f2821ebf…` supplied externally | 0 | **true** | The exact registered bytes qualify when externally pinned |
| Same run; verifier expects checker 0.13.0 | 0 | false | Envelope checker pin |
| Same run; verifier expects the wrong policy pin | 0 | false | Envelope policy pin |
| Wrong `--policy-sha256` | 21 | false | `policy-pin-mismatch` |
| Wrong expected core 0.13.0 | 21 | false | `core-version-mismatch` |
| Prior bundled `389430…` against shipped core 0.13.1 | 21 | false | Opaque approval mismatch (0.13.1 ≠ 0.13.0) |
| Incomplete analysis: unapproved, undeclared import (`clsx`) | 21 | false | `unresolved-package-import` |
| In-range core 0.13.2, candidate policy | 21 | false | Opaque approval is exact 0.13.1 |
| `bundled:starter`, in-range core 0.13.2 | 21 | n/a | Same; this demonstrates R1 |
| `bundled:starter`, core 0.13.0 | 21 | n/a | `unsupported-core-version` + opaque mismatch |
| `bundled:starter` in qualification mode | 22 | n/a | "bundled policy is developer feedback only" |

6. **Browser.** I did **not** re-run it. The runtime matrix holds the browser lease, and a re-run is not
   necessary: the checker is a dev-only CLI and is not in the browser bundle, while the core bytes and the app
   are the same. I inspected the recorded evidence instead:
   - **Pre-registration** (transcript step 225, interim checker): 2 passed + 1 passed.
   - **Post-registration** (receipt `core-starter` `npm run test:browser`, exit 0, against `7cae973a…` and
     harness `01e71e02…`): 2 passed + 1 passed.

## 4. Ordering: was the starter externally qualified before registration?

**Yes.** The preparation transcript (`starter-preparation.ndjson`) shows this order:

1. **Steps 186–188:** `npm pack`. This produced the interim archive `b6c8c68e…`, still with starter `389430…`.
   Its inspection shows it differs from `7cae973a…` **only** in `policies/starter.json` and the pin line of
   `src/bundled-policy.mjs`, so the checker code, including `CHECKER_VERSION` 0.13.1, is identical.
2. **Step 200:** `--mode qualification` with the candidate `cb1202db…` gave `ARCHITECTURE_QUALIFICATION_PASSED`.
3. **Steps 219–225:** check, test, SSR and browser all passed in the materialized shipped starter.
4. **Step 227:** `--mode negative-controls` gave `NEGATIVE_CONTROLS_PASSED`.
5. **Steps 234–242, only after that:** the new starter policy and pin were registered.
6. **Steps 280–319:** repack (`7cae973a…`), inspection, installed smoke, `--mode recipes --recipe core-starter`
   (`RECIPES_PASSED`) and `--mode all --recipe core-starter` (`PARTIAL_RECIPES_SUBSET`, exit 2). The exit 2 is
   correct, because the companion recipes are intentionally not run.

**Evidence-labelling defects.** These concern documentation only, not the verdict:

- **Misnamed evidence directory.** `evidence/pre-registration-qualification/` holds only the **post-registration**
  step-319 receipt (14:53, checker `7cae973a…`, mode `all`). The pre-registration receipts were overwritten. They
  survive only as transcript output, and the interim archive `b6c8c68e…` was overwritten under the same filename.
  Treat that directory as a post-registration starter-subset receipt, and treat `b6c8c68e…` as superseded.
- **Harness version for the pre-registration runs.** Those runs (around 14:46–14:48) probably ran just before the
  cleared harness `01e71e02…` landed (file mtime 14:48:35). The only reviewed delta is the two-line mode-`all`
  completeness fix, which cannot affect the `qualification` or `negative-controls` modes. The surviving
  post-registration receipt and my independent run (§3.5) both use cleared or independent paths.
- **The harness's own controls use a synthetic app.** Its wrong-pin and incomplete controls run on a
  `synthetic-smoke-app`. My §3.5 controls run on the real shipped starter.

## 5. Corrections I applied (outside the shipped archive; the archive is unchanged at `7cae973a…`)

Neither file is packaged (`test/`, `!src/**/*.test.mjs`). A re-pack after the edits is still exactly
`7cae973a…`, and the suite still shows 529/529.

| File | Before | After |
|---|---|---|
| `test/installed-bin-smoke.mjs` | `63ef79f5543b29742cf11e5a1f78b2a93309e37e9845579cafddf468865ae7bd` | `b8ec1556dd17651e1368aa7bc85b52c034bbc7af5866cc720bf2ab063dd7a596` |
| `src/bundled-policy.test.mjs` | `408039bad8de4434f689a69ac5762d8cfe61096dbca3a3d9492e4010443a7210` | `020686a24e8262b8ff16e4811e327aa7859161e9da5ecfc0b0aa08116e8c792a` |

- **`installed-bin-smoke.mjs`: path canonicalization.** The change is `const project = realpathSync(resolve(argv[2]))`.
  - **Defect:** HANDOFF §6.1 is confirmed. Passing `/var/...` falsely failed because `/var` is a symlink to
    `/private/var`.
  - **Checks now:** via the `/var` alias it exits 0, via the real path it exits 0, and a project whose
    `node_modules/@composable-svelte/core` is a real symlink **still fails** ("must not be a workspace link").
  - **No weakening:** links inside the project, including a linked `node_modules`, are still rejected.
- **`bundled-policy.test.mjs`: four assertions.** They pin `policyId` `bundled-starter`, `policyVersion` 0.13.1 and
  the exact `opaquePackages` (core 0.13.1 and svelte 5.57.0, both registry).
  - **Mutation check:** I raised the core approval to 0.13.2 and re-embedded a matching pin. Before this change
    every starter test still passed; now the test fails.

Both edits are small test code and still need the focused independent review required for changed code. The
four new assertions also sit in the starter-shape test, which the profile phase's affected review will touch
anyway.

## 6. Findings not fixed here (carry-forward conditions)

- **R1: public guidance is imprecise about exact approval versus supported range. Docs only; must be fixed in
  the next archive.**
  - **The problem:** `README.md:6` says "The bundled starter policy targets stable core `0.13.1` through `0.13.x`."
    But the starter's opaque approval is **exact** core 0.13.1 and svelte 5.57.0. In §3.5, an installed core
    0.13.2 with `bundled:starter` exits 21. `supportedCore` is only the pairing bound.
  - **Why I left it unfixed:** the same wording existed in 0.13.0. Editing README now would change the reviewed
    32-file archive for a docs-only issue, and the profile phase must rewrite this README section anyway (the
    registry list).
  - **Proposed replacement:** "The bundled starter policy (`bundled-starter` 0.13.1) approves exactly
    `@composable-svelte/core` `0.13.1` and `svelte` `5.57.0` as opaque packages. Its supported core range
    (`>=0.13.1 <0.14.0-0`) is the pairing bound, not an approval: any other installed core, even inside that
    range, is rejected until a checker release ships a newly reviewed starter pin."
- **R2: environment contamination outside this workspace. Must be removed by the coordinator.**
  - **The problem:** the preparation agent ran `ln -s …/composable-final-qualification/repo/node_modules
    /tmp/node_modules` (transcript step 102). `/private/tmp/node_modules` now exists (created 14:41). Every
    Node process under `/private/tmp` can silently resolve missing dependencies through it, including runtime and
    harness work in `/private/tmp/companion-runtime-release` and `/private/tmp/composable-final-qualification`.
  - **Which evidence depended on it:** the preparer's in-workspace `npm test` (the HANDOFF "529") resolved
    TypeScript and Svelte through it. The harness recipe runs used `/var/folders` and did not. My §3.1 re-run is
    isolated and stands in for that evidence.
  - **Why I did not remove it:** it lies outside my scope, and the runtime matrix may be running concurrently.
  - **Recommendation:** the coordinator removes it at a safe point, then confirms that no accepted receipt
    produced under `/private/tmp` after 14:41 relied on it.
- **R3: HANDOFF inaccuracies.** Beyond the SHA-512:
  - "39 test suites" (actually 52 files).
  - §3 implies the evidence directory holds the pre-registration receipts (see §4).
  - §3.1 does not name the interim checker `b6c8c68e…`.

  The HANDOFF also records `chmod 777` on the workspace, attempted and refused (no effect). None of these
  changes the verdict.
- **Minor:** the CHANGELOG entry uses "### Added" for what is a starter re-pin. Optional wording change.

## 7. Boundaries preserved

- **Starter only.** The registry contains only `starter`; unknown selectors, including `bundled:code`, `media`,
  `chat` and `chat-code-media`, remain usage errors, and README still says companion profiles are not selectable.
- **Auth+Charts external-only boundary.** It is untouched: no Auth, Charts or combined profile exists in the
  package, registry or archive.
- **Detectors.** No detector, rule-scope or parser-dependency change.
- **Runtime matrix not repeated.** I did not repeat the companion min/newer runtime matrix, which the runtime
  coordinator owns.

## 8. Remaining gates (not satisfied by this review)

1. **Focused review of my edits.** Independent review of my two test-only edits (§5).
2. **Close R1 and R2.** Apply R1 in the next archive; the coordinator removes the R2 symlink and checks its
   dependents.
3. **Profile phase, only after exact R4 runtime recipe receipts clear:**
   - the seven individual profiles plus `chat-code-media`, each externally qualified with exact
     policy/core/checker pins before registration;
   - README and registry documentation, including the Auth+Charts external-only boundary;
   - updated tests and archive coverage.
4. **Final checker archive.** A new `npm pack`, archive inspection, installed-byte verification, installed bin
   smoke, starter plus affected profile checks, and a full harness `all` run at each checkpoint. That includes a
   fresh browser run once the lease allows it.
5. **This review is not final evidence for that archive.** It qualifies nothing beyond the current starter-only
   preparation bytes `7cae973a…`, and it makes no release, publish or registry-provenance claim.

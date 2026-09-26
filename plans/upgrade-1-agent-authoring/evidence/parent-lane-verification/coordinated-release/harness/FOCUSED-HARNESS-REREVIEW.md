# Focused independent re-review: Opus corrections to the final qualification harness

Reviewer: Claude Opus 5.5, fresh context, 2026-09-26. The scope is the Opus delta only, measured against
`pre-opus/scripts/*`. I made no edits to `repo/`, and did no commit, push, publish or main edit. Every
run below is a **reviewer exercise, NOT FINAL qualification**.

## Verdict

**BLOCK: `verify-release-archives.mjs` as submitted (`c108eb72…`)**, on one concrete false pass
(F1 below). The fix is two lines.

**CLEAR TO LAND after exactly that correction.** The corrected file has sha256
`01e71e02ca3205096e35902d9eebbba788ee4c169c9a7cf8f64e7ab4359552c9`. Nothing else changes: the test file
stays `cbcff88e…` and `verify-consumer.mjs` stays `055f117a…`.

- **`verify-consumer.mjs` (`055f117a…`): CLEAR.** It ran for real in the landing state (see below).
- **`verify-release-archives.test.mjs` (`cbcff88e…`): CLEAR.**

This clearance covers **infrastructure only**. It is not a runtime, starter or profile release
qualification of anything. Still to come:

- the reviewed checker 0.13.1 archive, with its bundled-starter pin review;
- profile generation and registration;
- the min/newer recipe matrix on R4, which the runtime coordinator owns.

## Smallest correction first (F1, blocking)

**F1. Mode `all` claims full qualification while recipes silently did not run.**

- Without `--recipe`, each recipe runs only if its packages are in the manifest (lines 2369–2502), and a
  missing one is skipped without error.
- `allRecipesRan` (line 2591) is `(!selectedRecipes || …includes('all')) && recipeResults.length > 0`,
  so one executed recipe is enough.
- `recipesNotRun` is recorded, but it never reaches `incompleteReasons`.
- Opus fixed this class (B7) only for recipes named explicitly with `--recipe`.
- The coordinator's rule is that "unavailable recipes … cannot silently become PASSED in requested modes."

The patch (`evidence/focused-rereview-exercise-NOT-FINAL/fix-scratch/proposed-fix.diff`):

```diff
@@ -2588,7 +2588,7 @@
     } else if (mode === 'all') {
       const hasCheckerAndPolicy = Boolean(frozenChecker && manifest.policy && archQualification);
-      const allRecipesRan = (!selectedRecipes || selectedRecipes.includes('all')) && recipeResults.length > 0;
+      const allRecipesRan = recipesNotRun.length === 0;
@@ -2597,7 +2597,7 @@
       if (!allRecipesRan) {
-        incompleteReasons.push('Only a subset of recipes was executed (--recipe filter)');
+        incompleteReasons.push(`Recipes not executed: ${recipesNotRun.join(', ')}`);
       }
```

**Demonstration.** The control is a synthetic, reviewer-built core. It is R4 core `30e044e1…` repacked
with these changes to its consumer:

- The consumer's scripts are replaced by labelled `SYNTHETIC STUB` echoes.
- Its checker pin is set to 0.13.0, so that the only existing checker archive (`1c21ba24…`) passes the
  core-starter pin assertion.

The manifest held only that core, the checker, and candidate policy `cb1202db…`. Evidence is in
`evidence/focused-rereview-exercise-NOT-FINAL/f1-control/`.

| Harness | Verdict | `fullQualificationClaimed` | Exit | Recipes run |
|---|---|---|---|---|
| submitted `c108eb72` | **PASSED** | **true** | **0** | core-starter only; 8 not run |
| patched `01e71e02` | PARTIAL_RECIPES_SUBSET | false | 2 | same; reason lists the 8 |

- With the full R4 manifest, all 9 recipes would run, so the planned final run would not have hit this.
  The harness must still not certify a full pass from an incomplete manifest, and dropping a single
  companion is enough to trigger it.
- The patched copy passes the unit suite 36/36.
- No existing unit test covers this path: the submitted and patched files both pass 36/36. The
  before/after control above is the evidence that the fix works. A unit test would need a recipe that
  really executes, so I did not add one.
- With the patch, naming all 9 recipes explicitly now reads as complete, which is correct. Before, it
  read as a subset.

## Independent checks of the requested properties (on `c108eb72` bytes)

**Delta scope.**
- Against `pre-opus-sha256.json`, 119 of 122 files are unchanged. The three changed files are exactly
  the reviewed scripts.
- Against `baseline-sha256.json`, 119 of 120 are unchanged; only `verify-consumer.mjs` differs.
- The checker, its policies and `packages/core/consumer` are untouched.

**Immutable hash validation before any install.**
- Checked in `verifyArchivesPreInstall`, before any scratch directory or install exists:
  - existence, regular file, non-empty
  - sha256, and SRI when declared
  - fileCount
  - inner name and version
  - checker sha256, name and version
  - policy sha256 and schema
- `freezeCandidateArchives` re-hashes the frozen copy and now re-checks SRI (`integrity` is propagated,
  line 461).
- Every `file:` spec, extraction and byte comparison reads the frozen path.
- A hash failure after the evidence directory is known writes a FAILED receipt. The test with a
  pre-seeded stale PASSED receipt passes.

**Safe archive paths and entry types.**
- `inspectTarEntries` rejects:
  - absolute and `..` paths
  - entries outside `package/`
  - any `tar -tv` type other than `-` or `d`
  - a listing-count disagreement
- I checked hardlinks separately on macOS bsdtar: a hardlink lists as `h` and is rejected.

**Exact installed bytes after npm; lock identity; no later replacement.** On R4 bytes, after the
recipes' commands ran, `postRunVerification`:
- re-compared every installed file of every candidate with the frozen archive (core 1258 files, code
  69, chat 157, media 101);
- showed every `@composable-svelte/*` lock entry at top level, `resolved: file:…/frozen-archives/…tgz`,
  with lock `integrity` equal to the frozen archive's sha512.

The qualification app's recheck covered core and checker. Registry, nested, altered-integrity and
missing lock entries are rejected by unit tests.

**Real shipped Code and combined recipes executed.** From my R4 run with `--mode all --recipe
code-managed,chat-code-media` (`r4-code-combined-all-subset/`), on the exact `c108eb72` bytes:

- **Code, `runNodeCanvasActionControls`:** the controls ran against the installed Code README's Canvas
  example.
  - As shipped: exit 0.
  - Identity `liftAction` omitted: exit 0.
  - Incompatible mapper: exit 1, with "not assignable to type … NodeCanvasAction". A rejection for any
    other reason would fail the harness.
- **Code suite:** vitest, 1 test passed.
- **Combined chat-code-media:** each shipped suite ran against the one install. Chat 1, Code 1 and
  Media 2 tests passed, all at Svelte 5.55.3.
- **Why I re-ran this:** Opus's R3 `subset-code-combined` receipt is timestamped 12:17Z, before the
  final file's mtime (12:19:50Z), so it was produced by an intermediate version. This R4 run supersedes
  it as evidence for the final bytes.

**Honesty of narrow, partial and failed receipts.**
- `qualification` → `ARCHITECTURE_QUALIFICATION_PASSED` with `fullQualificationClaimed: false` and a
  narrow reason.
- `recipes` → narrow reason. `negative-controls` without the checker controls → PARTIAL, exit 2.
- `--skip-browser` → per-recipe `partial-browser-skipped` → PARTIAL, exit 2.
- A dual checkpoint, an unknown mode, or an unknown or missing recipe → exit 1.
- The only hole is F1.

**External policy, core and checker pins, and completeness negative controls.**
- The checker runs with `--policy <external> --policy-sha256 --expected-core-version`.
- `isQualificationPass` checks policy source/sha/grants/exceptions, core pairing, checker and parser
  versions, and the full catalog.
- On R4, all 6 controls passed: hash and version rejected before install; wrong policy pin, wrong
  core pin and incomplete analysis each exited 21. The first positive run passed.

**Inactive rules and manual review stay explicit.**
- The R4 envelope lists `rules.inactive` = `presentation/no-fabricated-view` and
  `adapters/least-authority`, each marked `not-active` and "requires independent architectural review".
- `manualReviewRequired: true` is asserted, and `limits` must deep-equal `LIMITS`.
- The candidate policy keeps both inactive entries verbatim.

**Mutation spot-check of Opus's guards.** I removed each guard in turn:

| Guard removed | Suite result |
|---|---|
| tar type | 1 failure |
| lock integrity | 1 failure |
| nested copy | 1 failure |
| failure receipt | 1 failure |
| PARTIAL→exit 0 | 2 failures |

This reproduces Opus's claims.

## `verify-consumer.mjs`: legacy CI checker pack and injection (CLEAR)

The delta is +7 lines:
- It packs `packages/architecture` with `npm pack --ignore-scripts`.
- It injects the `file:` spec into scratch copies of the starter and the combined app. It never edits
  shipped sources.
- It asserts that the shipped starter's checker pin equals the packed version.

**Real run, landing state** (`evidence/focused-rereview-exercise-NOT-FINAL/verify-consumer/`). The
scratch root combines the patched script (`055f117a…`), the 8 extracted R4 archives as the built
packages, and the repo checker source with its version set to 0.13.1.

- **Result:** `Consumer verification passed`, exit 0, 1m32s.
- **Controls:** all 14 README positive/negative controls ran. Also covered: the standalone starter
  without satellites, 52 typed entry points (Bundler and NodeNext), the Tailwind 3 production check, and
  the browser suites.
- **Checker resolution:** in both the starter lock and the app lock, `@composable-svelte/architecture@0.13.1`
  resolves `file:…/packs/composable-svelte-architecture-0.13.1.tgz` (32 entries).
- **Shipped consumer preserved:** the packed shipped consumer (`f54301ef…`) still pins `0.13.1`
  publicly. So the unpublished checker resolves locally with no alias, skip or weakening.

**Mismatch control:** R4 consumer pinning 0.13.1 against a checker at 0.13.0 fails the new assertion
(`'0.13.1' !== '0.13.0'`), before any install. As Opus noted, the starter pin and the checker version
must land together.

**Limitation:** the R4 packages stand in for a local `pnpm build`, which needs a workspace install that
is absent here. Like the pre-existing script, this one does not run the starter's `check:architecture`.

## Non-blocking notes (for a later cleanup; do not widen scope now)

1. **Standalone `qualification` mode checks only the core pin.** On the materialized-starter path it
   does not check the shipped checker or Svelte pin, and it forces Svelte 5.57.0. My R4 run qualified
   the starter with checker 0.13.0 against a shipped pin of 0.13.1.
   - This is acceptable as a labelled narrow phase: mode `all` requires core-starter, which asserts all
     three pins, and F1's fix makes that unskippable.
   - Worth adding the same asserts once checker 0.13.1 exists.
2. **Some early failures leave no receipt.** If a run fails before the evidence directory is known
   (bad mode, checkpoint or recipe with no `--evidence-dir`, or a schema error), no FAILED receipt is
   written, and a stale receipt can survive; the exit code is still 1. `preflight` mode writes no
   receipt. Final runs should always pass `--evidence-dir`.
3. **Installed-tree walk skips symlinks.** `collectDirectoryFiles` ignores symlinks in installed trees.
   The tar type guard and the `file:`-tarball lock check make this theoretical.
4. **Opus's limitations still stand:**
   - the policy file is read in place, not frozen;
   - `isQualificationPass` and `LIMITS` come from repo source, so the final run needs the repo at the
     checker's release commit;
   - `checkerArchive` has no integrity or fileCount;
   - the checker controls run on the labelled synthetic app;
   - the chat `isomorphic-dompurify` root dependency;
   - Playwright browsers are not auto-installed;
   - the physical microphone gate is open.
5. **Not exercised by me:** auth, charts, graphics, maps, chat-managed and media-managed recipes; the
   `minimum` checkpoint; a full nine-recipe `all` run. These belong to the runtime coordinator's matrix.

## Evidence index (all NOT FINAL)

- `evidence/focused-rereview-exercise-NOT-FINAL/r4-exercise-manifest.json`
  - R4 packages verbatim (R4 MANIFEST sha256 `5123b06c…`, core `30e044e1…`)
  - plus checker `1c21ba24…` (0.13.0, a self-test archive, not the release checker) and policy `cb1202db…`
- `…/r4-code-combined-all-subset/` and `.log`: PARTIAL_RECIPES_SUBSET, exit 2
- `…/f1-control/`: synthetic control manifest and archive; receipts from the current and patched harness
- `…/fix-scratch/`: the patched copy (`01e71e02…`) and `proposed-fix.diff`
- `…/verify-consumer/`: `landing.log` (pass) and `mismatch.log` (intended assertion failure)

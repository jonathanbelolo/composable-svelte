# Test fixture and CI follow-up: handoff

Author: Claude Opus 5.5, continuing the focused harness review (`FOCUSED-HARNESS-REREVIEW.md`),
2026-09-26.

- **Edited:** only `repo/scripts/verify-release-archives.test.mjs` and `repo/.github/workflows/ci.yml`.
- **Not edited:** the harness (`verify-release-archives.mjs`), `verify-consumer.mjs`, the checker,
  policies, main, and the release checkout (`/private/tmp/composable-release-git`).
- No commit, push or publish.
- All runs here are infrastructure self-tests, **not release qualification**.

## Hashes

| File | Before | After |
|---|---|---|
| `scripts/verify-release-archives.test.mjs` | `cbcff88e1ee25a1b65e09b32c4beb3fcdf719f261a7ea67f85067a65186f8476` | `dd076e16c0b1548b82823afe81003c0a9fe2288c806caafe3478d1e9a1041c21` |
| `.github/workflows/ci.yml` | `c0688befeea39512cb7293b39a13e9ff6e81b3f68673e2d204bc43d1d47881d0` (= `pre-ci-followup`) | `21d25ad7350d3d4054f08f182d008e740b07234e95b47847e303ca462da9e0e4` |
| `scripts/verify-release-archives.mjs` | `01e71e02ca3205096e35902d9eebbba788ee4c169c9a7cf8f64e7ab4359552c9` | unchanged |
| `scripts/verify-consumer.mjs` | `055f117abed189b774242c8e5b68aa1e33155e1155d5f36fa541fe5826fa131a` | unchanged |

- **Before-snapshot of the test file:** `pre-fixture-followup/scripts/verify-release-archives.test.mjs`.
- **Release checkout state:** at `dd2caad9`, its test file (`cbcff88e`), `ci.yml` (`c0688bef`) and
  harness (`01e71e02`) equal the "before" column, so both diffs apply there cleanly.
- **Patch files:** `evidence/fixture-ci-followup-NOT-FINAL/test-fixture.diff` (`605abe59…`) and
  `…/ci.diff` (`c44d247f…`).

## Exact delta

### `scripts/verify-release-archives.test.mjs`

This changes only the checker fixture in the test "runNegativeControls: verifies checker controls when
checker and policy available", plus the import it no longer uses.

```diff
@@ -7,8 +7,7 @@
   mkdtempSync,
   readFileSync,
   rmSync,
-  writeFileSync,
-  cpSync
+  writeFileSync
 } from 'node:fs';
@@ -533,13 +532,13 @@
-  // Package the existing architecture package for test
+  // Pack the checker as it ships: npm pack applies its `files` list and leaves out the installed
+  // dependency tree, whose workspace symlinks the archive guard rightly rejects.
   const archDir = join(REPO_ROOT, 'packages/architecture');
-  const archStage = join(scratch, 'arch-stage');
-  mkdirSync(join(archStage, 'package'), {recursive: true});
-  cpSync(archDir, join(archStage, 'package'), {recursive: true});
-  const archTarballPath = join(scratch, 'composable-svelte-architecture-0.13.0.tgz');
-  spawnSync('tar', ['-czf', archTarballPath, '-C', archStage, 'package']);
+  const archVersion = JSON.parse(readFileSync(join(archDir, 'package.json'), 'utf8')).version;
+  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch, '--loglevel', 'error'], {cwd: archDir, encoding: 'utf8'});
+  assert.equal(packed.status, 0, packed.stderr);
+  const archTarballPath = join(scratch, JSON.parse(packed.stdout)[0].filename);
@@ -585,7 +584,7 @@
     checkerArchive: {
       name: '@composable-svelte/architecture',
-      version: '0.13.0',
+      version: archVersion,
       path: archTarballPath,
```

**What stays the same:**
- The synthetic core stays 0.13.0.
- The external policy is unchanged: `supportedCore.min` 0.13.0, the core opaque pin 0.13.0,
  `expectedCoreVersion` 0.13.0, the same rules and inactive entries.
- All assertions are unchanged: synthetic qualification passes, `manualReviewRequired`, 6 controls,
  each `passed`.
- The symlink/entry-type test (`inspectTarEntries: rejects symlink entries and entries outside
  package/`) and the harness guard are untouched.

**The fixture now matches the packed checker's identity.** Name, version and bytes come from
`npm pack` of `packages/architecture`, and the manifest declares the version the packed archive
actually contains. The runtime check that the packed checker's `CHECKER_VERSION` matches its
`package.json` still applies (control D below).

### `.github/workflows/ci.yml`

This adds one step, after Install, Build, Type check and Run tests.

```diff
@@ -69,6 +69,11 @@
       - name: Run tests
         run: TZ=UTC pnpm -r --workspace-concurrency=1 test
 
+      # Root scripts are not a workspace, so `pnpm -r test` never finds this suite.
+      # Synthetic fixtures only; the release archive matrix runs outside CI.
+      - name: Release archive harness self-tests
+        run: TZ=UTC node --test scripts/verify-release-archives.test.mjs
+
```

The workflow still parses as YAML, and the step order is correct. CI does not run the runtime or
recipe matrix, and no framework was added.

## Validation

All runs used harness `01e71e02`. The scratch roots are under
`evidence/fixture-ci-followup-NOT-FINAL/`, with one log per scenario.

**Installed-tree simulation.** Each scratch root copies `repo/packages/architecture` and adds the
pnpm-shaped installed tree found in the release checkout:
- `packages/architecture/node_modules/svelte` → `../../../node_modules/.pnpm/svelte@5.57.0/node_modules/svelte`
- `packages/architecture/node_modules/typescript` → `../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript`
- `.bin/`

For the 0.13.1 cases, `package.json` `version` and `src/check.mjs` `CHECKER_VERSION` are both set to
0.13.1, as a real 0.13.1 release would set them.

| Scenario | Test file | Checker | Result |
|---|---|---|---|
| A. `old-installed-0.13.0` | before (`cbcff88e`) | 0.13.0 + installed tree | **35/36**: `Non-regular entry type 'l' (entry: package/node_modules/svelte)`, the parent's failure reproduced |
| B. `old-installed-0.13.1` | before | 0.13.1 + installed tree | 35/36, same symlink rejection |
| C. `old-clean-0.13.1` | before | 0.13.1, no node_modules | 35/36: `ArchiveVersionMismatchError … expected 0.13.0, got 0.13.1` (the hardcoded identity) |
| **D. `new-installed-0.13.0`** | after (`dd076e16`) | 0.13.0 + installed tree | **36/36** |
| **E. `new-installed-0.13.1`** | after | 0.13.1 + installed tree | **36/36**, with exact 0.13.1 pairing |
| F. `new-installed-0.13.1-inconsistent` | after | `package.json` 0.13.1, `CHECKER_VERSION` 0.13.0 | 35/36: `isQualificationPass validation` fails. A checker whose metadata disagrees is still refused. |
| **G. `release-checkout-readonly`** | after | the real `/private/tmp/composable-release-git/packages` (symlinked read-only, real pnpm tree) | **36/36** |
| **H. `repo/` in place** | after | repo checker 0.13.0 | **36/36** |

**Details and caveats:**
- **Fixture contents:** the packed fixture at 0.13.1 is `composable-svelte-architecture-0.13.1.tgz`,
  32 entries, all regular files, and no `node_modules`.
- **Nothing written to the release checkout:** `npm pack` writes only to the test's scratch directory.
  Its `packages/architecture` and `scripts` status showed only the parent's own pre-existing changes,
  and no tarball.
- **Symlink guard still covered:** the dedicated symlink and outside-`package/` test passes in every
  "after" run.
- **CI dependencies:** the test now needs `npm` on PATH, which `actions/setup-node` provides. It
  already needed registry access for the synthetic smoke install.

## Focused independent review disposition

These are my own checks of this delta, not a new broad review cycle.

**CLEAR TO APPLY: both diffs, exactly as above.**
- The change is limited to the fixture's packing method and its declared checker version, plus one CI
  step.
- No test was weakened, skipped or loosened. The harness symlink/type guard and its test are unchanged
  and still pass.
- The failure the parent saw reproduces with the old fixture (A) and is gone with the new one (D, G).
- The pairing follows the real checker version (E), and inconsistent checker metadata still fails (F).

**Limitation.** If checker 0.13.1 raises `CHECKER_KNOWN_CORE.min` above 0.13.0, this fixture's
synthetic core 0.13.0 and its policy would stop qualifying. That change would be a deliberate
checker-semantics change, so it would need its own fixture update. Today, `CHECKER_KNOWN_CORE.min` is
`0.13.0-next.1`, and the E simulation does not change it.

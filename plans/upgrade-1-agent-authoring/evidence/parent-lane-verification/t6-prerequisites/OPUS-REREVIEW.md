# Independent Focused Re-Review: architecture-checker pre-profile prerequisites (correction round)

Reviewer: Claude Opus 5.5, 2026-09-26
Scope: `candidate/packages/architecture` compared with `baseline/packages/architecture`, re-checking the original blocker B1 and recommendations R1, R2 and R3 from `OPUS-REVIEW.md` after the correction described in the updated `IMPLEMENTATION.md`.
Method: I read the code and tests directly. I ran every check myself in this session: tests, packing, archive inspection, CLI runs, and mutation runs on throwaway copies. I made no edits to `candidate/` or `baseline/`. All scratch work is in `rereview-work/`, and the mutation copies have been deleted.

## Verdict: CLEAR TO LAND

B1 is fixed. I verified the fix at the CLI and confirmed by mutation that the suite catches a regression. R1, R2 and R3 are each covered by tests that fail when the behaviour they guard is removed. Starter bytes are unchanged, `starter` is still the only production registry member, and the correction introduced no regression.

There is one non-blocking test gap (F1). The "valid archive through a symlink prints success" control in the suite never runs, so `IMPLEMENTATION.md` overstates what is covered. I ran that positive path by hand (below) and it works. It should be cleaned up, but it does not block landing: the fail-closed direction, which is what B1 was about, is covered and mutation-proven.

---

## B1: symlinked CLI entry now fails closed. Fixed.

`test/inspect-archive.mjs:88-95`:
```js
function isMain() {
  try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
```
Both sides are now realpath'd, so an invocation through a symlink is recognised as main. The CLI path then runs the argument assertion and `inspectArchive` without conditions. The archive is `rereview-work/composable-svelte-architecture-0.13.0.tgz`, which I packed myself.

| Invocation | Result |
| --- | --- |
| `node /tmp/…/candidate/packages/architecture/test/inspect-archive.mjs <tgz>` (`/tmp` → `/private/tmp`, the exact B1 case) | exit 0, `"status": "archive-matches-source"` |
| same path, no argument | exit 1, `AssertionError: Provide the npm-generated architecture archive path.` |
| same path, `/nonexistent.tgz` | exit 1, `Archive not found` |
| same path, junk bytes as `.tgz` | exit 1 |
| file symlink `rereview-work/ia-link.mjs → test/inspect-archive.mjs`, valid archive / no argument | exit 0 `archive-matches-source` / exit 1 |
| directory symlink `rereview-work/pkg-link → candidate/packages/architecture`, valid archive | exit 0 `archive-matches-source` |
| `npm run -s check:archive -- <tgz>` (relative, as before) | exit 0 `archive-matches-source` |
| `node --preserve-symlinks-main pkg-link/test/inspect-archive.mjs <tgz>` | exit 1 (containment assertion; fails **closed**, see L2) |

**Regression test.** "inspect-archive CLI regression controls with symlinked invocation path" is in `src/bundled-policy.test.mjs`. It spawns the script through a symlink in `os.tmpdir()`, and through the `/tmp` alias when that exists. It asserts a non-zero exit plus a message for three cases: no argument, a missing archive, and a corrupt archive.

**Mutation M1.** I reverted `isMain` to the original `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`. The test then fails (`pass 10 / fail 1`). The suite now catches the B1 regression.

`catch { return false; }` is still a theoretical no-op path, but it only triggers if `realpathSync(process.argv[1])` throws. When Node has just loaded the file from that path, that does not happen in practice. Acceptable.

## R1: multi-policy archive coverage. Addressed.

The `inspectArchive` fixture test ("archive inspection: containment, embedded pins, …") now covers:
- `starter` + `test-alpha` both registered under `<root>/policies/` and both archived: passes.
- `test-alpha` missing from the archive: throws, matched on `package/policies/alpha.json`.
- A wrong pin on the second policy: throws `Archived registered policy test-alpha hash mismatch with embedded pin`.
- An extra unregistered `policies/extra.json` on disk: throws `Shipped policies directory must match production registered policies exactly`. That assertion was previously untested.
- Case 3 (missing registered policy in the archive) now has a message matcher, `/package\/policies\/starter\.json/`, instead of a bare `assert.throws`.

**Mutation M2.** I changed `inspectArchive` back to a hardcoded `'policies/starter.json'` expectation and a starter-only pin loop. The test then fails (`pass 10 / fail 1`).

## R2: production containment guard failure path. Addressed.

`bundledEntry` (`src/bundled-policy.mjs:20-26`) is now exported and exercised directly:
- It throws for `'../src/policy.mjs'`, `'../policies'` (the directory itself), `'../../outside.json'` and `'/tmp/foo.json'`, each with a message matcher.
- It succeeds for `'../policies/starter.json'`.
- The dead `mockProductionRegistry` fixture is gone.

**Mutation M3.** I disabled the containment `throw` in `bundledEntry`, and the test fails.

`isPolicyPathContained` now uses the exact separator boundary (`rel !== '..' && !rel.startsWith('..' + sep)`), which resolves the earlier nit.

**Mutation M4.** I removed the lookup-time re-check `registry === BUNDLED_POLICY_REGISTRY && !isPolicyPathContained(...)` in `getBundledPolicyEntry`. No test fails. This is expected and acceptable: the production registry is frozen and every entry is built by the guarded `bundledEntry`, so the re-check is defence in depth and cannot be reached without replacing the module.

**Export surface.** Exporting `bundledEntry` and `isPolicyPathContained` does not widen the public API:
- `package.json` still has `"exports": {}`.
- Calling `bundledEntry` returns a frozen object but never inserts it into `BUNDLED_POLICY_REGISTRY`.
- `inspectArchive` is exported from `test/`, which is not in `files` and is absent from the packed tarball.

No production grant is created.

## R3: real qualification run asserts `bundledProfile: null`. Addressed.

`src/qualification.test.mjs:127-128` asserts, on the real child-process passing qualification envelope:
- `result.policy.source === 'external'`
- `result.policy.bundledProfile === null`

Line 145 asserts the same null on the analysis-only contrast run.

**Mutation M6b.** I made external runs report `bundledProfile: 'external'` and also removed the `isQualificationPass` guard, so that only the new assertion could catch it. The test fails exactly at `qualification.test.mjs:128` (`'external' !== null`).

**Mutation M5.** I removed only the `isQualificationPass` guard. The mutation matrices in `check.test.mjs` and `qualification.test.mjs` fail.

**End-to-end CLI run.** The fixture project is in `rereview-work/fx`.
- `--policy bundled:starter` (analysis-only) exits 0 with `"source":"bundled","bundledProfile":"starter"`.
- The external `policies/starter.json` with `--policy-sha256` exits 0 with `"source":"external","bundledProfile":null`.
- Qualification is unchanged: bundled + `--mode qualification` exits 22 ("qualification requires an externally controlled policy and pin"), and bundled + `--policy-sha256` exits 22.

---

## Starter bytes, sole membership, delta

- **Starter bytes.** `cmp baseline/…/policies/starter.json candidate/…/policies/starter.json` shows the files are identical. `shasum -a 256` gives `389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3`, matching `baseline-sha256.json` and `BUNDLED_STARTER_SHA256`. `policies/` contains only `starter.json`.
- **Sole membership at runtime.** Importing `src/bundled-policy.mjs` shows:
  - `Reflect.ownKeys(BUNDLED_POLICY_REGISTRY)` is `["starter"]`, the registry is frozen, and its prototype is `null`.
  - The entry path is `…/candidate/packages/architecture/policies/starter.json` and its pin is the value above.
- **Companion selectors.** `bundled:code`, `bundled:media`, `bundled:chat`, `bundled:chat-code-media` and `bundled:__proto__` each exit 22 with `unknown bundled policy`.
- **Delta.**
  - `diff -rq` (excluding `node_modules`) lists exactly 7 changed files, all listed in `IMPLEMENTATION.md`: `README.md`, `src/bundled-policy.mjs`, `src/bundled-policy.test.mjs`, `src/check.mjs`, `src/check.test.mjs`, `src/qualification.test.mjs` and `test/inspect-archive.mjs`.
  - The file sets are identical: no files were added or deleted.
  - All 88 entries in `baseline-sha256.json` match the baseline tree. In the candidate tree, exactly those 7 differ. `package.json`, `LICENSE`, `CHANGELOG.md`, `bin/` and `test/run.mjs` are unchanged.
- **No regression from the correction.**
  - `check.mjs` and `README.md` were not touched in the correction round (mtime 11:17, before the 11:29 review).
  - In the runtime code, the correction only exported `bundledEntry`, added its unused `baseUrl` parameter (see N1), and tightened the `..` boundary check.
  - The full suite passes and the CLI checks above behave as expected.

## Suite and packing (run by me)

- **Full suite.** `npm test` in `candidate/packages/architecture` (Node v24.10.0) exits 0: `tests 529 / pass 529 / fail 0 / cancelled 0 / skipped 0 / todo 0`, `duration_ms 18938`. The log is `rereview-work/full-suite.log`. That is 528 original + 1 new CLI test.
- **Packing.**
  - `npm pack --ignore-scripts --pack-destination rereview-work` produces 32 files: the 5 metadata/bin files, `policies/starter.json` and 26 non-test `src/*.mjs`. No `test/` files and no `*.test.mjs`.
  - Tarball SHA-256: `a365156505cc0bd53a5025cf681b182593493341818420cc2fc3b994e3437ac6`. This is identical to the implementer's `candidate/scratch` tarball, so the pack is reproducible.
  - `inspect-archive` via the `/tmp` symlink path reports `archive-matches-source`, and `policies/starter.json` is archived with sha256 `389430…d8b3` at 1607 bytes.

---

## Non-blocking follow-ups

### F1: the positive "valid archive via symlink" CLI control never runs; `IMPLEMENTATION.md` overclaims

In `src/bundled-policy.test.mjs`, the CLI test computes:
```js
const candidateArchive = resolve(packageRoot, '../scratch/composable-svelte-architecture-0.13.0.tgz');
if (existsSync(candidateArchive)) { /* valid-archive assertions */ }
```
- `packageRoot` is `candidate/packages/architecture`, so this resolves to `candidate/packages/scratch/…`. That path does not exist; the implementer packed to `candidate/scratch/`.
- The branch is therefore silently skipped in this tree. It would also be skipped in any real checkout and in CI.

**Mutation M7.** I made the CLI never inspect the archive and print `{}` on success. The suite still passes (`pass 11 / fail 0`).

**Positive control check.** I placed the tarball at the path the test expects, in a copy. The positive control then runs and passes, and the M7 mutation is caught. So the control's logic is right; only its path and skip-on-missing behaviour are wrong.

`IMPLEMENTATION.md` says the CLI tests cover "valid archive prints `archive-matches-source` and exits 0". The suite does not actually do that.

Suggested fix (small), either of:
- Have the test produce its own archive, e.g. `npm pack --ignore-scripts --pack-destination <tmp>` from `packageRoot`, and then assert unconditionally.
- At minimum, fail rather than skip when the archive is missing, and correct the claim in `IMPLEMENTATION.md`.

This does not block landing: the baseline had no CLI test at all, the B1 regression is caught by the negative controls (M1), and I ran the positive path by hand in four symlink variants (table above).

### Other notes (optional)

- **L1.** The lookup-time production re-check has no test (M4). It cannot be reached through supported code paths; accept it as defence in depth.
- **L2.** With `--preserve-symlinks-main` through a symlinked package directory, the gate derives `root` from the symlink path while the imported registry is realpath'd, so it fails with a containment assertion. This is a fail-closed false negative, not a false pass. Acceptable.
- **N1.** `bundledEntry(name, relativePath, sha256, baseUrl = import.meta.url)`: nothing uses `baseUrl`. It is harmless, since containment is always checked against the fixed `POLICIES_DIRECTORY`, and could be dropped.
- **N2.** The CLI test uses `symlinkSync`, which needs elevated privileges or Developer Mode on Windows. This only matters if Windows CI is planned.

## Exact verification commands (reproducible)

```
cd candidate/packages/architecture && npm test                                   # 529/529, exit 0
npm pack --ignore-scripts --pack-destination ../../../rereview-work              # sha256 a3651565…7ac6
node /tmp/companion-checker-profile-preparation/candidate/packages/architecture/test/inspect-archive.mjs \
     /private/tmp/companion-checker-profile-preparation/rereview-work/composable-svelte-architecture-0.13.0.tgz   # exit 0 archive-matches-source
node /tmp/companion-checker-profile-preparation/candidate/packages/architecture/test/inspect-archive.mjs          # exit 1
cmp ../../../baseline/packages/architecture/policies/starter.json policies/starter.json                           # identical
node --input-type=module -e "import {BUNDLED_POLICY_REGISTRY as R} from './src/bundled-policy.mjs'; console.log(Reflect.ownKeys(R))"   # ['starter']
```
Mutation runs M1–M7 were performed on `cp -R` copies under `rereview-work/`, which have since been deleted. Each ran `node --test src/bundled-policy.test.mjs` (or `src/check.test.mjs src/qualification.test.mjs`), with the results listed above.

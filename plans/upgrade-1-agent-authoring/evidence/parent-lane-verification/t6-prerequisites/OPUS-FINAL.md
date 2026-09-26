# Final Focused Check: F1 closure

Reviewer: Claude Opus 5.5, 2026-09-26. Scope is F1 from `OPUS-REREVIEW.md` only. I did not re-run the full review or the full suite. I made no edits to `candidate/` or `baseline/`; all experiments ran on throwaway copies under `rereview-work/final/`, which are now deleted, except the pnpm@9.0.0 install in `rereview-work/final/p9`.

## Verdict: NOT CLEAR TO LAND. One new blocker (F1-R), a one-line fix

F1 is closed under npm and under a direct `node --test`: the positive CLI control now runs every time, and it catches a CLI that exits 0 without inspecting anything. The runtime has not drifted.

The fix introduced a regression, though. The test now fails under pnpm, which is this repository's package manager and CI runner.

## F1: closed under npm and direct `node --test`

- **Test-only change.** Since my re-review, the only file whose content changed is `src/bundled-policy.test.mjs`.
  - `test/inspect-archive.mjs` has a new mtime (11:43:56) because it was mutated and then reverted. Its `diff -u` against the baseline is byte-for-byte the 125-line diff I reviewed, which I recovered from my own transcript. Its sha256 is `65cd21bb3be2f3582aff6d487796868dd39d301d8a0d2e3c62f64619b7edcb2f`.
  - `check.test.mjs` and `qualification.test.mjs` have mtimes before the re-review.
  - `diff -rq` against the baseline still shows the same 7 files.
- **No runtime drift.** I extracted the tarball I packed earlier (`rereview-work/composable-svelte-architecture-0.13.0.tgz`, sha256 `a3651565…7ac6`). `cmp` shows all 32 shipped files are identical to the current candidate. That covers `src/*.mjs`, `bin/`, `package.json` and `policies/starter.json`.
- **The test itself.** It packs its own archive into a fixture temp directory, then for each symlinked script path asserts, with no conditions:
  - exit 0
  - `"status": "archive-matches-source"`
  - the parsed JSON has that status
  - the `policies/starter.json` entry's sha256 equals `BUNDLED_STARTER_SHA256`

  The no-argument, missing-archive and corrupt-archive negative controls are kept.
- **Affected test, run on the candidate:**
  - `node --test src/bundled-policy.test.mjs` gives 11/11 pass.
  - Run again with `npm_execpath` set to npm's `npm-cli.js`, it also gives 11/11.
- **No-op-success control (M7).** On a copy, I made the CLI check that the archive exists and is a readable tar, then print `{}` and exit 0. The CLI test fails (`pass 10 / fail 1`). The positive control is now effective.

## F1-R (blocker): the new test fails under pnpm, the repo's CI runner

`src/bundled-policy.test.mjs` packs with:
```js
const packBin = process.env.npm_execpath ? process.execPath : 'npm';
const packArgs = process.env.npm_execpath ? [process.env.npm_execpath, 'pack', '--ignore-scripts', '--quiet', …] : ['pack', …];
```
The monorepo uses `"packageManager": "pnpm@9.0.0"`. CI (`.github/workflows/ci.yml:70`) runs `TZ=UTC pnpm -r --workspace-concurrency=1 test`.

That makes pnpm set `npm_execpath` to `pnpm.cjs`. `test/run.mjs:26` spawns `node --test` with the inherited environment, so the test ends up running `node pnpm.cjs pack --ignore-scripts …`. pnpm rejects that flag:

- **pnpm 9.0.0**, the pinned version, installed locally into `rereview-work/final/p9`:
  - `pnpm pack --ignore-scripts …` fails with `ERROR Unknown option: 'ignore-scripts'`.
  - The affected test run through `pnpm run` gives `pass 10 / fail 1` with that error.
- **pnpm 10.5.2**, the one on PATH, fails the same way.

Dropping the flag is not enough. pnpm rewrites `package.json` in the tarball (it moves or strips `scripts`), so `inspect-archive` reports `Archive differs from reviewed file: package.json` for any archive built by pnpm. The gate is documented as taking an npm-generated archive, so the test must pack with npm.

**Fix.** Always spawn npm. On a copy, I replaced the two lines above with:
```js
const packBin = 'npm';
const packArgs = ['pack', '--ignore-scripts', '--quiet', '--pack-destination', dir];
```
With that change, the affected test passes 11/11 under both `pnpm@9.0.0 run` and `npm run`.

**Verify the fix with:** run the affected test through pnpm 9, e.g. a `pnpm run` script executing `node --test src/bundled-policy.test.mjs`. It must pass 11/11, and the M7 no-op control must still fail it.

## Remaining limitations (non-blocking, unchanged from OPUS-REREVIEW.md unless noted)

- **New:** the CLI test now needs `npm` on PATH and runs a real `npm pack` of the package, adding about 1 s. On Windows, spawning `npm` needs `npm.cmd` or `shell: true`, and `symlinkSync` needs privileges. Only relevant if Windows CI is planned.
- **L1:** the lookup-time production containment re-check in `getBundledPolicyEntry` is untested. It cannot be reached through supported paths.
- **L2:** with `--preserve-symlinks-main` through a symlinked package directory, the archive gate fails closed. That is a false negative, not a false pass.
- **N1:** the `bundledEntry` `baseUrl` parameter is unused.
- Everything else from `OPUS-REREVIEW.md` still holds, backed by the runtime-identical archive above:
  - B1 is fixed and covered by mutation-proven tests; R1, R2 and R3 are covered too.
  - Starter bytes are unchanged (sha256 `389430…d8b3`), and `starter` is the only production registry member.

Once F1-R is fixed as above and verified under pnpm 9, and nothing else changes, this is CLEAR TO LAND without further review.

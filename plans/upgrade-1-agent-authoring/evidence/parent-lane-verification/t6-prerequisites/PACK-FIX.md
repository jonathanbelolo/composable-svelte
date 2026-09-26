# PACK-FIX: F1-R Two-Line Correction

## Overview
Applied reviewer Opus's exact two-line fix from `OPUS-FINAL.md` for blocker **F1-R** in `candidate/packages/architecture/src/bundled-policy.test.mjs`.

When tests run under pnpm (the repository's package manager and CI runner), `process.env.npm_execpath` points to `pnpm.cjs`. Because pnpm does not support `--ignore-scripts` and rewrites `package.json` in archives, the archive fixture packaging must always invoke `npm` directly.

---

## Two-Line Delta

In [`candidate/packages/architecture/src/bundled-policy.test.mjs`](file:///private/tmp/companion-checker-profile-preparation/candidate/packages/architecture/src/bundled-policy.test.mjs#L559-L560):

```diff
-  const packBin = process.env.npm_execpath ? process.execPath : 'npm';
-  const packArgs = process.env.npm_execpath
-    ? [process.env.npm_execpath, 'pack', '--ignore-scripts', '--quiet', '--pack-destination', dir]
-    : ['pack', '--ignore-scripts', '--quiet', '--pack-destination', dir];
+  const packBin = 'npm';
+  const packArgs = ['pack', '--ignore-scripts', '--quiet', '--pack-destination', dir];
```

No other changes were made to `src/bundled-policy.test.mjs` or any other file.

---

## Verification Results

1. **Pinned pnpm9 Runner Verification**:
   - Executed via reviewer's pinned pnpm@9.0.0 runner at `rereview-work/final/p9/node_modules/pnpm/bin/pnpm.cjs`:
     - Tested in a throwaway copy with a script entry, preserving original package manifest:
       ```
       ✔ loadBundledStarterPolicy loads genuine pinned policy (3.08ms)
       ✔ validateBundledPolicyBytes validates shipped bytes against schema, catalog, core and rules (0.42ms)
       ✔ altered bytes fail hash with policy null before parse (0.09ms)
       ✔ production registry contains only the byte-exact pinned starter (0.54ms)
       ✔ loader selects two test-only names with distinct pinned bytes (1.53ms)
       ✔ each name is bound to its own pin; swapped or tampered bytes fail before parse (1.60ms)
       ✔ selector resolves own, frozen, well-formed entries only (0.83ms)
       ✔ frozen custom registry entries with accessors are rejected without invocation (1.18ms)
       ✔ production registered policy containment and path checks (0.34ms)
       ✔ archive inspection: containment, embedded pins, missing policies, and byte equality (219.44ms)
       ✔ inspect-archive CLI regression controls with symlinked invocation path (2556.90ms)
       ℹ tests 11 / pass 11 / fail 0 / duration 3016.71ms
       ```
     - Direct candidate run with `npm_execpath` set to `pnpm.cjs`: **11 passed, 0 failed** (`tests 11 / pass 11 / fail 0`).

2. **M7 No-Op Control Failure**:
   - With M7 mutation applied in throwaway copy (bypassing `inspectArchive` and outputting `{}`):
     ```
     ✖ inspect-archive CLI regression controls with symlinked invocation path
       AssertionError [ERR_ASSERTION]: Script ... with nonexistent archive must fail
     ℹ tests 11 / pass 10 / fail 1
     ```
   - Confirmed M7 continues to be caught and rejected under pnpm9.

3. **Integrity & Scope Checks**:
   - `candidate/packages/architecture/package.json` preserved with zero modifications (identical to baseline).
   - `policies/starter.json` preserved byte-for-byte (`389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3`).
   - Runtime implementation, main repo, and baseline completely untouched.

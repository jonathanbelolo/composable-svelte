# F1 Completion Report: Self-Contained Symlinked CLI Archive Test

## Overview
Addressed finding **F1** from `OPUS-REREVIEW.md` before final integration. The symlinked CLI regression control in `src/bundled-policy.test.mjs` was made completely self-contained, removing the reliance on an external/prebuilt scratch archive and asserting the positive path unconditionally.

Implementation, runtime, and policy files remain strictly unchanged.

---

## Changes

1. **`candidate/packages/architecture/src/bundled-policy.test.mjs`**:
   - In `inspect-archive CLI regression controls with symlinked invocation path`, replaced the conditional check for `candidateArchive` (`../scratch/...`) with an inline, fixture-local archive generation using `npm pack --ignore-scripts --quiet --pack-destination <tmpDir>`.
   - Verified that the archive exists before launching child processes.
   - For every symlinked script path (`os.tmpdir()` symlink and `/tmp` alias), unconditionally asserted:
     - Exit status 0.
     - `stdout` contains `"status": "archive-matches-source"`.
     - JSON-parsed output contains `status: "archive-matches-source"`.
     - Output contains the `policies/starter.json` entry in `files` matching `BUNDLED_STARTER_SHA256`.

2. **`IMPLEMENTATION.md`**:
   - Updated Section 3, the Verification Results summary, and the changed files table to accurately describe the self-contained fixture archive generation and unconditional assertion, resolving the overclaim noted in F1.

---

## Verification & Mutation Results

1. **Affected Test Suite**:
   ```bash
   node --test src/bundled-policy.test.mjs
   ```
   - **Result**: `tests 11 / pass 11 / fail 0 / duration ~2.9s`.
   - Unconditionally executes all 4 CLI controls (no arguments, nonexistent archive, corrupt archive, valid archive) across both symlink paths (`tmpdir` symlink and `/tmp` symlink).

2. **No-Op-Success CLI Mutation Proof (M7)**:
   - Applied Opus mutation M7 to `test/inspect-archive.mjs`: bypassed `inspectArchive(...)` and returned/printed `{}` on valid archives while preserving argument and archive presence checks.
   - Ran `node --test src/bundled-policy.test.mjs`:
     ```
     ✖ inspect-archive CLI regression controls with symlinked invocation path
       AssertionError [ERR_ASSERTION]: The input did not match the regular expression /"status": "archive-matches-source"/. Input:
       '{}\n'
     ℹ tests 11 / pass 10 / fail 1
     ```
   - Proved: The suite strictly catches and rejects a no-op success CLI mutation.
   - Reverted `test/inspect-archive.mjs` back to its original cleared bytes.

---

## Changed Files Summary

| File | Status | Notes |
| --- | --- | --- |
| `packages/architecture/src/bundled-policy.test.mjs` | Modified | Self-contained fixture packaging and unconditional positive symlink CLI assertions. |
| `IMPLEMENTATION.md` | Modified | Corrected verification claims regarding F1. |
| `packages/architecture/test/inspect-archive.mjs` | Unchanged | Retained cleared bytes from Opus review. |
| `packages/architecture/src/bundled-policy.mjs` | Unchanged | Retained cleared bytes from Opus review. |
| `packages/architecture/policies/starter.json` | Unchanged | Exact byte-for-byte SHA matching baseline. |

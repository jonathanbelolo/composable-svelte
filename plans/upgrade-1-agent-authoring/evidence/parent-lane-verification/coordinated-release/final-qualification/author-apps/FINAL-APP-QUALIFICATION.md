# Final app checker gate: App-A and App-B (`FINAL-APP-CHECKER-GATES.txt`)

Date 2026-09-26. Executed by the Opus final checker/profile reviewer, reusing that review's context, as authorized.

- **Checker review:** `/private/tmp/composable-final-checker/OPUS-FINAL-PROFILE-REVIEW.md`.
- **Receipts and logs:** `final-app-qualification/` (manifest `SHA256SUMS` = `bb2ea8f2…`). The primary receipt is
  `final-app-qualification/FINAL-APP-GATE-RECEIPT-6095ae2f.json` = `a12dcdb9dd30db4a49f821020677a9b81310bc538f6e1f03634c71eea3e51b39`.
- **Superseded history, kept:** the gates on checker `cd12784e…` and `f3c91ee6…`, with their documents, are in
  `final-app-qualification/cd12784e-SUPERSEDED/` and `f3c91ee6-SUPERSEDED/`.
- **Not done:** no publication, main or git edits; no runtime-archive mutation; no application source edits.

**Scope of this record: a narrow phase gate.** It covers the architecture-checker qualification of the two apps plus
App-A's affected functional proof. It is **not** a full release qualification. The parent owns final assembly: the runtime
matrix, the physical microphone check, publication, and aggregation of these gates.

## Verdicts (on installed checker `6095ae2f…`)

| App | Verdict | Policy (externally controlled) |
|---|---|---|
| **App-A** (chat, code and media conversation workspace) | **PASSED**: qualification exit 0, installed `isQualificationPass` = true | exact registered `chat-code-media` bytes `f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327` |
| **App-B** (Auth + Charts account dashboard) | **PASSED, external policy only**: exit 0, `isQualificationPass` = true | `external-app-b-auth-charts` `bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de` (never bundled; no bundled Auth+Charts profile exists) |

- **Envelope:** the expected core is 0.13.1 and the checker 0.13.1, with 5 active rules and 0 violations. The 2 inactive
  rules and `manualReviewRequired: true` are retained, and the limitations are reported. **All 34 checker expectations
  held** (App-A 18, App-B 16).
- **This checker now analyzes the template bindings both apps use:**
  - `{#each}` items, `{@const}` values and `{:then}` values are analyzed like their script equivalents (B2);
  - App-A's `{#each}` blocks (`src/Workspace.svelte:90,178,277`) and App-B's `{@const}` store and session bindings
    (`src/App.svelte:47–51`) are therefore **inside** the analyzed scope of these passes;
  - neither app uses template binding defaults or computed binding keys, both of which are refused.
- **Still not modeled:** `{:catch}` values, like script `catch` bindings.

## Inputs

| Input | Identity |
|---|---|
| Checker | `@composable-svelte/architecture` 0.13.1, sha256 `6095ae2fa24d7fe895db616d9cdc82b6380950cd2945ab9dc22f5fb85b3ff304`, SRI `sha512-kHetoCXaLxIDL/I5JPjOn4MyzGmEQbHKDBQo6HLVpI51g9NwU9/eMC6WTzYnrX22MKwJclp/KMHrsNxCAKQfFA==`, taken from the content-addressed copy `/private/tmp/composable-final-checker/opus-final-review/final-archive/by-sha/6095ae2f…/`. |
| Checker install | Installed from the local tarball, 40/40 files byte-verified, no symlink. Parser dependencies: TypeScript 5.9.3 and Svelte 5.57.0. |
| Runtime | Frozen R6: `/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json` (`2813a209…`). All used archives were re-hashed from their bytes and are intact. |
| Transport | Local candidate tarballs (`file:` specs), physically byte-verified. **No registry retrieval is claimed.** |

## App-A

1. **Authorized dependency refresh.**
   - The original manifest and lock are preserved in `final-app-qualification/app-a-original-manifest/`
     (`package.json` `9988d5a4…`, lock `258d875b…`).
   - Dependencies: core → R6 `729ca89f…`; chat → final R5 `fe21f00f…`; code and media are byte-identical (`f85b9452…`,
     `c0bfa652…`); devDependency `@composable-svelte/architecture` → `6095ae2f…`.
   - Current `package.json` is `f374901c…` and the lock `7e81277c…`.
2. **Installed bytes, verified before and after the gates:** core 1258, chat 157, code 69, media 101 and checker 40 files.
   There are 0 mismatches, 0 extra files and no symlinks. Svelte is 5.55.3.
3. **Source preservation.** Compared with the original pre-gate snapshot, only `package.json` and `package-lock.json`
   differ. All 83 application files are unchanged.
4. **Affected functional proof, re-run on these exact bytes:**
   - `check`: svelte-check 0 errors, 0 warnings;
   - `test`: **14/14**;
   - `test:ssr`: pass;
   - `build`: pass;
   - `test:browser`: **1/1**, the Playwright production end-to-end flow.

   All exit 0; logs are `app-a-*-6095ae2f.*.log`.
5. **Checker gates.** They ran on a labeled registry-shaped clone with **only** the `package.json` specs rewritten to
   versions (recorded in the receipt).
   - **Positive:** the exact `chat-code-media` bytes, supplied externally, **pass**.
   - **Developer feedback:** `bundled:chat-code-media` analysis-only exits 0. Bundled qualification is refused with
     exit 22.
   - **Negatives, all rejected:**
     - wrong pin;
     - expected core 0.13.0;
     - envelope expecting checker 0.13.0, or another pin;
     - chat-only approvals;
     - chat, code or media pin 0.5.1;
     - core 0.13.2;
     - Svelte 5.57.0;
     - missing root;
     - starter approvals only;
     - labeled copies with an unapproved import, or with installed core 0.13.2.
   - **Informational:** the in-place original with `file:` specs is refused as not registry-shaped, as designed.

## App-B

1. **Original untouched.**
   - **Snapshot:** all 25 frozen snapshot files (tar `2f289af3…`) verified before and after.
   - **Tree:** identical to the original pre-gate snapshot.
   - **Installed runtime:** core 1258, auth 404 and charts 53 files byte-equal to the archives.
2. **Checker gates.** They ran on a separate checker host (40/40 files, `6095ae2f…`), against an isolated
   registry-shaped clone.
   - **Positive:** the external Auth+Charts policy **passes**.
   - **Negatives, all rejected:**
     - wrong pin;
     - expected core 0.13.0;
     - envelope expecting checker 0.13.0, or another pin;
     - **the exact bundled Auth-only bytes** (Charts unapproved);
     - charts pin 0.3.1;
     - auth pin 0.3.1;
     - core 0.13.2;
     - Svelte 5.57.0;
     - missing root;
     - a labeled copy with an unapproved import.
   - **Bundled selectors:** `bundled:auth` and `bundled:charts` analysis both reject, and bundled qualification is
     refused with exit 22.
3. **Functional proof, reused and not rerun.** Source and installed bytes are unchanged, and the checker is not part of
   the app runtime. The evidence is `review-receipts/sequential-browser-coordinator/result.json` (8 browser passes on R6),
   together with the Auth-only derivative's 12/12 controls on `6095ae2f…` (checker review §4).

## Limitations carried forward

- **Checker limitations:** see the checker review §3.
  - `{:catch}` values, script `catch` bindings and implicit coercion calls are not modeled.
  - A clean result proves only the five detectors over the reachable graph.
- **Manual architectural review** remains required, and the inactive rules are not enforced.
- **Opacity** verifies identity and installation only.
- **Physical microphone behavior** (App-A voice) is not proven here.

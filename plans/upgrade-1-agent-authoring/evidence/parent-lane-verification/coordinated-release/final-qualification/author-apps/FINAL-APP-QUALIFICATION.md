# Final app checker gate: App-A and App-B (`FINAL-APP-CHECKER-GATES.txt`)

Date 2026-09-26. Executed by the Opus final checker/profile reviewer, reusing that review's context, as authorized.

- **Checker review:** `/private/tmp/composable-final-checker/OPUS-FINAL-PROFILE-REVIEW.md`.
- **Receipts and logs:** `final-app-qualification/` (manifest `SHA256SUMS` = `a3514805…`). The primary receipt is
  `final-app-qualification/FINAL-APP-GATE-RECEIPT-cd12784e.json` = `110bb67c4cf6c2a7f36320e0ee2f55265a0c53578fabd217b8fd8dbb202d5565`.
- **Superseded history, kept:** the earlier gate on checker `f3c91ee6…` and its document are in
  `final-app-qualification/f3c91ee6-SUPERSEDED/`.
- **Not done:** no publication, main or git edits; no runtime-archive mutation; no application source edits.

**Scope of this record.** This is the scoped architecture-checker gate for the two apps, plus App-A's affected functional
proof. It is **not** a full release qualification.

**Checker status (important).** The checker used here, `cd12784e…`, is the corrected candidate and has passed its scoped
gates. It is **not accepted final**: the parent must decide the B1/B2 template-binding scope first (checker review §3a).
If that decision changes the checker, these app gates must be repeated on the new bytes.

## Verdicts (on installed checker `cd12784e…`)

| App | Verdict | Policy (externally controlled) |
|---|---|---|
| **App-A** (chat, code and media conversation workspace) | **PASSED**: qualification exit 0, installed `isQualificationPass` = true | exact registered `chat-code-media` bytes `f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327` |
| **App-B** (Auth + Charts account dashboard) | **PASSED, external policy only**: exit 0, `isQualificationPass` = true | `external-app-b-auth-charts` `bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de` (never bundled; no bundled Auth+Charts profile exists) |

**Envelope:** the expected core is 0.13.1 and the checker 0.13.1, with 5 active rules and 0 violations. The 2 inactive
rules and `manualReviewRequired: true` are retained, and the limitations are reported.

**The 34 checker expectations all held** (App-A 18, App-B 16). **Neither app uses a template binding-pattern default**, so
the new `template-binding-default` refusal does not affect them.

## Inputs

| Input | Identity |
|---|---|
| Checker | `@composable-svelte/architecture` 0.13.1, sha256 `cd12784eb9288aa510b2f980eb3d0ef57efce8c3d8d8318ab72cee32ce67e51a`, SRI `sha512-LAm/0jRDaTNRUs+DIaRjp6J1RdUF/BPU/3qN+87tT5DifvxlAeWmtRj2Am91YsvAbkW1qs6IzwSRtcN/aeNpvw==`, taken from the content-addressed copy `…/opus-final-review/final-archive/by-sha/cd12784e…/`. |
| Checker install | Installed from the local tarball, 40/40 files byte-verified, no symlink. Parser dependencies: TypeScript 5.9.3 and Svelte 5.57.0. |
| Runtime | `/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json` (`2813a209…`). All used archives were re-hashed from their bytes. |
| Transport | Local candidate tarballs (`file:` specs), physically byte-verified. **No registry retrieval is claimed.** |

## App-A

1. **Authorized dependency refresh.** The original manifest and lock are preserved in
   `final-app-qualification/app-a-original-manifest/` (`package.json` `9988d5a4…`, lock `258d875b…`).
   - core → R6 `729ca89f…`;
   - chat → final R5 `fe21f00f…`;
   - code and media → their R4/R6-manifest paths, byte-identical to before (`f85b9452…`, `c0bfa652…`);
   - devDependency `@composable-svelte/architecture` → the content-addressed `cd12784e…` checker.

   Current `package.json` is `0186001d…` and the lock `1ce717cf…` (copies in `app-a-refreshed-*`). The intermediate
   `f3c91ee6` refresh manifest is in `app-a-manifest-before-cd12784e/`.
2. **Installed bytes, verified before and after the gates:** core 1258, chat 157, code 69, media 101 and checker 40 files.
   There are 0 mismatches, 0 extra files and no symlinks. Svelte is 5.55.3.
3. **Source preservation.** Compared with the original pre-gate snapshot, only `package.json` and `package-lock.json`
   differ. All 83 application files are unchanged.
4. **Affected functional proof, re-run on these exact bytes:**
   - `check`: svelte-check 0 errors, 0 warnings;
   - `test`: **14/14**;
   - `test:ssr`: deterministic rendering, request isolation, and no server-side service execution;
   - `build`: pass;
   - `test:browser`: **1/1**, the Playwright production end-to-end workspace flow.

   All exit 0; logs are `app-a-*-cd12784e.*.log`.
5. **Checker gates.** They ran on a labeled registry-shaped clone: exact source plus installed `node_modules`, with
   **only** the `package.json` specs rewritten to versions (recorded in the receipt).
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
   - **Snapshot:** all 25 frozen snapshot files (tar `2f289af3…`, including `package.json` and lock) verified before and
     after.
   - **Tree:** identical to the original pre-gate snapshot.
   - **Installed runtime:** core 1258, auth 404 and charts 53 files byte-equal to the archives.
2. **Checker gates.** They ran on a separate checker host (40/40 files), against an isolated registry-shaped clone.
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
   - **Informational:** the read-only in-place run is refused as not registry-shaped.
3. **Functional proof, reused and not rerun.** Source and installed bytes are unchanged, and the checker is not part of
   the app runtime. The evidence is `review-receipts/sequential-browser-coordinator/result.json` (8 browser passes on R6),
   together with the Auth-only derivative's 12/12 controls on `cd12784e…` (checker review §4).

## Limitations carried forward

- **Checker limitations:** see the checker review §3 and §3a.
  - **B2:** `{#each}` item and `{@const}` values are not analyzed, and **both apps use these constructs**:
    - App-A iterates state data in `{#each}` at `src/Workspace.svelte:90,178,277`;
    - App-B binds store state and session values through `{@const}` at `src/App.svelte:47–51`.

    Uses of those bound values downstream in the template are not covered by the checker's clean result. They rely on the
    independent app source reviews. B2 is pending a parent scope decision.
- **Manual architectural review** remains required, and the inactive rules are not enforced.
- **Opacity** verifies identity and installation only.
- **Physical microphone behavior** (App-A voice) is not proven here.

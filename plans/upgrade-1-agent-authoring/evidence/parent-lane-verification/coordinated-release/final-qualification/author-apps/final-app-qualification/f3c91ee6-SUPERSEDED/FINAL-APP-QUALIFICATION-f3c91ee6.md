# Final app checker gate: App-A and App-B (`FINAL-APP-CHECKER-GATES.txt`)

Date 2026-09-26. Executed by the Opus final checker/profile reviewer, reusing that review's context, as authorized.

- **Checker review:** `/private/tmp/composable-final-checker/OPUS-FINAL-PROFILE-REVIEW.md`.
- **Receipts and logs:** `final-app-qualification/` (manifest `SHA256SUMS` = `21995b26…`). The primary receipt is
  `final-app-qualification/FINAL-APP-GATE-RECEIPT.json` = `087035e68379a60dbae5a9b3c51172f4de964edbe4d83807e5af780b4e3690a3`;
  the working copy is `opus-final-review/app-gate/`.
- **Not done:** no publication, main or git edits; no runtime-archive mutation; no application source edits.

**Scope of this record.** This is the scoped architecture-checker gate for the two apps, plus App-A's affected functional
proof. It is **not** a full release qualification. The parent release gate aggregates it with the runtime matrix and the
physical microphone evidence.

## Verdicts

| App | Verdict | Policy (externally controlled) |
|---|---|---|
| **App-A** (chat, code and media conversation workspace) | **PASSED**: qualification exit 0, installed `isQualificationPass` = true | exact registered `chat-code-media` bytes `f1127dc259280482a726bb380f376f1874894b3dd2caa2136a82c71214e63327` |
| **App-B** (Auth + Charts account dashboard) | **PASSED, external policy only**: exit 0, `isQualificationPass` = true | `external-app-b-auth-charts` `bc68bb6b47a8c524fa0897f33e9d77f6b88e17b3fc1d995a62ba703f7364a1de` (never bundled; no bundled Auth+Charts profile exists) |

**Envelope:** the expected core is 0.13.1 and the checker 0.13.1, with 5 active rules and 0 violations. The 2 inactive
rules (`presentation/no-fabricated-view`, `adapters/least-authority`) and `manualReviewRequired: true` are retained. The
15 limitations are reported. Module counts are App-A 9 and App-B 10.

**The 34 checker expectations all held** (App-A 18, App-B 16).

## Inputs

| Input | Identity |
|---|---|
| Checker | `@composable-svelte/architecture` 0.13.1, sha256 `f3c91ee6ae078312cc1f289034d3245266ff74f5ba116c12641001611933808f`, SRI `sha512-B5sO64ldYfHR+yr1SPPcSXOHg5/hQxKdNYpI9gcr+dTLa2QzXd30l+fU1eftsUpPGl1uiacq25A0G1Nh3cqA1g==`. Independently cleared (`OPUS-FINAL-PROFILE-REVIEW.md`); it supersedes `b62cf88f…`. |
| Checker install | Installed from the local tarball, 40/40 files byte-verified, no symlink. Parser dependencies: TypeScript 5.9.3 and Svelte 5.57.0 (nested under the checker in App-A, whose own Svelte is 5.55.3). |
| Runtime | Authoritative `/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json` (`2813a209…`). All used archives were re-hashed from their bytes. |
| Transport | Local candidate tarballs (`file:` specs) with physical byte verification. **No registry retrieval is claimed.** |

## App-A

1. **Authorized dependency refresh, in place.**
   - **Original manifest and lock:** saved to `final-app-qualification/app-a-original-manifest/` (`package.json`
     `9988d5a4…`, lock `258d875b…`).
   - **Refreshed specs:**
     - core: `artifacts-a/…core` (R4 `30e044e1…`) → `archives-r6/…core` (**R6 `729ca89f…`**);
     - chat: `artifacts-a/…chat` (`cfbfe99d…`) → `archives-r5-chat/…chat` (**final R5 `fe21f00f…`**);
     - code and media: repointed to their manifest paths in `archives-r4`, with byte-identical archives (`f85b9452…`,
       `c0bfa652…`);
     - new devDependency `@composable-svelte/architecture` → the cleared checker archive.
   - **Install:** `npm install --ignore-scripts` exit 0. New `package.json` `9022ba79…`, lock `5bd46cf1…`. Copies are in
     `final-app-qualification/app-a-refreshed-*`.
   - **Installed bytes, verified before and after all gates:** core 1258/1258, chat 157/157, code 69/69, media 101/101 and
     checker 40/40. There are 0 mismatches, 0 extra files and no symlinks. Svelte is 5.55.3.
   - **Application source:** all 83 non-manifest files hash-equal before and after, so the source is unchanged.
2. **Affected functional proof on the exact final installed bytes:**
   - `check`: svelte-check 0 errors, 0 warnings;
   - `test`: **14/14**;
   - `test:ssr`: deterministic rendering, request isolation, and no server-side service execution;
   - `build`: pass;
   - `test:browser`: the Playwright production end-to-end workspace flow, **1/1**.

   All exit 0; logs are `final-app-qualification/app-a-*.log`.
3. **Checker gates.**
   - **Where they ran:** on a labeled clone (`app-a-registry-shaped`). It is App-A's exact source and installed
     `node_modules`, with **only** the `package.json` specs rewritten to the exact versions. The checker requires
     registry-shaped specs for `registry` provenance approvals; the rewrite is recorded in the receipt, and the other 84
     files are hash-equal.
   - **Positive:** the exact `chat-code-media` bytes, supplied externally, **pass**.
   - **Developer feedback:** `bundled:chat-code-media` analysis-only exits 0 (`not-evaluated`, 0 errors/violations).
     Bundled qualification is refused with exit 22.
   - **Negatives, all rejected:**
     - wrong `--policy-sha256`;
     - expected core 0.13.0;
     - envelope expecting checker 0.13.0, or another pin;
     - chat-only approvals;
     - chat, code or media pin 0.5.1;
     - core pin 0.13.2;
     - Svelte pin 5.57.0;
     - missing root (incomplete analysis);
     - the exact starter approvals only;
     - labeled copy with an unapproved `vite` import;
     - labeled copy with installed core 0.13.2.
   - **Informational:** the original in-place App-A, with its local-transport `file:` specs, is refused as "not
     registry-shaped", as designed. This is why the labeled registry-shaped clone is used.

## App-B

1. **Original untouched.**
   - **Snapshot:** all 25 frozen snapshot files (`review-receipts/final-source-snapshot/SNAPSHOT-RECEIPT.json`, tar
     `2f289af3…`, including `package.json` and lock) verified before and after.
   - **Tree:** all 235 non-build files are unchanged.
   - **Installed runtime:** core 1258, auth 404 and charts 53 files byte-equal to the R6 Core/Auth archives and the
     charts `c36b7a06…` archive, before and after.
2. **Checker gates.**
   - **Checker host:** a separate one, 40/40 files.
   - **Where they ran:** on an isolated labeled clone (`app-b-registry-shaped`) with only the `package.json` specs
     rewritten; the other files are hash-equal. This is honest isolated materialization, because the snapshot includes
     the manifest.
   - **Positive:** the external Auth+Charts policy **passes**.
   - **Negatives, all rejected:**
     - wrong pin;
     - expected core 0.13.0;
     - envelope expecting checker 0.13.0, or another pin;
     - **the exact bundled Auth-only bytes** (Charts unapproved at `ChartView.svelte:2`, `model.ts:21`);
     - charts pin 0.3.1;
     - auth pin 0.3.1;
     - core pin 0.13.2;
     - Svelte 5.57.0;
     - missing root;
     - labeled copy with an unapproved import.
   - **Bundled selectors:** `bundled:auth` and `bundled:charts` analysis both reject (the other companion is unapproved),
     and bundled qualification is refused with exit 22.
   - **Informational:** the read-only in-place run is refused as not registry-shaped.
3. **Functional proof, reused and not rerun.** Source and installed bytes are unchanged, and the checker is not part of
   the app runtime.
   - `review-receipts/sequential-browser-coordinator/result.json`: 8 browser passes on R6, sha256 per the receipt.
   - The Auth-only production derivative of this App-B and its 12/12 controls are covered in the checker review, §4.

## Limitations carried forward

- **Checker limitations:** see `OPUS-FINAL-PROFILE-REVIEW.md` §3 for the named, pre-existing and escalated gaps. A clean
  result proves only the five detectors over the reachable graph.
- **Manual architectural review** remains required, and the inactive rules are not enforced.
- **Opacity** verifies companion identity and installation, not internal correctness.
- **Physical microphone behavior** (App-A voice) is not proven here.

## History preserved

Earlier compatibility exercises and failures, such as the App-A getter and App-B executor/`Promise.all` refusals under
older checkers, remain in their original receipts. They are not overwritten.

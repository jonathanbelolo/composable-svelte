# Independent Astra targeted review — guidance correction 1

Completed 2026-09-27 22:03Z / 2026-09-28 00:03 Europe/Paris. Same independent Astra HIGH review context as `guidance-astra-review.md`, under canonical policy v2.10. Scope: the three frozen test files in `guidance-correction1-snapshot`, addressing P2 G1. No product edits and no runtime approval.

## Disposition

**G1 closed; correction accepted within its bounded test scope.** No new blocking finding. The corrected witness observes actual component completion callback deliveries before reducer filtering, so a stale callback cannot hide behind the reducer's status guard. Independently verified: normal Chromium suite **10/10**, strict Svelte check **0 errors / 0 warnings**, and the stale-callback mutation **fails at the new delivery assertion**, as required.

The original review remains applicable to the other unchanged files in manifest `bc737ce2e9743253155b65255d8128e473998198296999518ea60bae8d8c01c8`. This correction supersedes only its browser test entry and adds the two probe files. Pending final-core native-diagnostic and combined-nested-timeline reconciliation remains separate and open for final integrated acceptance.

## Why the correction is valid

- `vi.mock` retains the real public navigation-components exports and substitutes only a transparent Modal observer.
- `ModalProbe.svelte` renders the original `Modal`, forwarding every remaining prop, including children, presentation and motion. It wraps both completion callbacks, appends each actual delivery to the test-owned log, then calls the application's original callback. It does not provide fake lifecycle completion.
- Each overlay test resets the delivery log. Default open/close and explicit close require one presentation and one dismissal completion; refused close requires presentation only; reversal requires dismissal only. A missing mock would leave the positive default-open log empty and fail.
- The reversal retains its old status assertion and now checks the callback log after plane clearance and 30 quiet frames. In the qualified Chromium run, the reversal test lasts approximately 1.1 seconds, beyond the example's original 480 ms opening and 400 ms closing durations. The finite observation window qualifies this scenario; it is not proof against arbitrarily delayed callbacks or every refresh-rate environment.
- No app fixture, guide code, reducer or runtime was changed to implement the observer. Test-only animation-frame waiting is evidence collection, not application lifecycle orchestration.

## Independent execution and mutation

Scratch directory: `/private/tmp/overlay-guidance-correction1-review-probe`. It contains the prior frozen fixture overlaid with the exact three correction files. The original app `DetailView.svelte` was restored from the first immutable snapshot; the prior mutation was not carried forward. The only config adjustment is an explicit Vite filesystem allowlist for scratch and repository paths. Dependencies resolve through public built-package exports, without a core source alias.

| Check | Result |
| --- | --- |
| Recalculate all three correction manifest entries | Match |
| `svelte-check --workspace /private/tmp/overlay-guidance-correction1-review-probe --tsconfig ./tsconfig.json --fail-on-warnings` | 0 errors, 0 warnings |
| `vitest run --config vitest.browser.config.mjs` | 10/10 Chromium at 00:01:40 local; no page reload |
| Stale-callback mutation, `-t 'a close during the opening'` | Expected failure at `tests/app.browser.test.ts:246`; 1 failed, 9 skipped |

The independent mutation changes only the scratch `tests/ModalProbe.svelte`: when presentation reaches `dismissing` before presentation completion has been observed, it invokes `presented()`, the same wrapped callback supplied to the real Modal. The browser logs the invocation. The old `seen.has('presented') === false` assertion still passes; the new assertion rejects actual `['presentationComplete', 'dismissalComplete']` instead of required `['dismissalComplete']`. Thus the exact blind spot from G1 is now discriminated. The production runtime and unmodified test assertion are not changed by this mutation.

Evidence paths and SHA-256:

| Artifact | SHA-256 |
| --- | --- |
| `/private/tmp/overlay-guidance-correction1-review-probe/normal-browser.log` | `8da703c3c3797a5500be9b5707f967018e1d33e430efee97605c6c9afbcb230d` |
| `/private/tmp/overlay-guidance-correction1-review-probe/stale-callback-mutation.log` | `5dd18101ed88142d54f98ff7af091267d76edf67c8711ffc9c5857fdb02761be` |
| `/private/tmp/overlay-guidance-correction1-review-probe/tests/ModalProbe.svelte` (mutation) | `6baabcae8c85b85f0b2070af15e5b40012c0940e8a9744f64ddc338f1bba51e4` |

The original probe is retained beside it as `ModalProbe.svelte.original`. Commands used the repository's absolute `packages/core/node_modules/.bin` binaries. Browser execution used normal approved escalation for localhost listening. No full-core or workspace suite ran; unchanged node-plan evidence is retained from the previous independent review.

## Runtime identity limitation

The live built package was rebuilt immediately before the normal browser run: observed module mtimes are 2026-09-28 00:01:37–38 +0200; test start is 00:01:40. Therefore these independent passes must **not** be attributed to the stale 21:48 build identity document. Post-run observed SHA-256 values:

- `packages/core/dist/application/renderer/choreography/run.js`: `199e453886ec42ee523fa80799016f4a6c1130af5d81abc380a19bdaaa0475af`.
- `route-host.js`: `7c71d1a2fd55fee1333ecf8c8edef134443e5bb504dd2b0b476d683feda55e5f`.
- `overlay-motion.js`: `f88ed228e217789ffa51deda1e92fcbcda4b43aa33f10c1a3070bc1520b16db1`.

These are observed built-module identities, not a frozen whole-runtime attestation. The review closes the callback-test defect; final execution evidence still follows the final integrated build.

## Exact correction identity

- Manifest SHA-256: `ff95dbbfb34ae32102573c2d4f3a6d89012527db5800c13deeb40d319915b490`.
- Frozen updated author report SHA-256: `62fb775276cf468ce296c49cde8ff8fc6888f443340e4ddfde924de0c4c32437`.

| File | SHA-256 |
| --- | --- |
| `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts` | `39d019815bb9a5bfd6c423e8ed42c26743c3780353881961036a9888f88f2edf` |
| `docs/development/fluid-motion/guidance-example-check/tests/modal-probe.ts` | `68b8ed367e1a401d8e3c588cf279dd1320214b2856e4142633a249b613724488` |
| `docs/development/fluid-motion/guidance-example-check/tests/ModalProbe.svelte` | `6c679ce1799e203b734484e3decb9aeaab88064cb4bcbb796fb5d1aed215e772` |

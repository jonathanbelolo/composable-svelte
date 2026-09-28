# Firefox animation-stack continuation diagnostic

**Disposition: the reproduced failures are assertion synchronization errors caused by Firefox's paused-animation style/time skew, not evidence of a reconstruction defect.** The narrow correction is test-only: after the decorative replay's pause has completed, explicitly assign its exposed `currentTime` back to itself before sampling that replay and constructing the fresh reference. No broader sleep, tolerance increase, expected-failure marking, or runtime change is justified by these measurements.

## Isolation and baseline

This task used `/private/tmp/fluid-overlays-firefox-timing`, a fresh `git archive` of `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`. Only the four tests in `representation.browser.test.ts`'s “animation stack continuation after retirement” group ran. The entire representation implementation and original test are byte-identical between that baseline and the live overlay branch (hashes in `identity.json`). This establishes pre-existence; the diagnosis below, rather than unchanged authorship, establishes cause.

No live repository runtime/test files were edited. Diagnostic logging was confined to the temporary `stack.ts` and temporary test file; baseline runtime was restored before evaluating the proposed test synchronization. Retained files ending in `.test.ts` are evidence, not installed product tests.

## Observations

1. **Unchanged baseline, three trials:** 1, 2, and 1 failures respectively among the four selected tests (4 failures / 12 checks). Failures are reproducible without the overlay delta.
2. **Logging-only reconstruction instrumentation:** solved bases match the authored underlying values. One two-animation case solved `5.00041px` from authored `5px`, with offset 0; scalar-add solved `10.0002px` from `10px`. The implicit transform solved the exact expected base matrix containing a 10px translation and 5° rotation.
3. **The failure occurs after the test pauses the copy.** In one trial the paused replay exposed `currentTime = 333.34`, `pending = false`, `playState = paused`, while its computed margin was `22.65px`. Replaying the same stack with a fresh explicit hold time of 333.34 produced `22.3813px`. Another transform trial exposed 333.34 but painted translation `27.04px` instead of reference `26.667px`.
4. **Another rAF does not resolve it.** The margin and transform mismatches stayed exactly unchanged on the next frame, with the same paused `currentTime`.
5. **Assigning the same exposed hold time resolves it.** With the copy's underlying/keyframes unchanged, `animation.currentTime = animation.currentTime` changed the two-animation result to `22.3816px` against reference `22.3813px`; the transformed result became `26.667px` against `26.667px`. The correction acts on the decorative copy only, after the source has already retired/been removed.
6. **Native browser control, no representation code:** a plain `HTMLElement.animate()` add-composited margin animation exhibits the same behavior. At exposed time 333.32 it painted `23.4532px`, while a fresh explicit-time native reference painted `23.3328px`. A further frame still painted `23.4532px`; setting the same exposed hold time painted exactly `23.3328px`. The standalone `firefox-native-pause.browser.test.ts` imports only Vitest and DOM APIs, independently isolating the browser behavior.

These values distinguish the browser's automatic pause hold/style inconsistency from incorrect reconstructed underlying values. The supported inference is specific to this Firefox execution environment; this investigation does not purport to identify Firefox's internal implementation defect or prove all possible animation fidelity.

## Discriminating correction evidence

`test-only-synchronization.patch` adds the explicit hold-time assignment immediately after the existing pause/frame/ready sequence and before `copyTimes`/`copyValue` are read. It preserves the original 0.2 tolerance, original source-nonmutation check, original keyframes/composite/easing, and reference construction.

- **Six bounded repeated trials:** all four tests passed each time (**24/24**), using the byte-identical baseline runtime without diagnostic logging.
- **Negative control:** deliberately adding 2px to the reconstructed copy's underlying `margin-left` still fails both relevant synchronized tests. The additive case failed by **2.0006px** and replace-plus-add failed by **1.3666px**; opacity and transform remained passing. Thus the synchronization does not hide a wrong reconstructed base.
- **Standalone native control:** the same native-only pause/style diagnostic is retained and executed separately. Its explicit-time equality check passes; original mismatch values are logged rather than asserted to exceed a flaky threshold.

Apply the narrow test patch through the author, then run the same four tests in the final candidate. Update the stale comment calling these an open continuation gap: the retained measured issue is Firefox's post-pause test sampling, not a demonstrated runtime continuation failure. The full overlay acceptance suite should still run at final freeze; this diagnostic does not approve unrelated changes or replace remaining R1–R6/C2/C3 review.

## Retained evidence

- `baseline-unchanged-{1,2,3}.log`: original failures.
- `instrumented-{1,2,3}.log`, `instrumented-original.test.ts`, `stack.instrumented.ts`: solved bases and exact times.
- `pause-diagnostic-{1,2,3}.log`, `pause-diagnostic.test.ts`: unchanged extra-frame values, explicit hold-time values, embedded native control.
- `explicit-holdtime-{1..6}.log`, `explicit-holdtime.test.ts`, `test-only-synchronization.patch`: 24/24 corrected checks with baseline runtime.
- `negative-control.log`, `negative-control.test.ts`: deliberately wrong bases are rejected.
- `native-only-control.log`, `firefox-native-pause.browser.test.ts`, `vitest.native-pause.config.ts`: independent browser-native control.
- `identity.json`: baseline/live representation identities plus hashes for retained artifacts.


## Requested production-boundary confirmation

The proposed self-assignment is limited to **test-owned decorative replays after the test itself has paused them to construct a static measurement oracle**. It does not repair a measured production retirement jump.

Production-path inspection:

- `representer.ts:352–365`: retirement takes a final read and reconstructs the stack. It does not pause running replays or await a pause before reading their styles.
- `stack.ts:130–142`: when the source is running, the reconstructed replay is started by assigning the source's `startTime` on the same document timeline. There is no running→paused transition. When the source was already non-running, the replay receives an **explicit current time before pause**.
- `projection.ts:342–348`: explicit-keyframe replay assigns the source current time first, and only pauses for an already paused/finished source. It never pauses a running source's established replay as the failing test does.
- `reconstruct.ts:74–76`: scratch interpolation already pauses and then assigns an explicit current time before its computed-style read. It therefore already uses explicit-time evaluation rather than the problematic automatic pause hold time.
- The other `.pause()` sites under representation are audio/video player operations and are unrelated to WAAPI `Animation` sampling.

A new bounded Firefox witness exercises **the production retirement path with no pause, no hold-time self-assignment, and no time rewrite of the decorative replay**. For each of the four failing-test animation stacks, a separate running native reference is assigned the original source's start time; production retires the representation, and the original source is cancelled and removed. The copy and reference are compared immediately and across 20 subsequent rAFs (21 samples per stack):

| Stack | Immediate error | Maximum error across 21 samples |
| --- | ---: | ---: |
| Add margin | 0 | 0 |
| Replace plus add margin | 0.0007px | 0.0007px |
| Implicit opacity/easing | 0 | 0 |
| Implicit transform | 0.000001 matrix component | 0.000001 matrix component |

The copy/reference running animation times also match in every recorded endpoint. This directly tests observable continuation after original-source removal, rather than relying on unchanged runtime authorship or the synchronized paused oracle.

Two additional witnesses cover the production branches whose source is **already paused**, for implicit and explicit keyframes. Both preserve `currentTime=400`, `pending=false`, `playState=paused`, and opacity **0.58** after retirement and removal, without applying the proposed test self-assignment to their copies.

Result: **6/6 passing; 84 running style comparisons plus two paused-source checks**. Retained executable `firefox-production-boundary.browser.test.ts`, config and `production-boundary.log`. Within the investigated stacks and production paths, no runtime continuation repair is indicated. The earlier narrow test-only disposition is confirmed; unrelated visual paths remain outside this diagnostic.

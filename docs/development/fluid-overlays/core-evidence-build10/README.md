# Build 10 viewport-race and C1 evidence (core91)

## Viewport teardown race: diagnostic (18:45Z)

The diagnostic source is `viewport-race-diagnostic.browser.test.ts.txt`. It was run twice on three engines (Chromium 141, Firefox 142, WebKit 26). Recorded output, identical in both runs (count × line):

```
3 RACE A start 414
3 RACE B start 640                   <- previous test's fire-and-forget restore still pending
3 RACE B after awaited 660 + rAF 660
3 RACE B 100ms later 660
```

## Original failure

Recorded in `visual-correction2.browser.test.ts` (source before the fix: `visual-correction2.before-fix.browser.test.ts.txt`):

```
AssertionError: expected 192 to be close to 198, received difference is 6, but expected 0.5
```

192 = 0.3 × 640; 198 = 0.3 × 660.

## Negative controls (18:45:59Z)

Two isolated temporary copies of the fixed file were run with `-t "replan keeps the original source basis"` and then deleted. Each failed 3/3:

| Control | Change | Recorded failure |
|---|---|---|
| Wrong viewport basis | `…width).toBeCloseTo(0.3 * 640, 0)` | `AssertionError: expected 198 to be close to 192, received difference is 6, but expected 0.5` |
| Wrong source basis | `…x).toBeCloseTo(from.x + 60, 6)` | `AssertionError: expected 80 to be close to 60, received difference is 20, but expected 5e-7` |

## C1 capture attempt

`c1-capture-18-48Z.log` is the full output of one diagnostic rerun of the targeted set: 384/384, no recurrence.

## C1 destination-retarget: inspection (18:52Z; no rerun, no edits)

- **Test:** `visual.browser.test.ts:51`. It is a real-clock route transition (`setup()`, no manual clock), so frames follow real `requestAnimationFrame` timing.
- **Failing assertion.** The build-2 recorded failure location `visual.browser.test.ts:66:18` is `expect(last.vx).toBeCloseTo(0, 6)`, the zero-velocity endpoint check. The recorded value was `0.004882615279200309` (Firefox, full-suite load). The position checks on the lines above passed in that run.
- **Candidate mechanism: hypothesis, not yet verified.**
  - `last` is the last `frame` diagnostic for `hero`. The test assumes that frame is sampled **at or after** the track's end, where the Hermite continuation's velocity is exactly 0.
  - Under load on a real clock, the run can settle through its completion path after a final frame sampled a few ms **before** the end. At that point the continuation's velocity is small but nonzero; 0.0049 px/ms is consistent with a sample shortly before the end.
  - This would be test timing (which frame is last), not a runtime continuity defect. It is unconfirmed.
- **Evidence still needed.** A failing capture showing the last frame's `t` against the track end (`retarget.t` plus the remaining duration), and whether a frame at the end exists. The build-10 run-3 failure's values were not captured.
- **Build-10 relevance.** This path (`admitted()`, motion on, current page defined) never calls `engine.discard`. The frozen numeric domain is untouched. No assertion change is proposed.


## C1: correction to the 18:52Z inspection (after the independent capture)

- **The 18:52Z hypothesis is RETRACTED.** The independent Astra capture (60 cases, 7 failures) shows every failing run's final frame at **t = 700, exactly at the destination** (x 300, y 0, w 120, h 40), with the run completed. It was not a pre-end sample.
- **Measured cause (Astra).** `run.write` reports `vx = compose(t).x − compose(t − 1).x`, a **backward 1 ms secant**, not the instantaneous derivative. At t = 700 the secant spans t = 699, where the continuation is still moving, so a small positive `vx` is the correct secant value.
- **Why intermittent.** Whether the last frame's secant window [t − 1, t] reaches back before the end depends on real frame timing. A frame at or just past the end gives a nonzero secant; a frame at least 1 ms after it gives 0.
- **Consequence.** `expect(last.vx).toBeCloseTo(0, 6)` asserts an instantaneous zero end velocity against a secant diagnostic. The assertion's semantics are wrong, not the runtime. The correction is test-only and is being prepared by the reviewer.


## C1: test-only correction applied (18:53Z; Astra's exact recommendation)

- **File:** `packages/core/tests/fluid-motion/visual.browser.test.ts`, SHA-256 **`eee248467331db409bba98eae3e8bc27fe4dfbb81732a76ad0ea33013ec6a564`** (frozen).
- **What changed:** only the final `expect(last.vx).toBeCloseTo(0, 6)`. It now reads `expect(last.vx).toBeCloseTo(hermiteX(last.t) - hermiteX(last.t - 1), 6)`, the exact backward 1 ms secant of the closed-form final Hermite continuation: `T = 700 - retarget.t`, `u = clamp((ms - retarget.t)/T, 0, 1)`, terminal velocity 0.
- **Unchanged:** the tolerance, every retarget-continuity assertion, and the endpoint assertion `last.x` equals `retarget.to[0]` (within 1e-3).
- **Result:** the corrected test passes 3/3 (Chromium, Firefox, WebKit).
- **Negative controls** (isolated copies, deleted; sources `c1-negctl-*.browser.test.ts.txt`, output `c1-negative-controls.log`):

| Control | Change | Recorded failure |
|---|---|---|
| Secant | expected secant + 0.01 | Fails 3/3: `expected +0 to be close to 0.01 … expected 5e-7` |
| Endpoint | endpoint expectation + 1 px | Fails 3/3: `expected 300 to be close to 301 … expected 0.0005` |

- **No production or numeric change.** Build 10's `src`/`dist` identity is unaffected (tests are outside `src`).

# Independent S1 review — changes requested

Review completed 2026-09-27, approximately 21:08–21:17 UTC (tool output uses Europe/Paris). Fresh independent Astra review context; the lead owns the actual `gpt-6-astra` / `high` launch record. This context authored no product corrections. Canonical policy read: `/Users/jonathanbelolo/dev/claude/code/composable-runtime/MULTI_AGENT_ARCHITECTURE.md`, version 2.10. No additional reviewers were spawned.

Reviewed baseline `2e07f650c1421c25f6b29d2db9c0cc885ea891ed` plus the eight files in `s1-review-snapshot/manifest.json`, whose SHA-256 is `29d64c5c92f0918cbc1a9c3bc54a398d57564b136e2eba67ae949b2a609e92dc`. All eight executable copies in `/private/tmp/fluid-overlays-s1-review` independently matched the manifest before and after verification; see `s1-astra-evidence/identity.json`. Findings refer to the **frozen** source line numbers, not the concurrently changing integration checkout. The assignment, final design disposition, frozen author report, relevant implementation and tests were read.

**Disposition: do not approve this frozen candidate.** Five behavioral defects were reproduced; the lead has assigned the transform defects to core91 and numeric defects to retained f29. A narrow public-documentation correction is also required. Existing successful scope can retain this review evidence during targeted correction review.

## Reproduced findings

### R1 — P2: map outgoing slide deltas into the copy's coordinate space

Frozen `run.ts:1408–1415` subtracts the real element's local CSS translate offsets and applies the result directly as viewport translation on its body-level copy (`moveCopy`, lines 1148–1154). Thus an ancestor's scale or rotation disappears from the trajectory at removal.

Independent browser probes use an ordinary outgoing div, linear 40px x slide over 1000ms, and reveal at 416ms. Between reveal and 700ms, an ancestor `scale(2)` requires 22.72px viewport displacement; the copy moves approximately 11.36px. Under ancestor `rotate(90deg)`, the continuation moves approximately 11.36px horizontally and 0px vertically, instead of 0px horizontally and 11.36px vertically. These fail in Chromium, Firefox and WebKit. The rotation probe also exposes an immediate handoff discrepancy because the prior frame's sample is advanced on the wrong axis.

Preserve the ancestor mapping of the declared translate delta at handoff, or faithfully settle unsupported cases with a reason. Merely retaining the participant's accumulated matrix for its copied shape does not transform the new translation delta. Native outgoing motion shares `copyMotion` and must use the same corrected mapping.

### R2 — P2: preserve the scale origin across the outgoing handoff

Frozen `run.ts:1414–1415` always compensates around the painted center, while `writeMotion` (1425–1427) scales the real element around its existing CSS `transform-origin`. This changes an accepted scale track's path during removal for a noncentral origin.

An outgoing 100×40px div at (100,100), `transform-origin:0 0`, and scale 1→0.5 keeps its real top-left at (100,100). Revealing at 416ms already places the copy near (100.4,100.16); at 700ms it drifts to (107.5,103). All three browsers reproduce it. The old baseline had no outgoing scale channel. The author's JSDoc describes two different origins, but that is not an accepted exception to continuous composition; design §7 also originally specified center scaling.

Choose and implement one coherent origin contract for both phases. The default centered-origin affine case passes independently, so no blanket rejection of rotation is warranted.

### R3 — P2: do not infer stable scale from a predecessor's displayed lease

Frozen `run.ts:1126` uses `scaled.stable || style.scale`. When the stable projection has no inline declaration, an earlier live choreography lease is already reflected in computed `style.scale`. The successor mistakes that displayed factor for its stable base and multiplies the new track into it.

With stylesheet `scale:2`, an outgoing scale 1→0.5 has displayed scale 1.5 at 500ms. Starting another run while that lease remains live produces scale 0.75075 at successor time 999ms, instead of 1.001 relative to the stable scale 2. All three browsers reproduce it, and lease cleanup remains balanced. The probe intentionally exercises the existing concurrent acquisition seam rather than fabricating a CSS snapshot.

Baseline incoming-slide code already read computed translation while acquiring its lease; that older translation issue is not attributed to S1. **Uniform scale is new in S1**, and this new channel reproduces the stable-base error. Store or recover stable computed composition independently of active paint, then adopt displayed state separately. Core91's concurrent ownership changes must preserve that distinction.

### R4 — P2: finite arbitrary-y continuation can overflow after tween sampling is clamped

Frozen `channels.ts:274–284` passes its displayed state into the unchanged Hermite implementation. S1's tween overflow guard does not protect that continuation. The reproducible input is:

```ts
const track = channelTracks.tween('x', {
  from: 0, to: 100, startMs: 0, durationMs: 1000,
  easing: { cubicBezier: [0.5, 1e308, 0.5, 0] }
});
const continued = track.retarget(250, 100, 300);
```

The original sample is finite (`Number.MAX_VALUE`, velocity 0, constrained). The continued samples at 325, 400 and 475ms have **velocity `-Infinity`**. `hermite.ts:138` multiplies the near-maximum span before division by duration. A later retarget consumes this nonfinite velocity and cannot meet the validated continuation contract.

The Hermite expression is unchanged baseline code, but arbitrary finite y now reaches it from ordinary 0→100px endpoints; the assignment explicitly requires finite continuation. This is an S1 integration defect, not a demand to fix every unrelated extreme-number baseline input. Scale the arithmetic and/or observably constrain actual overflow throughout continuation, without rejecting finite y.

### R5 — P2: epsilon classification replaces a finite derivative with an unrelated approximation

Frozen `channels.ts:116` labels a curve singular merely because its minimum dx/dt is ≤1e-6. `bezierDerivative` then enters the finite-difference branch (`144–158`) for a mathematically nonsingular curve.

`sampleEasing({cubicBezier:[1e-8,1,0.5,1]},0)` returns slope **75.79660915398344**, `singular:true`; the analytic endpoint derivative is the finite value **100000000**. This also changes the velocity handed into a retarget. The explicit test fails in the Node runner.

The earlier design's epsilon wording could have supported a broader approximation policy, so this was raised to the lead rather than silently treated as a new restriction. The lead confirmed the correction: epsilon alone cannot classify a mathematically nonsingular curve while exact finite derivatives are promised. Preserve finite analytic slopes; reserve the qualified approximation for true singular curves/points.

## Destination easing: permitted continuation, incorrect public description

The final measured shared segment uses `retargetGeometry`/Hermite (`run.ts:899–928`), replacing only the final segment while preserving future authored intermediate waypoints. Baseline source confirms this behavior is unchanged. Main explicitly allows retargeting to alter the remaining curve, so **Hermite itself is not an additional implementation defect or an obligation to force the declared bezier after measurement**.

However, new `Waypoint` JSDoc at frozen `plan.ts:45–46` states that segments “including the last one to the destination” use the track easing. That promise is false after measurement; a track-end placeholder's waypoint easing is also superseded. Correct that narrow documentation claim and explain the measured-destination qualification alongside the existing retarget documentation. No broad design loop is needed.

## Executed checks and positive evidence

All commands below ran from `/private/tmp/fluid-overlays-s1-review/packages/core` using the frozen files. The first browser attempt could not listen on localhost under the sandbox (`EPERM`); the normal escalation was approved, and subsequent browser runs executed. A disposable native probe initially had a syntax typo, which was fixed before its measured run; that import failure is not a product failure.

| Command / scope | Observed outcome |
| --- | --- |
| `npx vitest run --config vitest.node.config.ts tests/fluid-motion/channels.test.ts tests/fluid-motion/channels-retention.test.ts` | 30/30 passed |
| `npx vitest run tests/fluid-motion/s1-easing.test.ts` | 11/11 passed in Chromium |
| `npx vitest run --config vitest.fluid-motion.config.ts tests/fluid-motion/s1-channels.browser.test.ts` | 24/24 passed: 8 in each engine |
| Same browser config, `s1-review-probes.browser.test.ts` | 12 failed / 6 passed: four reproduced geometry/ownership failures and two positive controls per engine |
| Same browser config and probe file, `-t 'dynamic control\|affine own rotate'` | 6/6 passed after tightening dynamic return to exactly 120ms |
| Same browser config, `s1-review-native.browser.test.ts` | 3/3 passed: actual native driver in Chromium/WebKit; explicit unavailable-API/commit fallback in Firefox |
| Node config, `channels-s1-review.test.ts` | 2/2 failed, reproducing R4 and R5 |

The original browser suite witnesses CSS easing accuracy ≤1e-3, arbitrary overshoot on ordinary opacity and shared geometry/radius/clip paths, waypoint segment overrides, bounded properties, incoming/outgoing default-origin transform composition, real hit boxes, control holding, focus and cleanup. The original numerical suite validates object/CSS normalization, finite-y acceptance, invalid values, unchanged named aliases, typical analytic derivatives, true singular approximation and ordinary C0/C1 retarget continuation.

Independent positive controls further establish:

- A non-control that gains tabindex and focus mid-flight returns both translate and scale to stable by exactly 120ms, retaining focus. This closes the reported dynamic-focus evidence gap for that path.
- A participant with its **own** `rotate(30deg)` retains centered outgoing scale and slide through its affine copy in all three engines. Ancestor rotation remains the distinct R1 failure.
- An actual cross-origin iframe View Transition snapshot follows outgoing slide and scale in Chromium 141 and WebKit 26. At 500ms the driven pseudo-element matrix scale is approximately 0.706086 and translation approximately (122.296,29.713), agreeing with the copied box plus the scaled iframe offset. Native styles/animations are released. This is a real browser native-session/WAAPI witness, not a mocked session, but it is geometry evidence rather than a new screenshot pixel comparison. Firefox 142 lacks the native API and reports its established fallback; that absence is not a new regression.

Every transform probe's teardown asserts zero choreography leases. No full workspace suite, publication, or source mutation was performed. The author's isolated Firefox resize failure was not reproduced or explained here; its test uses a linear track and unchanged viewport timing, so it remains reported uncertainty rather than a proven S1 defect. The old assertion-message mismatch was already corrected in the frozen file and is not a current finding.

## Retained evidence and follow-up scope

`s1-astra-evidence/` contains the three standalone probe files and the independently generated identity record. To rerun, copy the probe files into the isolated checkout's `packages/core/tests/fluid-motion/` and use the commands above. They deliberately assert correct behavior, so the frozen candidate fails them. The geometry probe's diagnostic text was corrected from an outdated 400ms label to the actual 416ms reveal; its failing assertions were unchanged. The focus positive control was rerun after tightening its deadline.

Require targeted independent review of the actual corrected numeric and transform files, their focused regressions, the public destination wording, and integration with core91's new ownership rules. This report approves neither moving live files nor unpublished later corrections. Existing unchanged easing/channel evidence can be reused.

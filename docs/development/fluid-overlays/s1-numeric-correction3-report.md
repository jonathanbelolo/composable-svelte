# S1 numeric correction 3: author report

Author: Graphics f29 (Claude Opus 5.5). Assignment: [s1-numeric-correction3.md](s1-numeric-correction3.md). This correction is not self-accepted, and nothing is committed. An independent review is required.

## Timing and scope

| | UTC |
|---|---|
| Read the assignment | 21:31:55 |
| Last test run | 21:33:48 |
| Report | about 21:35 (deadline about 21:52) |

- **Edited:** `channels.ts`, `hermite.ts` and `tests/fluid-motion/s1-easing.test.ts`.
- **Unchanged:** `channel-types.ts` (`6ad7096d…`).
- **Not touched:** `run.ts`, `plan.ts`, the public exports, overlay files, and every prior snapshot, including `s1-numeric-correction2-snapshot/`.
- **No broad browser suite was run.**

## Finding

`x 0→1 / 1000 ms` with `[1e-310, 1, .5, 1]` returned `{ value: 0, velocity: NaN }` at 0.

- **Cause:** `slopeScaled` divided dy by dx before scaled evaluation. dy/dx = 3/3e-310 = ∞ was then passed to `scaledProduct`, which assumes finite factors, so ∞/k gave NaN.
- **Fast path:** the `ys = 1` fast path could also produce ∞ × 0 or ∞/∞.

## Correction

1. **No early division:** `slopeParts` replaces `slopeScaled` and returns the slope as an **unevaluated ratio `[numerator, denominator]`** (dy, dx in `ys` units, or the L'Hôpital or finite-difference parts). It never divides. The denominator is always nonzero in every branch: dx > 0, |x″| or |x‴| > 1e-9, or the difference window.
2. **`scaledRatio(numerators, denominators)`** replaces `scaledProduct`. It forms Π numerators / Π denominators from mantissas in [0.5, 1), renormalized after every factor, plus an exact integer sum of power-of-two exponents, which is applied last in bounded steps.
   - No intermediate overflows or underflows.
   - For finite inputs the result is NaN never, and ±∞ only when the true value exceeds the double range.
3. **Tween velocity:**
   - **Ordinary path:** used only when `ys = 1` and dy/dx is finite. It is the same expression as before, `((to − from)·slope)/duration`.
   - **Otherwise,** including when the ordinary path's result is non-finite: `scaledRatio([span, dy, ys, k], [dx, duration])`, where `span` is expressed in exact power-of-two units `k`.
   - **Clamping:** a result is clamped only when it is **truly** beyond the double range. A saturated position gives ±MAX with velocity 0; a velocity alone gives ±MAX.
   - **Constraint flag:** only an actual clamp sets the runtime `constrained` flag. A non-finite value from the ordinary path alone no longer sets it.
4. **`sampleEasing().slope`** is `representable(scaledRatio([dy, ys], [dx]))`. A bare progress slope beyond the range (1e310 here) is reported as MAX.
5. **Hermite:** `27/(4T) · gap` could be ∞ × 0 = NaN when T is subnormal and the range gap is 0. The bound is now 0 when the gap is 0, which is the value of its finite limit.

## Regressions

These are in `s1-easing.test.ts`, under "numeric correction 3".

- **The exact probe:**
  - The value is 0 and the velocity is 1e307 (to 9 digits).
  - `constrained: false`.
  - The bare progress slope reports MAX.
- **Representative small positive x1** ∈ {1e-300, 1e-310, 5e-324}, × y1 ∈ {1, 1e300, MAX}, × (span, duration) ∈ {(1, 1000), (1e-300, 1), (1e10, 1e-6)}, i.e. 27 cases. At 0, each state is finite. Representability is decided in log2, without overflow:
  - **Representable true velocity:** it matches span·(y1/x1)/duration to 9 digits, and the track is not constrained.
  - **Truly overflowing velocity:** it is exactly MAX, and the track is constrained.
- **A no-NaN sweep of the finite public domain:**
  - x1 and x2 ∈ {0, 5e-324, 1e-310, 1e-8, 0.5, 1−2⁻⁵³, 1}.
  - y1 ∈ {±MAX, ±1e300, 0, 0.5}; y2 ∈ {−MAX, 0.5, MAX}.
  - Spans: 0→1, −MAX→MAX, MAX→−1e300. Durations: 5e-324 and 1000.
  - 4 samples each, plus a retarget and 2 continuation samples: over 10,000 tween samples, all finite.
- **Hermite with a zero range gap and a subnormal duration:** finite start velocity and samples.
- **Earlier corrections:** all correction-1 and correction-2 regressions still pass, including N1's exact `(MAX/1000)·2`.

## Commands and outcomes

All commands were run from `packages/core`.

| Command | Outcome |
|---|---|
| `npx tsc --noEmit`, filtered to `channels`/`hermite` | Clean |
| `npx vitest run tests/fluid-motion/s1-easing.test.ts` (Chromium) | 21/21 |
| `npx vitest run --config vitest.node.config.ts tests/fluid-motion/channels.test.ts tests/fluid-motion/channels-retention.test.ts` | 30/30 |
| `npx vitest run --config vitest.fluid-motion.config.ts tests/fluid-motion/s1-channels.browser.test.ts -t "CSS reference"` (pure sampling) | 3/3 (Chromium, WebKit, Firefox) |

## Frozen files

| File | SHA-256 prefix |
|---|---|
| `packages/core/src/lib/application/renderer/choreography/channels.ts` | `480494cd96f7b646` |
| `packages/core/src/lib/application/renderer/choreography/hermite.ts` | `22404659c856fe45` |
| `packages/core/src/lib/application/renderer/choreography/channel-types.ts` | `6ad7096d83c50865` (unchanged) |
| `packages/core/tests/fluid-motion/s1-easing.test.ts` | `88fccd2e2355acc3` |

## Limits

These are stated as they are, not accepted.

- **Clamping:** values beyond the double range are clamped, as before, and observable through the owning track's `constrained`. `sampleEasing().slope` saturates at ±MAX when the bare progress slope is beyond the range.
- **Underflow:** a true velocity below the smallest subnormal returns 0. That is IEEE underflow, not NaN, and it is not flagged.
- **The sweep is deterministic and representative, not exhaustive.** It covers the edge classes named in the assignment (0, subnormal, tiny, ordinary, near-1 and 1 for x; ±MAX, ±1e300, 0 and ordinary for y; spans across the whole range; subnormal and ordinary durations) and one retarget per curve.
- **Performance:** any curve with |y| > 1 now evaluates its velocity through `scaledRatio` on every sample, which costs a few `Math.log2` calls. It is not profiled.
- **The vertical-tangent approximation and the `[1,0,1e-16,1]` conditioning limits** are unchanged from the correction-2 report.

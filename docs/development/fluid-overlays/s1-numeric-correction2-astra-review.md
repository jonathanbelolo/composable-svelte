# S1 numeric correction 2 — targeted independent review

**Disposition: changes requested for one remaining intermediate-overflow defect.** The exact original R4/R5 and correction-1 N1/N2/N3 reproductions now pass. Prior unchanged S1 evidence remains valid; this report does not review core91's unfinished transform integration.

Reviewer: retained independent Astra context, actual `gpt-6-astra` / `high` settings confirmed by the lead. Canonical policy v2.10 and the previously reviewed finite-domain contract apply. Work performed approximately 21:30–21:33 UTC, 2026-09-27, within the 900-second ceiling. No product edits or broad browser rerun.

## Frozen candidate

Input: `s1-numeric-correction2-snapshot/`, manifest SHA-256 `bf432f0ca78f116de24de9a7e4bb6fcfa5ab5cc60e368526838c51b751ef54cd`.

| File | SHA-256 |
| --- | --- |
| `channels.ts` | `82dd709c596faa96e0fb1a1c34c6c4e58cb917bb3773bce963e308973f8da3e2` |
| `hermite.ts` | `80ffa6367eb15befe65aeed00c94c674964f033f7e8022f6a3ebfb9e8da7eeb0` |
| `channel-types.ts` | `6ad7096d83c50865d015246189097f5b22ed166aca448479ca8c09c20fe7f84a` |
| `s1-easing.test.ts` | `d7b0a382ad9936a8bffd46f1214eb2180b436322d0ce069e602da7873445a9e8` |

The distinct executable `/private/tmp/fluid-overlays-s1-numeric-review2` was copied from the prior numeric-review checkout and overlaid with exactly these four frozen files. Hashes matched before and after testing. Original snapshots, original review executables and moving live product files were not changed.

## Closed reproductions and successful evidence

The final retained/author Node run passed **53/53**: existing 30 channel/retention tests, original two R4/R5 probes, four correction-1 follow-up probes, and the author's 17 numerical acceptance tests. The author test bytes were copied unchanged to a `channels-*` filename inside the disposable checkout solely to match the Node config's include pattern.

- N1 now returns exactly `3.595386269724631e305`, the finite expected channel velocity, without marking the track constrained.
- N2's `[1,0,1e-16,1]` now reports `singular:false` and a finite analytic slope of `2e16` at the solver's returned parameter. The exact singular classification and better-conditioned derivative forms were inspected; there is no remaining tolerance-based interior-singularity exception.
- N3's two saturated Hermite samples now return `{value:Number.MAX_VALUE, velocity:0}`, and the owning track correctly becomes constrained.
- Original finite-y continuation, steep finite endpoint derivative, ordinary derivative accuracy, bounds, named aliases, continuation history and dynamic constraint propagation remain green in the retained focused checks.

## N4 — P2: a tiny positive x control overflows before the new finite-factor product

In frozen correction-2 `channels.ts:172`, `slopeScaled` still performs `dy / dx` before the channel span and duration are combined. That quotient can be infinite even when the **final channel velocity is finite**. The new `scaledProduct` (`198–205`) assumes every input factor is finite; splitting that infinity produces NaN. The fallback at `429` reuses the already-infinite slope, so it cannot recover.

Exact reproduction:

```ts
const track = channelTracks.tween('x', {
  from: 0, to: 1, startMs: 0, durationMs: 1000,
  easing: { cubicBezier: [1e-310, 1, 0.5, 1] }
});
track.sample(0);
```

Observed result: `{value:0, velocity:NaN}`, with `constrained:true`. The true endpoint channel velocity is representable: `(1 / 1000) / 1e-310`, approximately `1.0000000000000031e307`. Calling `track.retarget(0,0,300)` then throws `RangeError: from.value, from.velocity, and to must be finite numbers` (observed and recorded).

This is the same intermediate-overflow family as N1, with the overflow occurring in division rather than multiplication. All declared inputs are finite and valid; the normalized x control is small and positive, not singular. Preserve numerator and denominator until scaled channel arithmetic finishes. Saturating the normalized slope would merely reinstate N1's loss of a recoverable finite result. The lead has assigned this bounded continuation to retained f29 as correction 3 and recorded its routing reassessment.

## Commands and durable evidence

Commands ran from `/private/tmp/fluid-overlays-s1-numeric-review2/packages/core`:

```sh
npx vitest run --config vitest.node.config.ts \
  tests/fluid-motion/channels.test.ts \
  tests/fluid-motion/channels-retention.test.ts \
  tests/fluid-motion/channels-s1-review.test.ts \
  tests/fluid-motion/channels-s1-corrected-acceptance.test.ts \
  tests/fluid-motion/channels-s1-numeric-followup.test.ts

npx vitest run --config vitest.node.config.ts \
  tests/fluid-motion/channels-s1-numeric2-probe.test.ts
```

First command: **53 passed**. Second: **1 failed**, reproducing N4. It was repeated once after adding a caught retarget attempt to retain direct evidence of the downstream RangeError; the failing assertion did not change.

`s1-astra-evidence/numeric-correction2/` retains `channels-s1-numeric2-probe.test.ts`, `retained-tests.log`, `remaining-probe.log`, and `identity.json`. Copy the probe into `packages/core/tests/fluid-motion/` to execute it with the Node config. This report approves neither correction 3 nor any concurrently changing integration files; only a narrow arithmetic follow-up remains for this numeric scope.

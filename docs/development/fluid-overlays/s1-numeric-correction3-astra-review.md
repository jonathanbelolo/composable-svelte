# S1 numeric correction 3 — targeted independent approval

**Approved for the frozen numeric scope below.** Original R4/R5 and follow-up N1–N4 are closed by the inspected correction and passing retained reproductions. No remaining actionable finding was identified in this targeted review. This does not approve core91's changing transform/overlay integration, resolve original R1–R3, or waive the destination-easing documentation correction.

Reviewer: retained independent Astra review context, actual `gpt-6-astra` / `high` settings confirmed by the lead. Canonical policy v2.10 and the prior S1 contracts remain applicable. Review completed approximately 21:35–21:38 UTC, 2026-09-27, within the 900-second ceiling. No product edits or broad browser rerun.

## Exact approved identity

Immutable input: `s1-numeric-correction3-snapshot/`, manifest SHA-256 `66cc5921cf1dbeded716069f80e7f07173f5e76cb2b55bf28e95ca4d9c688271`.

| File | SHA-256 |
| --- | --- |
| `channels.ts` | `480494cd96f7b64657a5239ac80456fef442a156ecf2f737adaf08b6a5c814bb` |
| `hermite.ts` | `22404659c856fe456ea5073a48dae553d842b5a7cebcc76b84b8c20f272d8163` |
| `channel-types.ts` | `6ad7096d83c50865d015246189097f5b22ed166aca448479ca8c09c20fe7f84a` (unchanged) |
| `s1-easing.test.ts` | `88fccd2e2355acc33ba4333b9c88cf94177fde866709b4efdfa84c06d68c5197` |

The separate executable `/private/tmp/fluid-overlays-s1-numeric-review3` contains the prior isolated S1 state with these four snapshot files overlaid. Hashes matched before and after verification. Earlier executables, snapshots and live product files remained untouched. The author test was copied unchanged to `channels-s1-corrected-acceptance.test.ts` only within this disposable checkout to satisfy the Node config's include pattern.

## Targeted assessment

`slopeParts` now carries numerator and denominator separately until the channel span and duration are applied. The scaled ratio path receives finite factors without an early `dy/dx`, reciprocal-duration, or full-span overflow. The ordinary expression is retained where applicable, with the scaled calculation recovering nonfinite intermediates before deciding whether the final result actually requires saturation. Runtime constraints reflect actual clamping rather than the mere use of the recovery path.

The exact N4 case now returns `{value:0, velocity:1.0000000000000031e307}`, matching the independently ordered finite reference exactly. It remains unconstrained, and the subsequent retarget succeeds. The earlier N1 case still returns `(MAX/1000)*2` exactly. Thus the correction resolves the failed finite-factor assumption without restoring premature slope saturation.

The retained tests also confirm exact singular classification, steep finite derivatives, bounded channels, unchanged named-alias correspondence, ordinary derivative accuracy, continuation/history behavior, and propagation of actual overflow constraints. Saturated Hermite display samples report zero velocity. The additional Hermite change was inspected: when a range gap is exactly zero, its velocity bound is zero before evaluating a potentially overflowing reciprocal of subnormal duration. The author's focused regression covers both signs of that zero-gap case; ordinary Hermite checks remain green.

## Executed evidence

From `/private/tmp/fluid-overlays-s1-numeric-review3/packages/core`:

```sh
npx vitest run --config vitest.node.config.ts \
  tests/fluid-motion/channels.test.ts \
  tests/fluid-motion/channels-retention.test.ts \
  tests/fluid-motion/channels-s1-review.test.ts \
  tests/fluid-motion/channels-s1-corrected-acceptance.test.ts \
  tests/fluid-motion/channels-s1-numeric-followup.test.ts \
  tests/fluid-motion/channels-s1-numeric2-probe.test.ts
```

**58/58 passed:** existing 30, author 21, and all seven retained independent cases/positive controls. This includes the author's representative tiny-x/large-y combinations, finite-state sweep with continuation, and all independently reproduced failures from the earlier numeric rounds. The sweep is representative evidence, not an exhaustive proof over every floating-point input.

Full output and independent hash verification are retained in `s1-astra-evidence/numeric-correction3/focused-tests.log` and `identity.json`. The exact independent probe sources remain in the earlier `s1-astra-evidence/`, `numeric-correction/` and `numeric-correction2/` directories without revision.

## Qualifications and integration boundary

True singular curves retain the documented finite-difference approximation near the tangent and report constrained tracks. Results beyond the representable range saturate observably; an underflowing true velocity can become zero under IEEE arithmetic. The standalone `sampleEasing` evidence helper saturates an unrepresentable bare progress slope, while channel velocities preserve factors until their complete result is evaluated. Near-singular inversion remains limited by double-precision input conditioning. These qualifications do not authorize arbitrary finite-slope caps or restrictive y-control limits.

Performance was not profiled, and no new performance claim is made. Earlier browser geometry/CSS evidence is retained where unchanged; the lead should cover final integration with the separately reviewed transform corrections. Any material change to these approved numeric hashes requires a targeted delta review rather than treating this approval as covering moving live files.

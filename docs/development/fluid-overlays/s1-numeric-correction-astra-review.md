# S1 numeric correction 1 — targeted independent review

**Disposition: changes requested.** The exact original R4 and R5 reproductions pass, but three closely related defects remain in the correction. This review retains the prior unchanged S1 evidence; it does not revisit the outstanding core91 transform work or approve the full integrated feature.

Reviewer: the existing independent Astra review context, actual `gpt-6-astra` / `high` settings reaffirmed by the lead for this follow-up. No product edits. Review used canonical policy v2.10 and the retained S1 contract. Approximately 21:21–21:30 UTC on 2026-09-27, within the 1200-second deadline.

## Candidate identity and isolation

The immutable input is `s1-numeric-correction-snapshot/`, manifest SHA-256 `70972cbd24c3cd020fd3641bc67d9fbbbcb1cf9b4daae204fac30d5ab08f63b2`.

| File | SHA-256 |
| --- | --- |
| `channels.ts` | `38cf6c6ba232bf6ccf12551ce94071d3362d28691949e2d48df9e13a865e97d7` |
| `hermite.ts` | `ab656a2b75197d76b0ddf63be55a09b0e19760bb50d6f4adaa692ea87e84ba1b` |
| `channel-types.ts` | `6ad7096d83c50865d015246189097f5b22ed166aca448479ca8c09c20fe7f84a` (unchanged) |
| `s1-easing.test.ts` | `157e3edfc83bd82aee35344b870cd8665483b2efc2de51da91f887e2e7f13148` |

A distinct executable copy was created at `/private/tmp/fluid-overlays-s1-numeric-review` from the original isolated S1 checkout, with only these four snapshot files overlaid. Every overlay hash was checked before testing and again afterward. The original isolated checkout, original snapshots and live product files were not changed. Source references below are line numbers in this **numeric correction snapshot**.

## Confirmed improvements

- Original R4: the `[0.5,1e308,0.5,0]`, 0→100px tween retargeted at 250ms now yields finite continuation velocities. At 400ms the value is `8.988465674311579e307`, velocity `-8.988465674311578e305`, and the owning track is constrained.
- Original R5: `[1e-8,1,0.5,1]` at zero now returns slope `99999999.99999999`, `singular:false`.
- The 30 unchanged channel/retention tests and the author's 14 numerical tests pass. Ordinary Hermite values retain the existing formula; an additional independent finite-difference check confirms ordinary velocity accuracy.
- Runtime Hermite overflow constraints propagate through the retargeted `ChannelTrack` getter. The remaining saturation finding below concerns the returned velocity, not loss of the constraint flag.

## Remaining findings

### N1 — P2: derivative saturation happens before a finite channel velocity can be recovered

`channels.ts:166` clamps the normalized easing derivative to `Number.MAX_VALUE`. The channel then multiplies and divides that already-clamped number at `381–384`. Its overflow path is never reached if that incorrect velocity is finite, so the owning track also reports `constrained:false`.

Reproduction:

```ts
const track = channelTracks.tween('x', {
  from: 0, to: 1, startMs: 0, durationMs: 1000,
  easing: { cubicBezier: [0.5, Number.MAX_VALUE, 0.5, 0] }
});
track.sample(0);
```

The correct channel velocity is the representable finite number `(Number.MAX_VALUE / 1000) * 2`, approximately `3.595386269724631e305`. Actual velocity is exactly half that, approximately `1.7976931348623156e305`. The track is not constrained. This is not an unavoidable limitation of a velocity beyond the double range: only the *intermediate normalized slope* exceeds that range. Preserve scaled arithmetic until the channel span and duration have been applied; if a final representable-domain clamp is necessary, expose it on the owning track.

### N2 — P2: the new rounding tolerance still classifies a nonsingular curve as singular

`channels.ts:125–126` changes the threshold but keeps the original failure mode for positive minima inside its rounding tolerance. `sampleEasing({cubicBezier:[1,0,1e-16,1]},0.5)` returns `singular:true` and finite-difference slope `93.9940787421194`.

This input has a mathematically positive interior derivative. For `x1=1`, `x2=b>0`, its x derivative can be written as `3(1-b)(1-2t)^2 + 3b(1-t)^2`, which is positive throughout the interior. More generally, for accepted x controls in `[0,1]`, the only interior zero is the exact corner `x1=1, x2=0` at `t=0.5`. Thus distinguishing this input from the true singular curve does not require solving a nearly canceled quadratic or accepting a new tolerance-based semantic exception.

The author identified rounding-level false positives as an unaccepted limit. It remains within R5's exact-singularity correction scope; the lead assigned it for correction. Preserve stable derivative evaluation as well as classification so that numerical cancellation does not simply recreate the fallback later.

### N3 — P2: a clamped Hermite position retains nonzero velocity while its display is flat

`hermite.ts:161` unscales/clamps value and velocity independently. When position exceeds the representable range, the returned velocity remains the derivative of the unclamped curve, rather than the displayed constant value. This contradicts the correction report's explicit saturation policy: velocity zero when value is clamped.

Reproduction:

```ts
const base = channelTracks.tween('x', {
  from: 0, to: Number.MAX_VALUE, startMs: 0, durationMs: 1,
  easing: 'linear'
});
const next = base.retarget(0, 0, 8);
```

At both 2ms and 2.5ms, position is clamped to `Number.MAX_VALUE`. Velocities are respectively `3.370674627866842e307` and `7.724462688861512e306`, while displayed position is flat. `next.constrained` correctly becomes true. Return the clamped display's zero velocity during saturation, consistently with tween clamping, so another continuation starts from the actual displayed state. This is a targeted correction to the newly added saturation path, not a new request to redesign unconstrained ordinary Hermite motion.

## Verification and retained evidence

All commands ran inside the distinct numeric-review checkout's `packages/core` directory.

1. Original 30 tests plus the retained two R4/R5 reproductions: **32/32 passed** with `vitest.node.config.ts`.
2. Frozen author `s1-easing.test.ts`: **14/14 passed** in Chromium. Vite emitted an unrelated dependency-scan warning for the copied checkout's absent built package entry; the focused test run itself exited successfully. To avoid relying on that warning-bearing runner, the same unchanged author test bytes were copied to `channels-s1-corrected-acceptance.test.ts` in the disposable checkout and rerun with the Node config.
3. Final bounded Node run: **47 passed, 3 failed, 50 total**. This includes the unchanged 30, original two repros, author 14, and four independent follow-up probes (three failures plus ordinary-derivative/runtime-constraint positive control).

Final command:

```sh
npx vitest run --config vitest.node.config.ts \
  tests/fluid-motion/channels.test.ts \
  tests/fluid-motion/channels-retention.test.ts \
  tests/fluid-motion/channels-s1-review.test.ts \
  tests/fluid-motion/channels-s1-corrected-acceptance.test.ts \
  tests/fluid-motion/channels-s1-numeric-followup.test.ts
```

Evidence is retained in `s1-astra-evidence/numeric-correction/`:

- `channels-s1-numeric-followup.test.ts`: standalone exact reproductions and positive control; copy into `packages/core/tests/fluid-motion/` to run.
- `focused-tests.log`: complete final runner output, including measured values.
- `identity.json`: independently rechecked executable hashes.

An initial local probe-file command used the wrong relative directory and ran no tests; this was corrected. An initial saturation probe used a duration that did not actually overflow, so it was corrected to eight milliseconds before classifying N3. The retained test and final log contain the corrected reproduction. No broad browser suite or live integration checks were run, as requested. The lead has assigned all three remaining findings to retained f29 for numeric correction 2; this report does not approve those future edits.

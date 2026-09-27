/**
 * Numerical diagnostics for browser motion frames: adjacent-frame velocity estimates
 * and empirical discontinuity detection.
 *
 * NOTE: These adjacent-frame calculations provide discrete consistency checks across
 * sampled rAF frames. They do not equate loose displacement bounds with continuous C1
 * mathematical derivative proof, which is verified analytically at the channel layer.
 */
import type { DiscontinuityViolation, FrameSample, VelocityEstimate } from './types.js';

export interface DiscontinuityOptions {
  /** Maximum acceptable instantaneous speed in pixels per millisecond. Default 4.0 px/ms. */
  maxSpeed?: number;
  /** Maximum acceptable single-frame position jump in pixels. Default 80 px. */
  maxJumpPx?: number;
  /** Maximum acceptable single-frame opacity change. Default 0.35. */
  maxOpacityJump?: number;
  /** Minimum time delta in ms to calculate derivative. Default 1.0 ms. */
  minDt?: number;
}

export function estimateAdjacentVelocities(
  frames: readonly FrameSample[],
  targetName: string,
  minDt = 1.0
): VelocityEstimate[] {
  const estimates: VelocityEstimate[] = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    if (!prev || !curr) continue;
    const dt = curr.time - prev.time;

    if (dt < minDt) continue;

    const elPrev = prev.elements[targetName];
    const elCurr = curr.elements[targetName];

    if (!elPrev || !elCurr || !elPrev.connected || !elCurr.connected) continue;
    if (!elPrev.rect || !elCurr.rect) continue;

    const dx = elCurr.rect.left - elPrev.rect.left;
    const dy = elCurr.rect.top - elPrev.rect.top;
    const vx = dx / dt;
    const vy = dy / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    const prevOp = elPrev.opacity ?? 1;
    const currOp = elCurr.opacity ?? 1;
    const dOpacity = (currOp - prevOp) / dt;

    estimates.push({
      time: curr.time,
      dt,
      vx,
      vy,
      speed,
      dOpacity
    });
  }

  return estimates;
}

export function detectDiscontinuities(
  frames: readonly FrameSample[],
  targetName: string,
  options: DiscontinuityOptions = {}
): DiscontinuityViolation[] {
  const maxSpeed = options.maxSpeed ?? 4.0;
  const maxJumpPx = options.maxJumpPx ?? 80;
  const maxOpacityJump = options.maxOpacityJump ?? 0.35;
  const minDt = options.minDt ?? 1.0;

  const violations: DiscontinuityViolation[] = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    if (!prev || !curr) continue;
    const dt = curr.time - prev.time;

    // Check monotonic timestamps
    if (dt < 0) {
      violations.push({
        frameIndex: curr.frameIndex,
        time: curr.time,
        dt,
        reason: `Non-monotonic timestamp: frame ${curr.frameIndex} time (${curr.time}) < previous (${prev.time})`
      });
      continue;
    }

    if (dt < minDt) continue;

    const elPrev = prev.elements[targetName];
    const elCurr = curr.elements[targetName];

    if (!elPrev || !elCurr) continue;
    if (!elPrev.connected || !elCurr.connected) continue;

    // Position discontinuity check
    if (elPrev.rect && elCurr.rect) {
      const dx = elCurr.rect.left - elPrev.rect.left;
      const dy = elCurr.rect.top - elPrev.rect.top;
      const jump = Math.sqrt(dx * dx + dy * dy);
      const speed = jump / dt;

      if (jump > maxJumpPx && speed > maxSpeed) {
        violations.push({
          frameIndex: curr.frameIndex,
          time: curr.time,
          dt,
          deltaPosition: jump,
          reason: `Position discontinuity: jumped ${jump.toFixed(1)}px in ${dt.toFixed(1)}ms (${speed.toFixed(2)} px/ms > ${maxSpeed} px/ms)`
        });
      }
    }

    // Opacity discontinuity check
    if (elPrev.opacity !== undefined && elCurr.opacity !== undefined) {
      const dOp = Math.abs(elCurr.opacity - elPrev.opacity);
      if (dOp > maxOpacityJump) {
        violations.push({
          frameIndex: curr.frameIndex,
          time: curr.time,
          dt,
          deltaOpacity: dOp,
          reason: `Opacity discontinuity: changed by ${dOp.toFixed(3)} in single frame (${dt.toFixed(1)}ms > max ${maxOpacityJump})`
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------------------------
// Removal boundary, restoration and handoff analysis (added in harness correction).
// Inputs should be rendering-checkpoint samples (see ./checkpoint.ts); animation-frame-phase
// samples miss writes made by later rAF callbacks.

export interface RemovalBoundaryAnalysis {
  /** Index into `frames` of the last sample with the source connected, before its first disconnection */
  readonly lastBefore: number | undefined;
  /** Index into `frames` of the first sample with the source disconnected after it was connected */
  readonly firstAfter: number | undefined;
  /** frameIndex values where source and representation were both paint eligible */
  readonly doublePaintFrames: readonly number[];
  /**
   * frameIndex values after the removal (from `firstAfter`) up to the first sample with the
   * representation eligible, where neither was eligible. Empty when the reveal is immediate.
   */
  readonly gapFrames: readonly number[];
  /** Whether the representation became eligible at some sample after removal */
  readonly revealedAfterRemoval: boolean;
}

export function analyzeRemovalBoundary(
  frames: readonly FrameSample[],
  sourceName: string,
  representationName: string
): RemovalBoundaryAnalysis {
  const eligible = (frame: FrameSample, name: string) => frame.elements[name]?.paintEligible === true;
  const doublePaintFrames = frames
    .filter(frame => eligible(frame, sourceName) && eligible(frame, representationName))
    .map(frame => frame.frameIndex);

  let lastBefore: number | undefined;
  let firstAfter: number | undefined;
  for (let i = 0; i < frames.length; i++) {
    const connected = frames[i]!.elements[sourceName]?.connected === true;
    if (connected) lastBefore = i;
    else if (lastBefore !== undefined) {
      firstAfter = i;
      break;
    }
  }

  const gapFrames: number[] = [];
  let revealedAfterRemoval = false;
  if (firstAfter !== undefined) {
    for (let i = firstAfter; i < frames.length; i++) {
      const frame = frames[i]!;
      if (eligible(frame, representationName)) {
        revealedAfterRemoval = true;
        break;
      }
      gapFrames.push(frame.frameIndex);
    }
  }
  return { lastBefore, firstAfter, doublePaintFrames, gapFrames, revealedAfterRemoval };
}

/**
 * Samples where a connected target's opacity rose above its previous connected sample by more
 * than `tolerance`, e.g. cancellation-restored styles painted during a fade-out.
 */
export function findOpacityIncreases(
  frames: readonly FrameSample[],
  targetName: string,
  tolerance = 1e-3
): DiscontinuityViolation[] {
  const violations: DiscontinuityViolation[] = [];
  let prev: { time: number; opacity: number } | undefined;
  for (const frame of frames) {
    const el = frame.elements[targetName];
    if (!el?.connected || el.opacity === undefined) {
      prev = undefined;
      continue;
    }
    if (prev && el.opacity - prev.opacity > tolerance) {
      violations.push({
        frameIndex: frame.frameIndex,
        time: frame.time,
        dt: frame.time - prev.time,
        deltaOpacity: el.opacity - prev.opacity,
        reason: `Opacity increased from ${prev.opacity.toFixed(3)} to ${el.opacity.toFixed(3)} during a non-increasing track`
      });
    }
    prev = { time: frame.time, opacity: el.opacity };
  }
  return violations;
}

export interface HandoffSample {
  readonly time: number;
  readonly value: number;
}

export interface HandoffEvaluation {
  readonly ok: boolean;
  readonly min: number;
  readonly max: number;
  readonly actual: number;
  /** Estimated rate per ms from the two samples before the handoff */
  readonly slope: number;
  /** Upper bound on the time between the last sample and the handoff value (ms) */
  readonly elapsed: number;
}

/**
 * Checks a handed-off scalar (opacity, x, y, ...) against a locally linear continuation of the
 * last two pre-handoff samples. The handoff happened at most `atHandoff.time - last.time` ms after
 * the last sample (frame time precedes the writer's own clock read), so the value must lie between
 * `last` and `last + slope·elapsed`, widened by `relativeSlack` of that span and `absoluteTolerance`.
 * A local, discrete check: not analytic continuity, and only meaningful for tracks that are close
 * to linear across one frame.
 */
export function evaluateHandoff(
  previous: HandoffSample,
  last: HandoffSample,
  atHandoff: HandoffSample,
  options: { absoluteTolerance: number; relativeSlack?: number }
): HandoffEvaluation {
  const relativeSlack = options.relativeSlack ?? 0.5;
  const dt = last.time - previous.time;
  const slope = dt > 0 ? (last.value - previous.value) / dt : 0;
  const elapsed = Math.max(0, atHandoff.time - last.time);
  const reach = slope * elapsed;
  const slack = Math.abs(reach) * relativeSlack + options.absoluteTolerance;
  const min = Math.min(last.value, last.value + reach) - slack;
  const max = Math.max(last.value, last.value + reach) + slack;
  return { ok: atHandoff.value >= min && atHandoff.value <= max, min, max, actual: atHandoff.value, slope, elapsed };
}

// ---------------------------------------------------------------------------------------------
// Motion across a boundary (added in harness follow-up).

export interface MotionAcrossBoundary {
  /** Frame time of the boundary sample (e.g. first sample with the outgoing source removed) */
  readonly boundaryTime: number;
  /** Path length (px) and duration (ms) of connected adjacent samples within `windowMs` before the boundary */
  readonly pathBefore: number;
  readonly timeBefore: number;
  /** Same, within `windowMs` from the boundary onward */
  readonly pathAfter: number;
  readonly timeAfter: number;
  /** Mean speeds (px/ms) in those windows; 0 when a window holds no interval */
  readonly speedBefore: number;
  readonly speedAfter: number;
  /** Straight-line distance (px) from the first sample to the boundary sample */
  readonly travelledBeforeBoundary: number;
  /** Straight-line distance (px) from the boundary sample to the last sample */
  readonly remainingAfterBoundary: number;
}

/**
 * Measures a target's rect origin movement around sample index `boundary`, over windows of
 * frame time rather than frame counts, so 60 Hz and 120 Hz recordings compare. Discrete sampled
 * displacement: evidence that motion is under way across the boundary, not analytic continuity.
 */
export function analyzeMotionAcrossBoundary(
  frames: readonly FrameSample[],
  targetName: string,
  boundary: number,
  windowMs: number
): MotionAcrossBoundary | undefined {
  const at = (i: number) => {
    const el = frames[i]?.elements[targetName];
    return el?.connected && el.rect ? el.rect : undefined;
  };
  const boundaryRect = at(boundary);
  const firstIndex = frames.findIndex((_, i) => at(i) !== undefined);
  const lastIndex = frames.length - 1 - [...frames].reverse().findIndex((_, i) => at(frames.length - 1 - i) !== undefined);
  if (!boundaryRect || firstIndex < 0) return undefined;
  const boundaryTime = frames[boundary]!.time;

  let pathBefore = 0;
  let timeBefore = 0;
  let pathAfter = 0;
  let timeAfter = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = at(i - 1);
    const b = at(i);
    if (!a || !b) continue;
    const t0 = frames[i - 1]!.time;
    const t1 = frames[i]!.time;
    const step = Math.hypot(b.left - a.left, b.top - a.top);
    if (t1 <= boundaryTime && t0 >= boundaryTime - windowMs) {
      pathBefore += step;
      timeBefore += t1 - t0;
    } else if (t0 >= boundaryTime && t1 <= boundaryTime + windowMs) {
      pathAfter += step;
      timeAfter += t1 - t0;
    }
  }
  const first = at(firstIndex)!;
  const last = at(lastIndex)!;
  return {
    boundaryTime,
    pathBefore,
    timeBefore,
    pathAfter,
    timeAfter,
    speedBefore: timeBefore > 0 ? pathBefore / timeBefore : 0,
    speedAfter: timeAfter > 0 ? pathAfter / timeAfter : 0,
    travelledBeforeBoundary: Math.hypot(boundaryRect.left - first.left, boundaryRect.top - first.top),
    remainingAfterBoundary: Math.hypot(last.left - boundaryRect.left, last.top - boundaryRect.top)
  };
}

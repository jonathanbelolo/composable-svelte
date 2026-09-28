/**
 * Cubic Hermite segment implementation.
 * Contract: docs/development/fluid-motion/interfaces.md (WP5a / I7).
 * Governing feature: specs/frontend/fluid-layout-motion-design.md "Geometry tracks".
 */
import type {
  ChannelRange,
  ChannelState,
  HermiteFactory,
  HermiteRequest,
  HermiteSegment
} from './channel-types.js';

/** Smallest power of two >= max(1, magnitude): dividing and multiplying by it is exact (no rounding). */
export function powerOfTwoAbove(magnitude: number): number {
  if (!(magnitude > 1)) return 1;
  let k = 2 ** Math.ceil(Math.log2(magnitude));
  while (k < magnitude) k *= 2;
  return Number.isFinite(k) ? k : 2 ** 1023;
}
function isVelocityValid(
  v: number,
  p0: number,
  p1: number,
  durationMs: number,
  range: ChannelRange | undefined,
  allowOvershoot: boolean
): boolean {
  const delta = p1 - p0;
  if (!allowOvershoot) {
    if (delta === 0) {
      if (v !== 0) return false;
    } else {
      const mono = (v * durationMs) / delta;
      if (mono < 0 || mono > 3) return false;
    }
  }
  if (range !== undefined) {
    const V = durationMs * v;
    const denom = 3 * V - 6 * delta;
    if (denom !== 0) {
      const s = V / denom;
      if (s > 0 && s < 1) {
        const s2 = s * s;
        const s3 = s2 * s;
        const val = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * V + (-2 * s3 + 3 * s2) * p1;
        if (val < range.min || val > range.max) {
          return false;
        }
      }
    }
  }
  return true;
}

export const hermite: HermiteFactory = (request: HermiteRequest): HermiteSegment => {
  if (!request || !request.from) {
    throw new TypeError('HermiteRequest with from state is required');
  }

  const { from, to, durationMs, range, allowOvershoot = false } = request;

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError(`durationMs must be finite and > 0, received ${durationMs}`);
  }
  if (!Number.isFinite(from.value) || !Number.isFinite(from.velocity) || !Number.isFinite(to)) {
    throw new RangeError('from.value, from.velocity, and to must be finite numbers');
  }

  if (range !== undefined) {
    if (Number.isNaN(range.min) || Number.isNaN(range.max) || range.min > range.max) {
      throw new RangeError(`Invalid range [${range.min}, ${range.max}]: min must be <= max and not NaN`);
    }
    if (from.value < range.min || from.value > range.max || to < range.min || to > range.max) {
      throw new RangeError(
        `Endpoints must be within range [${range.min}, ${range.max}]: from=${from.value}, to=${to}`
      );
    }
  }

  // Every quantity below is in units of k, a power of two (exact scaling): k = 1 for ordinary magnitudes, so
  // results are bit-identical to unscaled arithmetic; for states near the double range (e.g. a continuation from a
  // clamped ±Number.MAX_VALUE display) no intermediate (p1 - p0, v0 * T, …) can overflow.
  const k = powerOfTwoAbove(Math.max(Math.abs(from.value), Math.abs(to), Math.abs(from.velocity)) / 2 ** 500);
  const scaledRange = range === undefined || k === 1 ? range : { min: range.min / k, max: range.max / k };
  const p0 = from.value / k;
  const p1 = to / k;
  const v0 = from.velocity / k;
  const T = durationMs;
  const delta = p1 - p0;

  let startVelocity = v0;
  let constrained = false;

  if (isVelocityValid(v0, p0, p1, T, scaledRange, allowOvershoot)) {
    startVelocity = v0;
    constrained = false;
  } else {
    constrained = true;
    if (!allowOvershoot) {
      if (delta === 0) {
        startVelocity = 0;
      } else if (delta > 0) {
        startVelocity = v0 <= 0 ? 0 : Math.min(v0, (3 * delta) / T);
      } else {
        startVelocity = v0 >= 0 ? 0 : Math.max(v0, (3 * delta) / T);
      }
    } else {
      if (delta === 0) {
        if (scaledRange !== undefined) {
          if (v0 > 0) {
            startVelocity = Math.min(v0, scaledRange.max === p0 ? 0 : (27 / (4 * T)) * (scaledRange.max - p0));
          } else {
            startVelocity = Math.max(v0, scaledRange.min === p0 ? 0 : (27 / (4 * T)) * (scaledRange.min - p0));
          }
        } else {
          startVelocity = v0;
          constrained = false;
        }
      } else {
        let lo = 0;
        let hi = v0;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (isVelocityValid(mid, p0, p1, T, scaledRange, true)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        startVelocity = lo;
      }
    }
  }

  // Beyond the double range a sample is clamped to ±Number.MAX_VALUE (never ±Infinity/NaN) and the segment
  // reports `constrained` from then on (observable at runtime). A clamped position reports velocity 0 (the
  // displayed trajectory is flat there); a velocity beyond the range alone is ±MAX_VALUE.
  let overflowed = false;
  const unscale = (scaled: number): number => {
    const value = scaled * k;
    if (Number.isFinite(value)) return value;
    overflowed = true;
    return value > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
  };
  const reportedStart = unscale(startVelocity);
  return {
    durationMs,
    get constrained() { return constrained || overflowed; },
    startVelocity: reportedStart,
    sample(elapsedMs: number): ChannelState {
      if (elapsedMs <= 0) {
        return { value: from.value, velocity: reportedStart };
      }
      if (elapsedMs >= T) {
        return { value: to, velocity: 0 };
      }
      const s = elapsedMs / T;
      const s2 = s * s;
      const value = p0 + s2 * (3 - 2 * s) * (p1 - p0) + elapsedMs * (1 - s) * (1 - s) * startVelocity;
      const velocity = (6 * s * (1 - s) * (p1 - p0)) / T + (1 - s) * (1 - 3 * s) * startVelocity;
      const shown = unscale(value);
      // A saturated display is flat at ±MAX_VALUE: its velocity is 0 (continuation starts at rest there).
      if (Math.abs(shown) === Number.MAX_VALUE && !Number.isFinite(value * k)) return { value: shown, velocity: 0 };
      return { value: shown, velocity: unscale(velocity) };
    }
  };
};

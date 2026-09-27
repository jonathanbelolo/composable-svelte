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

  const p0 = from.value;
  const p1 = to;
  const v0 = from.velocity;
  const T = durationMs;
  const delta = p1 - p0;

  let startVelocity = v0;
  let constrained = false;

  if (isVelocityValid(v0, p0, p1, T, range, allowOvershoot)) {
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
        if (range !== undefined) {
          if (v0 > 0) {
            startVelocity = Math.min(v0, (27 / (4 * T)) * (range.max - p0));
          } else {
            startVelocity = Math.max(v0, (27 / (4 * T)) * (range.min - p0));
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
          if (isVelocityValid(mid, p0, p1, T, range, true)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        startVelocity = lo;
      }
    }
  }

  return {
    durationMs,
    constrained,
    startVelocity,
    sample(elapsedMs: number): ChannelState {
      if (elapsedMs <= 0) {
        return { value: p0, velocity: startVelocity };
      }
      if (elapsedMs >= T) {
        return { value: p1, velocity: 0 };
      }
      const s = elapsedMs / T;
      const s2 = s * s;
      const value = p0 + s2 * (3 - 2 * s) * (p1 - p0) + elapsedMs * (1 - s) * (1 - s) * startVelocity;
      const velocity = (6 * s * (1 - s) * (p1 - p0)) / T + (1 - s) * (1 - 3 * s) * startVelocity;
      return { value, velocity };
    }
  };
};

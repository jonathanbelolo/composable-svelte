/**
 * Numeric channels and choreography tracks.
 * Contract: docs/development/fluid-motion/interfaces.md (WP5a / I7).
 * Governing feature: specs/frontend/fluid-layout-motion-design.md "Geometry tracks".
 */
import {
  CHANNEL_RANGES,
  type ChannelEasing,
  type ChannelName,
  type ChannelState,
  type CubicBezierPoints,
  type NamedChannelEasing,
  type ChannelTrack,
  type ChannelTrackFactory,
  type HermiteSegment
} from './channel-types.js';
import { hermite, powerOfTwoAbove } from './hermite.js';

const curves: Record<NamedChannelEasing, CubicBezierPoints> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
};
const named = new Set<string>(['linear', ...Object.keys(curves)]);
const cssBezier = /^\s*cubic-bezier\(\s*([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)\s*$/i;
const cssNumber = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;
/** Objects produced by normalizeEasing: re-normalizing one returns it unchanged (validation happens once). */
const normalized = new WeakSet<object>();

/**
 * Validates and normalizes an easing once: a named easing is returned unchanged; `{ cubicBezier }` and the
 * CSS `cubic-bezier(x1, y1, x2, y2)` string become a frozen `{ cubicBezier }`; control points on the diagonal
 * (x1 = y1 and x2 = y2, e.g. cubic-bezier(0, 0, 1, 1)) are exactly `linear`. Control values are finite,
 * x1/x2 lie in [0,1] (so progress is monotone in time) and y1/y2 are any finite values (overshoot).
 * Throws TypeError/RangeError.
 */
export function normalizeEasing(value: unknown, label = 'easing'): ChannelEasing {
  if (typeof value === 'string') {
    if (named.has(value)) return value as ChannelEasing;
    const match = cssBezier.exec(value);
    if (!match) throw new TypeError(`Unsupported ${label} '${value}'`);
    const parts = match.slice(1);
    if (parts.some(part => !cssNumber.test(part!))) throw new TypeError(`${label} cubic-bezier() takes four numbers`);
    return bezierEasing(parts.map(Number), label);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (normalized.has(value)) return value as ChannelEasing;
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== 'cubicBezier') throw new TypeError(`${label} object declares only cubicBezier`);
    const points = (value as { readonly cubicBezier: unknown }).cubicBezier;
    if (!Array.isArray(points) || points.length !== 4) throw new TypeError(`${label} cubicBezier is [x1, y1, x2, y2]`);
    return bezierEasing(points, label);
  }
  throw new TypeError(`Unsupported ${label}`);
}
function bezierEasing(points: readonly unknown[], label: string): ChannelEasing {
  if (points.some(point => typeof point !== 'number' || !Number.isFinite(point))) throw new RangeError(`${label} cubicBezier values are finite numbers`);
  const [x1, y1, x2, y2] = points as number[];
  if (x1! < 0 || x1! > 1 || x2! < 0 || x2! > 1) throw new RangeError(`${label} cubicBezier x1 and x2 lie within [0,1]`);
  if (x1 === y1 && x2 === y2) return 'linear';
  // -0 normalizes to 0 so equal curves compare equal.
  const result = Object.freeze({ cubicBezier: Object.freeze([x1! + 0, y1! + 0, x2! + 0, y2! + 0] as const) });
  normalized.add(result);
  return result;
}

/** Below this dx/dt the analytic dy/dx of a vertical-tangent curve is replaced by a finite difference. */
const SINGULAR_DX = 1e-6;
const DIFFERENCE_WINDOW = 1e-3;

const bez = (a: number, b: number, t: number): number =>
  3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;

const bezD = (a: number, b: number, t: number): number =>
  3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;

/**
 * dx/dt, evaluated in whichever of two algebraically equal forms has the smaller rounding bound (sum of term
 * magnitudes): the Bernstein form 3[x1 (1-t)^2 + 2(x2-x1)(1-t)t + (1-x2)t^2] (exact at the ends, e.g. 3e-8 at 0
 * for x1 = 1e-8), or 3[(1-2t)^2 + (x1-1)(1-t)(1-3t) + x2 t(2-3t)], whose terms are small near the only interior zero
 * (x1 = 1, x2 = 0, t = 1/2), so cubic-bezier(1, 0, 1e-16, 1) keeps its tiny positive derivative (7.5e-17) there.
 */
function xSlope(x1: number, x2: number, t: number): number {
  const a = x1 * (1 - t) * (1 - t), b = 2 * (x2 - x1) * (1 - t) * t, c = (1 - x2) * t * t;
  const d = (1 - 2 * t) * (1 - 2 * t), e = (x1 - 1) * (1 - t) * (1 - 3 * t), f = x2 * t * (2 - 3 * t);
  return 3 * (Math.abs(a) + Math.abs(b) + Math.abs(c) <= Math.abs(d) + Math.abs(e) + Math.abs(f) ? a + b + c : d + e + f);
}
const bezD2 = (a: number, b: number, t: number): number => 6 * (1 - t) * (b - 2 * a) + 6 * t * (1 - 2 * b + a);
const bezD3 = (a: number, b: number): number => 6 * (3 * a - 3 * b + 1);

/**
 * A compiled curve: control points, progress range and whether it has a vertical tangent. y arithmetic is scaled
 * by `ys = max(1, |y1|, |y2|)` (y1s = y1 / ys, y2s = y2 / ys) so no intermediate overflows for any finite y.
 */
interface Curve {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly ys: number; readonly y1s: number; readonly y2s: number;
  /** Progress range [min, max] of y over t in [0,1] (overshoot curves leave [0,1]). */
  readonly low: number; readonly high: number;
  /**
   * Parameters t where dx/dt is exactly zero while dy/dt is not: a vertical tangent, where the true slope is
   * unbounded. Only x1 = 0 (t = 0), x2 = 1 (t = 1) and x1 = 1, x2 = 0 (t = 1/2) qualify; any positive dx/dt
   * (e.g. x1 = 1e-8, or cubic-bezier(1, 0, 1e-16, 1) at 1/2) is an ordinary finite slope.
   */
  readonly singularAt: readonly number[];
  /** A vertical tangent exists: near it the slope is a finite-difference approximation and tracks report `constrained`. */
  readonly singular: boolean;
}
/** Scaled progress y(t) / ys: a convex-weighted form with no overflowing intermediate. */
const yScaled = (c: Curve, t: number): number => 3 * t * (1 - t) * (c.y1s * (1 - t) + c.y2s * t) + (t * t * t) / c.ys;
/** Scaled dy/dt / ys = 3[y1 (1-t)(1-3t) + y2 t(2-3t) + t^2] / ys. */
const dyScaled = (c: Curve, t: number): number => 3 * (c.y1s * (1 - t) * (1 - 3 * t) + c.y2s * t * (2 - 3 * t) + (t * t) / c.ys);
function compile([x1, y1, x2, y2]: CubicBezierPoints): Curve {
  const ys = Math.max(1, Math.abs(y1), Math.abs(y2)), y1s = y1 / ys, y2s = y2 / ys;
  const base = { x1, y1, x2, y2, ys, y1s, y2s, low: 0, high: 1, singularAt: [] as number[], singular: false };
  let low = 0, high = 1;
  const visit = (t: number) => { if (t > 0 && t < 1) { const y = yScaled(base, t) * ys; low = Math.min(low, y); high = Math.max(high, y); } };
  // dy/dt ∝ A t^2 + B t + C (scaled); its roots in (0,1) are the y extremes.
  const A = 3 * (1 / ys - 3 * y2s + 3 * y1s), B = 6 * (y2s - 2 * y1s), C = 3 * y1s;
  if (Math.abs(A) < 1e-15) { if (Math.abs(B) > 1e-15) visit(-C / B); }
  else {
    const d = B * B - 4 * A * C;
    if (d >= 0) { const r = Math.sqrt(d); visit((-B + r) / (2 * A)); visit((-B - r) / (2 * A)); }
  }
  // dx/dt / 3 = x1 (1-t)^2 + 2 (x2-x1)(1-t) t + (1-x2) t^2 >= 0 on [0,1] (x1, x2 in [0,1]). It is zero exactly at
  // t = 0 when x1 = 0, at t = 1 when x2 = 1, and in (0,1) only as a double root: (x2-x1)^2 = x1 (1-x2) with x2 < x1,
  // whose sole solution in [0,1]^2 is x1 = 1, x2 = 0 (root t = 1/2). Exact tests only: no approximate root.
  const singularAt: number[] = [];
  const vertical = (t: number) => dyScaled(base, t) !== 0;
  if (x1 === 0 && vertical(0)) singularAt.push(0);
  if (x2 === 1 && vertical(1)) singularAt.push(1);
  if (x1 === 1 && x2 === 0 && vertical(0.5)) singularAt.push(0.5);
  return Object.freeze({ ...base, low, high, singularAt: Object.freeze(singularAt), singular: singularAt.length > 0 });
}
const namedCurves = new Map(Object.entries(curves).map(([name, points]) => [name, compile(points)]));
const compiled = new WeakMap<object, Curve>();
/** Compiles an easing once (named curves are precompiled; explicit curves are validated and cached). */
function curveOf(easing: ChannelEasing): Curve | undefined {
  if (typeof easing === 'string') {
    if (easing === 'linear') return undefined;
    const curve = namedCurves.get(easing);
    if (!curve) throw new TypeError(`Unsupported easing '${String(easing)}'`);
    return curve;
  }
  const value = normalizeEasing(easing);
  if (typeof value === 'string') return curveOf(value);
  let curve = compiled.get(value);
  if (!curve) { curve = compile(value.cubicBezier); compiled.set(value, curve); }
  return curve;
}

/** Parameter distance from a vertical tangent within which an unreliable dx/dt (<= SINGULAR_DX) is replaced. */
const SINGULAR_BAND = 1e-2;
/** Clamp to the representable domain: a slope beyond ±Number.MAX_VALUE is reported as ±MAX_VALUE, never ±Infinity. */
const representable = (value: number): number => value > Number.MAX_VALUE ? Number.MAX_VALUE : value < -Number.MAX_VALUE ? -Number.MAX_VALUE : value;

/**
 * d(progress)/du at parameter t (u = x(t)) as an unevaluated ratio [numerator, denominator] in units of the curve's y
 * scale `ys`: slope = numerator / denominator × ys. Nothing is divided here, so a tiny dx/dt (e.g. x1 = 1e-310) or a
 * huge ys cannot overflow an intermediate; callers evaluate the whole expression with `scaledRatio`. Finite
 * analytic slopes are exact, never capped. The denominator is always positive or nonzero-finite.
 * - dx/dt and dy/dt both vanish (degenerate endpoints such as `ease-out` at 0): the exact limit by L'Hopital
 *   over the first non-vanishing x derivative, so named curves keep their endpoint slopes.
 * - Near an actual vertical tangent (`singularAt`), where dx/dt <= 1e-6 and |t - t*| <= 1e-2: a central finite
 *   difference of progress over ±1e-3 in u (one-sided at the ends). This approximates an unbounded derivative,
 *   which the track reports as `constrained`.
 */
function slopeParts(c: Curve, t: number, u: number): readonly [number, number] {
  const dx = xSlope(c.x1, c.x2, t);
  const dy = dyScaled(c, t);
  const nearTangent = c.singular && dx <= SINGULAR_DX && c.singularAt.some(at => Math.abs(t - at) <= SINGULAR_BAND);
  if (dx > 0 && !nearTangent) return [dy, dx];
  if (!nearTangent && Math.abs(dy) <= 1e-9 / c.ys) {
    // Unscaled second/third y derivatives divided by ys (bezD2/bezD3 are linear in y1, y2 and the constant term).
    const y2nd = 6 * (1 - t) * (c.y2s - 2 * c.y1s) + 6 * t * (1 / c.ys - 2 * c.y2s + c.y1s);
    const y3rd = 6 * (3 * c.y1s - 3 * c.y2s + 1 / c.ys);
    const x2nd = bezD2(c.x1, c.x2, t);
    if (Math.abs(x2nd) > 1e-9) return [y2nd, x2nd];
    const x3rd = bezD3(c.x1, c.x2);
    if (Math.abs(y2nd) <= 1e-9 / c.ys && Math.abs(x3rd) > 1e-9) return [y3rd, x3rd];
  }
  const lo = Math.max(0, u - DIFFERENCE_WINDOW), hi = Math.min(1, u + DIFFERENCE_WINDOW);
  return [yScaled(c, solveT(c.x1, c.x2, hi)) - yScaled(c, solveT(c.x1, c.x2, lo)), hi - lo];
}
/** Splits a finite nonzero number into m * 2^e with 0.5 <= |m| < 1 (exact: only powers of two are applied). */
function split(value: number): [number, number] {
  let e = Math.ceil(Math.log2(Math.abs(value)));
  const half = Math.trunc(e / 2);
  let m = value / 2 ** half / 2 ** (e - half);
  while (Math.abs(m) >= 1) { m /= 2; e++; }
  while (Math.abs(m) < 0.5) { m *= 2; e--; }
  return [m, e];
}
/**
 * Π numerators / Π denominators for finite factors (denominators nonzero), evaluated as mantissas in [0.5, 1) and
 * an exact sum of power-of-two exponents, applied last in bounded steps. No intermediate overflows or underflows, so
 * the result is ±Infinity only when the true value exceeds the double range (and 0 only when it underflows); never
 * NaN for finite inputs.
 */
export function scaledRatio(numerators: readonly number[], denominators: readonly number[] = []): number {
  let mantissa = 1, exponent = 0;
  for (const factor of numerators) {
    if (factor === 0) return 0;
    const [m, e] = split(factor);
    mantissa *= m; exponent += e;
    const [mm, me] = split(mantissa); mantissa = mm; exponent += me;
  }
  for (const factor of denominators) {
    if (factor === 0) return mantissa > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const [m, e] = split(factor);
    mantissa /= m; exponent -= e;
    const [mm, me] = split(mantissa); mantissa = mm; exponent += me;
  }
  while (exponent !== 0 && Number.isFinite(mantissa) && mantissa !== 0) {
    const step = Math.max(-1000, Math.min(1000, exponent));
    mantissa *= 2 ** step; exponent -= step;
  }
  return mantissa;
}

function solveT(x1: number, x2: number, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  // Relative tolerance: tiny u (a steep start such as x1 = 1e-8) is solved as accurately as u near 1.
  const tolerance = 4 * Number.EPSILON * u;
  let t = u;
  for (let i = 0; i < 12; i++) {
    const x = bez(x1, x2, t) - u;
    if (Math.abs(x) <= tolerance) return t;
    const dx = bezD(x1, x2, t);
    if (Math.abs(dx) < 1e-6) break;
    const next = t - x / dx;
    if (next < 0 || next > 1) break;
    t = next;
  }
  // x(t) is monotone for x1, x2 in [0,1]: bisection always converges; it runs to floating-point resolution.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    t = (lo + hi) / 2;
    if (t === lo || t === hi) break;
    const x = bez(x1, x2, t);
    if (Math.abs(x - u) <= tolerance) break;
    if (x < u) lo = t;
    else hi = t;
  }
  return t;
}

/**
 * Samples an easing's progress and its derivative at normalized time u in [0,1]. `approximate` marks a
 * finite-difference slope on a vertical-tangent curve. Pure; exported for numeric evidence.
 */
export function sampleEasing(easing: ChannelEasing, u: number): { readonly progress: number; readonly slope: number; readonly singular: boolean } {
  const curve = curveOf(easing);
  const clamped = Math.max(0, Math.min(1, u));
  if (!curve) return { progress: clamped, slope: 1, singular: false };
  const t = solveT(curve.x1, curve.x2, clamped);
  // The progress slope itself may exceed the double range (e.g. y1 = Number.MAX_VALUE): reported as ±MAX_VALUE here;
  // channel velocities combine the scaled slope with the span and duration exactly.
  const [num, den] = slopeParts(curve, t, clamped);
  return { progress: yScaled(curve, t) * curve.ys, slope: representable(scaledRatio([num, curve.ys], [den])), singular: curve.singular };
}

interface TrackSegment {
  /** First instant this segment's own curve covers. */
  readonly startMs: number;
  /** True for a retarget segment: history before `startMs` was discarded. */
  readonly retargeted: boolean;
  /** Set once a sample overflowed the double range (clamped to ±Number.MAX_VALUE, velocity 0). */
  readonly overflowed?: boolean;
  sample(timelineMs: number): ChannelState;
}

/**
 * Offsets a Hermite segment to the timeline. Declared at module level so the closure captures
 * only the segment and its start instant, never the track that was retargeted (bounded memory).
 * Before `atMs` it holds the start position with zero velocity (I7 revision 3).
 */
function retargetSegment(segment: HermiteSegment, atMs: number): TrackSegment {
  const startValue = segment.sample(0).value;
  return {
    startMs: atMs,
    retargeted: true,
    // A continuation that clamps to the double range at runtime makes its track constrained from then on.
    get overflowed() { return segment.constrained; },
    sample(timelineMs: number): ChannelState {
      if (timelineMs < atMs) {
        return { value: startValue, velocity: 0 };
      }
      return segment.sample(timelineMs - atMs);
    }
  };
}

function createTrack(
  channel: ChannelName,
  endMs: number,
  constrained: boolean,
  prevSegment: TrackSegment | undefined,
  currSegment: TrackSegment,
  splitMs: number | undefined
): ChannelTrack & { readonly segmentCount: number } {
  const segmentCount = prevSegment ? 2 : 1;
  // Retained coverage starts at the earliest retained segment (I7 revision 3).
  const startMs =
    prevSegment !== undefined && splitMs !== undefined
      ? Math.min(prevSegment.startMs, splitMs)
      : currSegment.startMs;
  const chained = prevSegment !== undefined || currSegment.retargeted;

  const track: ChannelTrack & { readonly segmentCount: number } = {
    channel,
    startMs,
    endMs,
    // Observable at runtime: a segment that actually overflowed makes the track constrained from then on.
    get constrained() { return constrained || !!currSegment.overflowed || !!prevSegment?.overflowed; },
    segmentCount,
    sample(timelineMs: number): ChannelState {
      if (prevSegment !== undefined && splitMs !== undefined && timelineMs < splitMs) {
        return prevSegment.sample(timelineMs);
      }
      return currSegment.sample(timelineMs);
    },
    retarget(atMs: number, to: number, durationMs: number): ChannelTrack {
      if (!Number.isFinite(atMs)) {
        throw new RangeError(`atMs must be a finite number, received ${atMs}`);
      }
      if (!Number.isFinite(to)) {
        throw new RangeError(`to must be a finite number, received ${to}`);
      }
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        throw new RangeError(`durationMs must be finite and > 0, received ${durationMs}`);
      }
      if (chained && atMs < startMs) {
        throw new RangeError(
          `atMs ${atMs} precedes the retained history of this retargeted track, which starts at ${startMs}`
        );
      }

      const displayed = this.sample(atMs);
      const range = CHANNEL_RANGES[channel];
      const allowOvershoot = channel === 'x' || channel === 'y';

      const hermiteSeg = hermite({
        from: displayed,
        to,
        durationMs,
        range,
        allowOvershoot
      });

      const activeSegment: TrackSegment =
        prevSegment !== undefined && splitMs !== undefined && atMs < splitMs
          ? prevSegment
          : currSegment;

      return createTrack(
        channel,
        atMs + durationMs,
        this.constrained || hermiteSeg.constrained,
        activeSegment,
        retargetSegment(hermiteSeg, atMs),
        atMs
      );
    }
  };

  return track;
}

export const channelTracks: ChannelTrackFactory = {
  tween(channel, input) {
    const { from, to, startMs, durationMs, easing } = input;

    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(startMs)) {
      throw new RangeError('from, to, and startMs must be finite numbers');
    }
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError('durationMs must be a finite number >= 0');
    }

    const range = CHANNEL_RANGES[channel];
    if (range !== undefined) {
      if (from < range.min || from > range.max || to < range.min || to > range.max) {
        throw new RangeError(
          `Values must be within range [${range.min}, ${range.max}] for channel '${channel}': from=${from}, to=${to}`
        );
      }
    }

    const curve = curveOf(easing);
    // Overshoot curves may leave a bounded channel's range: samples clamp into it (never an invalid size,
    // radius, inset or opacity). A clamp, or a vertical-tangent curve's approximated slope, makes the track
    // report `constrained` (velocity continuity is not claimed there).
    let clamps = false;
    if (curve && range !== undefined) {
      for (const p of [curve.low, curve.high]) {
        const value = from + (to - from) * p;
        if (value < range.min || value > range.max) clamps = true;
      }
    }
    const constrained = clamps || (curve !== undefined && curve.singular && from !== to);

    const segment: TrackSegment & { overflowed: boolean } = {
      startMs,
      retargeted: false,
      overflowed: false,
      sample(timelineMs: number): ChannelState {
        if (durationMs === 0) {
          return { value: timelineMs < startMs ? from : to, velocity: 0 };
        }
        if (timelineMs < startMs) {
          return { value: from, velocity: 0 };
        }
        if (timelineMs >= startMs + durationMs) {
          return { value: to, velocity: 0 };
        }

        const u = (timelineMs - startMs) / durationMs;
        let p = u, num = 1, den = 1, ys = 1;
        if (curve) {
          const t = solveT(curve.x1, curve.x2, u);
          p = yScaled(curve, t) * curve.ys;
          [num, den] = slopeParts(curve, t, u);
          ys = curve.ys;
        }
        let value = from + (to - from) * p;
        // ys = 1 (every curve with |y| <= 1, and linear) with a finite slope: the ordinary ((to - from) * slope) / duration.
        const slope = ys === 1 ? num / den : Number.NaN;
        let velocity = Number.isFinite(slope) ? ((to - from) * slope) / durationMs : Number.NaN;
        if (!Number.isFinite(value) || !Number.isFinite(velocity)) {
          // Re-evaluate without intermediate overflow: span in exact power-of-two units k, the slope kept as dy and dx.
          const k = powerOfTwoAbove(Math.max(Math.abs(from), Math.abs(to)));
          const f = from / k, span = to / k - f;
          if (!Number.isFinite(value)) value = (f + span * p) * k;
          if (!Number.isFinite(velocity)) velocity = scaledRatio([span, num, ys, k], [den, durationMs]);
          // Only a result truly beyond the double range is clamped, and only that is a runtime constraint. A saturated
          // display is flat at ±MAX_VALUE (velocity 0); a velocity alone beyond the range is ±MAX_VALUE.
          if (!Number.isFinite(value)) { this.overflowed = true; value = Math.sign(value) * Number.MAX_VALUE; velocity = 0; }
          else if (!Number.isFinite(velocity)) { this.overflowed = true; velocity = representable(velocity); }
        }
        if (clamps && (value < range!.min || value > range!.max)) {
          return { value: Math.min(range!.max, Math.max(range!.min, value)), velocity: 0 };
        }

        return { value, velocity };
      }
    };

    return createTrack(
      channel,
      startMs + durationMs,
      constrained,
      undefined,
      segment,
      undefined
    );
  },

  hold(channel, value, startMs = 0) {
    if (!Number.isFinite(value) || !Number.isFinite(startMs)) {
      throw new RangeError('value and startMs must be finite numbers');
    }

    const range = CHANNEL_RANGES[channel];
    if (range !== undefined) {
      if (value < range.min || value > range.max) {
        throw new RangeError(
          `Value ${value} must be within range [${range.min}, ${range.max}] for channel '${channel}'`
        );
      }
    }

    const segment: TrackSegment = {
      startMs,
      retargeted: false,
      sample(): ChannelState {
        return { value, velocity: 0 };
      }
    };

    return createTrack(
      channel,
      startMs,
      false,
      undefined,
      segment,
      undefined
    );
  }
};

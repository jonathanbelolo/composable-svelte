/**
 * Numeric channels and choreography tracks.
 * Contract: docs/development/fluid-motion/interfaces.md (WP5a / I7).
 * Governing feature: specs/frontend/fluid-layout-motion-design.md "Geometry tracks".
 */
import {
  CHANNEL_RANGES,
  type ChannelName,
  type ChannelState,
  type ChannelTrack,
  type ChannelTrackFactory,
  type HermiteSegment
} from './channel-types.js';
import { hermite } from './hermite.js';

const curves: Record<'ease' | 'ease-in' | 'ease-out' | 'ease-in-out', readonly [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
};

const bez = (a: number, b: number, t: number): number =>
  3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;

const bezD = (a: number, b: number, t: number): number =>
  3 * a * (1 - t) * (1 - t) + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t;

function bezierDerivative(c: readonly [number, number, number, number], t: number): number {
  const [x1, y1, x2, y2] = c;
  const dx = bezD(x1, x2, t);
  const dy = bezD(y1, y2, t);
  if (Math.abs(dx) > 1e-12) {
    return dy / dx;
  }
  // Limiting derivative as t -> 0
  if (t < 0.5) {
    if (x1 !== 0) return y1 / x1;
    if (x2 !== 0) return y2 / x2;
    return 1;
  }
  // Limiting derivative as t -> 1
  if (x2 !== 1) return (1 - y2) / (1 - x2);
  if (x1 !== 1) return (1 - y1) / (1 - x1);
  return 1;
}

function solveT(x1: number, x2: number, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let t = u;
  for (let i = 0; i < 8; i++) {
    const x = bez(x1, x2, t) - u;
    if (Math.abs(x) < 1e-14) return t;
    const dx = bezD(x1, x2, t);
    if (Math.abs(dx) < 1e-12) break;
    const next = t - x / dx;
    if (next < 0 || next > 1) break;
    t = next;
  }
  let lo = 0;
  let hi = 1;
  t = u;
  for (let i = 0; i < 40; i++) {
    const x = bez(x1, x2, t);
    if (Math.abs(x - u) < 1e-14) break;
    if (x < u) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

interface TrackSegment {
  /** First instant this segment's own curve covers. */
  readonly startMs: number;
  /** True for a retarget segment: history before `startMs` was discarded. */
  readonly retargeted: boolean;
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
    constrained,
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

    const curve = easing === 'linear' ? undefined : curves[easing];
    if (easing !== 'linear' && !curve) {
      throw new TypeError(`Unsupported easing '${String(easing)}'`);
    }

    const segment: TrackSegment = {
      startMs,
      retargeted: false,
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
        if (!curve) {
          return {
            value: from + (to - from) * u,
            velocity: (to - from) / durationMs
          };
        }

        const t = solveT(curve[0], curve[2], u);
        const p = bez(curve[1], curve[3], t);
        const dp = bezierDerivative(curve, t);

        return {
          value: from + (to - from) * p,
          velocity: ((to - from) * dp) / durationMs
        };
      }
    };

    return createTrack(
      channel,
      startMs + durationMs,
      false,
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

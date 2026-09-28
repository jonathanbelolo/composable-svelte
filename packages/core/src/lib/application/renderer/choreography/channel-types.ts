/**
 * I7: numeric channel vocabulary for continuous choreography tracks. Pure data, no DOM.
 * Contract: fluid-layout-motion-design.md "Geometry tracks". Internal and prospective.
 * Implementations: ./hermite.ts and ./channels.ts (see docs/development/fluid-motion/interfaces.md).
 */

/** Numeric channels. The transform is composed once at the writer from these channels. */
export type ChannelName =
  | 'x' | 'y' | 'width' | 'height'
  | 'radiusTopLeft' | 'radiusTopRight' | 'radiusBottomRight' | 'radiusBottomLeft'
  | 'clipTop' | 'clipRight' | 'clipBottom' | 'clipLeft'
  | 'opacity'
  /** Uniform scale factor relative to the element's stable scale (nonnegative). */
  | 'scale';

/** Displayed value and instantaneous velocity (units per millisecond). */
export interface ChannelState {
  readonly value: number;
  readonly velocity: number;
}

/** Inclusive bounds for a bounded property such as opacity [0,1] or a nonnegative size. */
export interface ChannelRange {
  readonly min: number;
  readonly max: number;
}

export interface HermiteRequest {
  /** Displayed state at the retarget instant. */
  readonly from: ChannelState;
  /** Endpoint value; the endpoint velocity is always zero. */
  readonly to: number;
  /** Positive finite duration in milliseconds. */
  readonly durationMs: number;
  /** Bounded channels must stay inside this range for all t. */
  readonly range?: ChannelRange | undefined;
  /** Position channels may overshoot only when declared. Default false. */
  readonly allowOvershoot?: boolean | undefined;
}

/**
 * Absolute cubic Hermite segment. `constrained` reports that incoming velocity was relaxed to
 * satisfy the range or overshoot rule; velocity continuity is not claimed in that case.
 */
export interface HermiteSegment {
  readonly durationMs: number;
  readonly constrained: boolean;
  /** Effective start velocity actually used (equals `from.velocity` unless constrained). */
  readonly startVelocity: number;
  /** Clamp-free sample for elapsed milliseconds; t<=0 yields start, t>=duration yields end with velocity 0. */
  sample(elapsedMs: number): ChannelState;
}

/**
 * One channel track on the choreography timeline.
 *
 * Retained history (I7 revision 3): a retargeted (chained) track keeps only the segment active at
 * its retarget instant and the new segment, so memory stays bounded however often it is retargeted.
 * History is guaranteed only over that retained window; older history is discarded, not guessed.
 */
export interface ChannelTrack {
  readonly channel: ChannelName;
  /**
   * Timeline-relative start in ms, relative to t=0. For a chained track this is the start of the
   * earliest retained segment, not of the discarded original history.
   */
  readonly startMs: number;
  /**
   * Samples the track. Within the retained window this reproduces the retained segments; before
   * `startMs` it holds the earliest retained start position with zero velocity.
   */
  sample(timelineMs: number): ChannelState;
  /**
   * Retarget from the displayed state at `atMs` to a new endpoint; returns a new track. `atMs` may
   * precede the current split but must lie in the retained window: on a chained track an `atMs`
   * before `startMs` throws RangeError. A fresh tween or hold has no discarded history and accepts
   * any finite `atMs`.
   */
  retarget(atMs: number, to: number, durationMs: number): ChannelTrack;
  readonly constrained: boolean;
  readonly endMs: number;
}

/** Named easings shared with motion tokens (CSS keyword curves). */
export type NamedChannelEasing = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
/** CSS cubic-bezier control points [x1, y1, x2, y2]; x1, x2 in [0,1], y1, y2 finite (may overshoot). */
export type CubicBezierPoints = readonly [number, number, number, number];
/** Normalized channel easing: `linear`, a named curve, or explicit control points. */
export type ChannelEasing = 'linear' | NamedChannelEasing | { readonly cubicBezier: CubicBezierPoints };

export type ChannelValues = Readonly<Partial<Record<ChannelName, number>>>;

/** Default ranges for bounded channels. Position and size channels are unbounded except size >= 0. */
export const CHANNEL_RANGES: Readonly<Partial<Record<ChannelName, ChannelRange>>> = Object.freeze({
  opacity: Object.freeze({ min: 0, max: 1 }),
  width: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  height: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  radiusTopLeft: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  radiusTopRight: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  radiusBottomRight: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  radiusBottomLeft: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  clipTop: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  clipRight: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  clipBottom: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  clipLeft: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
  scale: Object.freeze({ min: 0, max: Number.POSITIVE_INFINITY }),
});

/** Module signatures the choreography run imports (implemented by hermite.ts / channels.ts). */
export type HermiteFactory = (request: HermiteRequest) => HermiteSegment;
export interface ChannelTrackFactory {
  /**
   * Eased tween from `from` to `to` starting at rest, used for fresh (non-retargeted) tracks. On a bounded
   * channel an overshooting curve is clamped into the range and the track reports `constrained`.
   */
  tween(channel: ChannelName, input: { readonly from: number; readonly to: number; readonly startMs: number; readonly durationMs: number; readonly easing: ChannelEasing }): ChannelTrack;
  /** Constant track (held value). */
  hold(channel: ChannelName, value: number, startMs?: number): ChannelTrack;
}

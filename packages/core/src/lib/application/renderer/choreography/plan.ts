/**
 * I5: choreography plan data. Pure, validated and frozen; diagnostics and fallbacks are decided at
 * construction, before playback. Prospective (candidate public). A plan is visual data only: no
 * callbacks, business dispatch, history or focus authority.
 */
import type { Easing } from '../../motion/tokens.js';
import { exactKeys, milliseconds, visualCopy } from '../../motion/data.js';
import { visualDriver } from './drivers.js';
import { PLAN_ENGINE } from './engine-types.js';
import { defaultVisualConfiguration } from './engine.js';
/** Uniform radius or per-corner [topLeft, topRight, bottomRight, bottomLeft] in px. */
export type Corners = number | readonly [number, number, number, number];
/** Inset clip [top, right, bottom, left] in px on the representation. */
export type Inset = readonly [number, number, number, number];
/**
 * Shared content policy. `crossfade` (default): surface resizes, content crossfades at the destination.
 * `translate`: position only. `scale`: images/icons only (text-bearing content is rejected: no stretched
 * glyphs). `clipReveal`: the real destination is revealed by an inset clip grown from the source rect.
 * `reflow`: the copy re-wraps inside the resizing surface, bounded to small subtrees (<= 32 elements).
 */
export type ContentPolicy = 'crossfade' | 'translate' | 'scale' | 'clipReveal' | 'reflow';

export type TrackAnchor = 'timeline' | 'render';
export interface OpacityChannel { readonly from: number; readonly to: number }
/** Pre-commit poses. Destination geometry is unknown before commit; it is measured and retargeted after. */
export type Pose =
  /** Offset/resize relative to the measured source rect. */
  | { readonly relativeTo: 'source'; readonly dx?: number | undefined; readonly dy?: number | undefined; readonly dw?: number | undefined; readonly dh?: number | undefined }
  /** Fractions of the viewport (a half-page surface, for example). */
  | { readonly relativeTo: 'viewport'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export interface Waypoint { readonly atMs: number; readonly pose: Pose; readonly radius?: Corners | undefined; readonly clip?: Inset | undefined }
/**
 * Control/affordance paint before commit. `holdThenFade` is the documented default. Custom reduction
 * policies must be listed in QUALIFIED_PAINT_POLICIES (browser-measured); none is qualified yet, so any
 * custom policy falls back to hold-then-fade with a construction diagnostic.
 */
export type PaintPolicy = { readonly kind: 'holdThenFade' } | { readonly kind: 'minOpacity'; readonly min: number };
export const QUALIFIED_PAINT_POLICIES: ReadonlySet<PaintPolicy['kind']> = new Set(['holdThenFade']);

export interface ChoreographyTrack {
  readonly participant: string;
  readonly side: 'outgoing' | 'incoming' | 'shared';
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing?: Easing | undefined;
  readonly anchor?: TrackAnchor | undefined;
  readonly opacity?: OpacityChannel | undefined;
  /** Legacy S1 shorthand for one source-relative waypoint at the track end. */
  readonly via?: { readonly dx?: number | undefined; readonly dy?: number | undefined } | undefined;
  /** Shared only: ordered intermediate poses before the measured destination endpoint. */
  readonly path?: readonly Waypoint[] | undefined;
  /** Shared only: uniform corner radius at the source and at the destination endpoint (px). */
  readonly radius?: { readonly from: Corners; readonly to: Corners } | undefined;
  /** Shared only: inset clip on the representation (px), animated through waypoints to `to`. */
  readonly clip?: { readonly from: Inset; readonly to: Inset } | undefined;
  readonly content?: ContentPolicy | undefined;
  /** Shared only: a managed custom visual driver defined with defineVisualDriver. */
  readonly driver?: string | undefined;
  /** Incoming only: the real element moves from this offset (px) to its layout position with the track. */
  readonly slide?: { readonly dx?: number | undefined; readonly dy?: number | undefined } | undefined;
  readonly paint?: PaintPolicy | undefined;
}
export interface ChoreographyPlan {
  readonly cueMs: number;
  readonly durationMs: number;
  readonly tracks: readonly ChoreographyTrack[];
  /**
   * Finite preparation budget (ms, 16–5000) for this plan: representation work, chunked across Host frames,
   * and readiness complete within it before t0. Default: the application's `visual` configuration, else 250.
   */
  readonly preparationBudgetMs?: number | undefined;
  /** Construction diagnostics (fallbacks chosen before playback). */
  readonly diagnostics?: readonly string[] | undefined;
}
const easings = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
function validateCorners(value: unknown, label: string): void {
  const list = typeof value === 'number' ? [value] : Array.isArray(value) && value.length === 4 ? value : undefined;
  if (!list || list.some(item => typeof item !== 'number' || !Number.isFinite(item) || item < 0)) throw new RangeError(`${label} is a nonnegative number or four corners`);
}
function validateInset(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 4 || value.some(item => typeof item !== 'number' || !Number.isFinite(item) || item < 0)) throw new RangeError(`${label} is four nonnegative insets`);
}
const finite = (value: unknown, label: string) => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${label} must be a finite number`); };
function validatePose(pose: Pose): void {
  if (!pose || typeof pose !== 'object') throw new TypeError('A waypoint declares a pose');
  if (pose.relativeTo === 'source') {
    exactKeys(pose, ['relativeTo', 'dx', 'dy', 'dw', 'dh'], 'pose');
    for (const key of ['dx', 'dy', 'dw', 'dh'] as const) if (pose[key] !== undefined) finite(pose[key], key);
  } else if (pose.relativeTo === 'viewport') {
    exactKeys(pose, ['relativeTo', 'x', 'y', 'width', 'height'], 'pose');
    for (const key of ['x', 'y', 'width', 'height'] as const) finite(pose[key], key);
    if (pose.width < 0 || pose.height < 0) throw new RangeError('Viewport pose size is nonnegative');
  } else throw new TypeError('Pose is relative to source or viewport');
}
export function defineChoreography(input: Omit<ChoreographyPlan, 'diagnostics'>): ChoreographyPlan {
  const plan = visualCopy(input) as ChoreographyPlan;
  exactKeys(plan, ['cueMs', 'durationMs', 'tracks', 'preparationBudgetMs'], 'choreography');
  if (plan.preparationBudgetMs !== undefined && (typeof plan.preparationBudgetMs !== 'number' || !Number.isFinite(plan.preparationBudgetMs) || plan.preparationBudgetMs < 16 || plan.preparationBudgetMs > 5000)) throw new RangeError('preparationBudgetMs is finite, 16–5000');
  milliseconds(plan.cueMs, 'cueMs');
  milliseconds(plan.durationMs, 'durationMs');
  if (plan.cueMs > plan.durationMs) throw new RangeError('The commit cue must lie within the declared duration');
  if (!Array.isArray(plan.tracks) || plan.tracks.length === 0) throw new TypeError('A choreography declares at least one track');
  const diagnostics: string[] = [];
  const shared = new Set<string>();
  const tracks = plan.tracks.map(track => {
    exactKeys(track, ['participant', 'side', 'startMs', 'durationMs', 'easing', 'anchor', 'opacity', 'via', 'path', 'radius', 'clip', 'content', 'paint', 'driver', 'slide'], 'track');
    if (track.slide !== undefined) {
      if (track.side !== 'incoming') throw new TypeError('Only incoming tracks declare slide');
      exactKeys(track.slide, ['dx', 'dy'], 'slide');
      for (const value of [track.slide.dx ?? 0, track.slide.dy ?? 0]) if (!Number.isFinite(value) || Math.abs(value) > 4096) throw new RangeError('slide offsets are finite pixels within ±4096');
    }
    if (typeof track.participant !== 'string' || track.participant.length === 0) throw new TypeError('Tracks name a participant key');
    if (!['outgoing', 'incoming', 'shared'].includes(track.side)) throw new TypeError('Track side must be outgoing, incoming or shared');
    milliseconds(track.startMs, 'startMs'); milliseconds(track.durationMs, 'durationMs');
    if (track.easing !== undefined && !easings.includes(track.easing)) throw new TypeError('Unsupported easing');
    if (track.anchor !== undefined && track.anchor !== 'timeline' && track.anchor !== 'render') throw new TypeError('Track anchor must be timeline or render');
    if (track.side === 'outgoing' && track.anchor === 'render') throw new TypeError('Outgoing tracks are timeline-relative');
    if (track.opacity !== undefined) {
      exactKeys(track.opacity, ['from', 'to'], 'opacity');
      for (const value of [track.opacity.from, track.opacity.to]) if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Opacity is within [0,1]');
    }
    if (track.side !== 'shared' && (track.via !== undefined || track.path !== undefined || track.radius !== undefined || track.clip !== undefined || track.content !== undefined || track.driver !== undefined)) throw new TypeError('Only shared tracks declare geometry, radius, clip, content policy or a driver');
    if (track.side === 'shared' && track.opacity !== undefined) throw new TypeError('Shared tracks animate geometry; declare content opacity on outgoing/incoming tracks');
    if (track.side === 'shared') {
      if (shared.has(track.participant)) throw new TypeError(`Duplicate shared participant ${track.participant}`);
      shared.add(track.participant);
    }
    if (track.via !== undefined) { exactKeys(track.via, ['dx', 'dy'], 'via'); for (const value of [track.via.dx ?? 0, track.via.dy ?? 0]) finite(value, 'via'); }
    let path = track.path;
    if (path !== undefined) {
      if (!Array.isArray(path)) throw new TypeError('path is an ordered list of waypoints');
      let previous = track.startMs;
      for (const waypoint of path) {
        exactKeys(waypoint, ['atMs', 'pose', 'radius', 'clip'], 'waypoint');
        if (waypoint.clip !== undefined) validateInset(waypoint.clip, 'waypoint clip');
        milliseconds(waypoint.atMs, 'atMs');
        if (waypoint.atMs < previous || waypoint.atMs > track.startMs + track.durationMs) throw new RangeError('Waypoints are ordered within their track');
        previous = waypoint.atMs;
        validatePose(waypoint.pose);
        if (waypoint.radius !== undefined) validateCorners(waypoint.radius, 'waypoint radius');
      }
    } else if (track.via !== undefined) {
      path = [{ atMs: track.startMs + track.durationMs, pose: { relativeTo: 'source', dx: track.via.dx, dy: track.via.dy } }];
    }
    if (track.radius !== undefined) { exactKeys(track.radius, ['from', 'to'], 'radius'); validateCorners(track.radius.from, 'radius.from'); validateCorners(track.radius.to, 'radius.to'); }
    if (track.clip !== undefined) { exactKeys(track.clip, ['from', 'to'], 'clip'); validateInset(track.clip.from, 'clip.from'); validateInset(track.clip.to, 'clip.to'); }
    if (track.content !== undefined && !['crossfade', 'translate', 'scale', 'clipReveal', 'reflow'].includes(track.content)) throw new TypeError('Unsupported content policy');
    let driver = track.driver;
    if (driver !== undefined && (typeof driver !== 'string' || !visualDriver(driver))) { diagnostics.push(`driverUnknown:${track.participant}:${String(driver)}->planned`); driver = undefined; }
    let paint = track.paint;
    if (paint !== undefined) {
      if (paint.kind !== 'holdThenFade' && paint.kind !== 'minOpacity') throw new TypeError('Unknown paint policy');
      if (!QUALIFIED_PAINT_POLICIES.has(paint.kind)) {
        diagnostics.push(`paintPolicyUnqualified:${track.participant}:${paint.kind}->holdThenFade`);
        paint = { kind: 'holdThenFade' };
      }
    }
    if ((track.anchor ?? (track.side === 'incoming' ? 'render' : 'timeline')) === 'timeline' && track.startMs + track.durationMs > plan.durationMs) throw new RangeError('Timeline tracks end within the declared duration');
    const { driver: _declared, ...rest } = track;
    return Object.freeze({ ...rest, ...(path ? { path: Object.freeze(path) } : {}), ...(paint ? { paint } : {}), ...(driver ? { driver } : {}) });
  });
  const result = { cueMs: plan.cueMs, durationMs: plan.durationMs, tracks: Object.freeze(tracks), ...(plan.preparationBudgetMs !== undefined ? { preparationBudgetMs: plan.preparationBudgetMs } : {}), diagnostics: Object.freeze(diagnostics) };
  // The plan carries the engine as data (non-enumerable): passing a plan is what brings motion in.
  Object.defineProperty(result, PLAN_ENGINE, { value: defaultVisualConfiguration().engine, enumerable: false });
  return Object.freeze(result);
}

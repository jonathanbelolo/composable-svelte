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
import { normalizeEasing } from './channels.js';
import type { CubicBezierPoints } from './channel-types.js';
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

/**
 * Choreography easing: a motion-token name (retained as is), explicit CSS control points, or the CSS
 * `cubic-bezier(x1, y1, x2, y2)` string. Validated and normalized once by `defineChoreography`: values are
 * finite, x1/x2 lie in [0,1], y1/y2 may overshoot; the string becomes `{ cubicBezier }`, and points on the
 * diagonal become `linear`. On a bounded channel (opacity, size, radius, inset) an overshooting curve is clamped
 * into the channel's range. A retarget continues from the displayed value and velocity, so the remaining
 * motion after a retarget is a continuation curve, not the rest of the declared bezier.
 */
export type ChoreographyEasing = Easing | { readonly cubicBezier: CubicBezierPoints } | `cubic-bezier(${string})`;
/** Uniform scale factors relative to the element's stable scale (finite, nonnegative). */
export interface ScaleChannel { readonly from: number; readonly to: number }
export type TrackAnchor = 'timeline' | 'render';
export interface OpacityChannel { readonly from: number; readonly to: number }
/** Pre-commit poses. Destination geometry is unknown before commit; it is measured and retargeted after. */
export type Pose =
  /** Offset/resize relative to the measured source rect. */
  | { readonly relativeTo: 'source'; readonly dx?: number | undefined; readonly dy?: number | undefined; readonly dw?: number | undefined; readonly dh?: number | undefined }
  /** Fractions of the viewport (a half-page surface, for example). */
  | { readonly relativeTo: 'viewport'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
/**
 * A shared-track waypoint. `easing` governs the AUTHORED segment that ends at this waypoint (from the previous
 * waypoint, or the track start); authored segments without an override use the track easing. The final segment to
 * the destination is not an authored bezier: once the destination is measured, the flight continues from its displayed
 * value and velocity with a Hermite continuation to the measured endpoint (as it also does on any later retarget), so
 * neither the track easing nor a waypoint override shapes that last segment.
 */
export interface Waypoint { readonly atMs: number; readonly pose: Pose; readonly radius?: Corners | undefined; readonly clip?: Inset | undefined; readonly easing?: ChoreographyEasing | undefined }
/**
 * Control/affordance paint before commit. `holdThenFade` is the documented default. Custom reduction
 * policies must be listed in QUALIFIED_PAINT_POLICIES (browser-measured); none is qualified yet, so any
 * custom policy falls back to hold-then-fade with a construction diagnostic.
 */
export type PaintPolicy = { readonly kind: 'holdThenFade' } | { readonly kind: 'minOpacity'; readonly min: number };
export const QUALIFIED_PAINT_POLICIES: ReadonlySet<PaintPolicy['kind']> = new Set(['holdThenFade']);

/** Stable reference to one overlay instance's participant scope (created by `useOverlayMotion`). */
export interface OverlayScopeRef { select(key: string): ScopedParticipantSelector }
/** A participant key in an explicit scope (an overlay instance). */
export interface ScopedParticipantSelector { readonly key: string; readonly scope: OverlayScopeRef }
/** A plain string is a key in the plan's default scope; a scoped selector names an overlay instance's participant. */
export type ParticipantSelector = string | ScopedParticipantSelector;
/** The key a selector names (diagnostics, representation naming). */
export function selectorKey(selector: ParticipantSelector): string { return typeof selector === 'string' ? selector : selector.key; }
/** The key of a track's participant. */
export function keyOf(track: Pick<ChoreographyTrack, 'participant'>): string { return selectorKey(track.participant); }
function selector(value: unknown, label: string): void {
  if (typeof value === 'string') { if (value.length === 0) throw new TypeError(`${label} names a nonempty participant key`); return; }
  if (typeof value !== 'object' || value === null) throw new TypeError(`${label} is a participant key or a scoped selector`);
  exactKeys(value, ['key', 'scope'], label);
  const { key, scope } = value as { key: unknown; scope: unknown };
  if (typeof key !== 'string' || key.length === 0) throw new TypeError(`${label}.key names a nonempty participant key`);
  if (typeof scope !== 'object' || scope === null || typeof (scope as { select?: unknown }).select !== 'function') throw new TypeError(`${label}.scope is an overlay scope reference (useOverlayMotion)`);
}

export interface ChoreographyTrack {
  readonly participant: ParticipantSelector;
  /** Shared only: source endpoint, resolved in the source phase (before the commit). Default: `participant`. */
  readonly from?: ParticipantSelector | undefined;
  /** Shared only: destination endpoint, resolved after the committed render. Default: `participant`. */
  readonly to?: ParticipantSelector | undefined;
  readonly side: 'outgoing' | 'incoming' | 'shared';
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing?: ChoreographyEasing | undefined;
  readonly anchor?: TrackAnchor | undefined;
  /**
   * `'overlay'` (outgoing tracks of an overlay's open plan): the track's terminal values are the page's overlay-open
   * RESTING state — held for that overlay instance epoch until its next accepted transition (which continues from
   * the displayed values), the instance's disposal, or Host destruction. Default `'transition'`: ends with its run.
   */
  readonly lifetime?: 'transition' | 'overlay' | undefined;
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
  /**
   * Incoming: the real element moves from this offset (px) to its layout position with the track.
   * Outgoing: the element (its copy after the commit) moves from its position to this offset.
   * Composed with the element's own stable `translate`.
   */
  readonly slide?: { readonly dx?: number | undefined; readonly dy?: number | undefined } | undefined;
  /**
   * Incoming/outgoing: uniform scale factors `from` → `to`, multiplied into the element's stable `scale` (a uniform
   * number; otherwise skipped with a diagnostic), about the element's own transform origin; the post-commit outgoing
   * copy continues about its painted centre. Hit boxes follow the real transform (what paints is what is hit).
   * The element's stable scale is restored at settlement, so an incoming `to` other than 1 is released then
   * (construction diagnostic `scaleReleasedAtSettle`).
   */
  readonly scale?: ScaleChannel | undefined;
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
  // Scoped selectors carry an overlay scope reference (an identity, not data): it is kept by reference while the
  // rest of the plan is deep-copied as finite visual data.
  const scopes: object[] = [];
  const detach = (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('scope' in value)) return value;
    const { key, scope } = value as { key: unknown; scope: unknown };
    if (typeof scope !== 'object' || scope === null) return value;
    scopes.push(scope);
    return { key, scope: scopes.length - 1 };
  };
  const inputTracks = (input as { tracks?: unknown }).tracks;
  const detachedTracks = Array.isArray(inputTracks) ? (inputTracks as unknown[]).map(value => {
    if (typeof value !== 'object' || value === null) return value;
    const track = value as Record<string, unknown>;
    return { ...track, participant: detach(track['participant']), ...(track['from'] !== undefined ? { from: detach(track['from']) } : {}), ...(track['to'] !== undefined ? { to: detach(track['to']) } : {}) };
  }) : inputTracks;
  const copied = visualCopy({ ...input, tracks: detachedTracks }) as unknown as { tracks: Record<string, unknown>[] };
  const attach = (value: unknown) => (typeof value === 'object' && value !== null && typeof (value as { scope?: unknown }).scope === 'number' ? Object.freeze({ key: (value as { key: unknown }).key, scope: scopes[(value as { scope: number }).scope] }) : value);
  // The copy is frozen: rebuild its tracks (frozen) with the scope references reattached.
  const plan = (scopes.length && Array.isArray(copied.tracks)
    ? Object.freeze({ ...copied, tracks: Object.freeze(copied.tracks.map(track => Object.freeze({ ...track, participant: attach(track['participant']), ...(track['from'] !== undefined ? { from: attach(track['from']) } : {}), ...(track['to'] !== undefined ? { to: attach(track['to']) } : {}) }))) })
    : copied) as unknown as ChoreographyPlan;
  exactKeys(plan, ['cueMs', 'durationMs', 'tracks', 'preparationBudgetMs'], 'choreography');
  if (plan.preparationBudgetMs !== undefined && (typeof plan.preparationBudgetMs !== 'number' || !Number.isFinite(plan.preparationBudgetMs) || plan.preparationBudgetMs < 16 || plan.preparationBudgetMs > 5000)) throw new RangeError('preparationBudgetMs is finite, 16–5000');
  milliseconds(plan.cueMs, 'cueMs');
  milliseconds(plan.durationMs, 'durationMs');
  if (plan.cueMs > plan.durationMs) throw new RangeError('The commit cue must lie within the declared duration');
  if (!Array.isArray(plan.tracks) || plan.tracks.length === 0) throw new TypeError('A choreography declares at least one track');
  const diagnostics: string[] = [];
  const shared = new Map<object | undefined, Set<string>>();
  const tracks = plan.tracks.map(track => {
    exactKeys(track, ['participant', 'from', 'to', 'side', 'startMs', 'durationMs', 'easing', 'anchor', 'opacity', 'via', 'path', 'radius', 'clip', 'content', 'paint', 'driver', 'slide', 'scale', 'lifetime'], 'track');
    if (track.lifetime !== undefined && track.lifetime !== 'transition' && track.lifetime !== 'overlay') throw new TypeError("track lifetime is 'transition' or 'overlay'");
    if (track.lifetime === 'overlay' && track.side !== 'outgoing') throw new TypeError("Only outgoing (page reaction) tracks declare lifetime 'overlay'");
    if (track.slide !== undefined) {
      if (track.side === 'shared') throw new TypeError('Only incoming and outgoing tracks declare slide');
      exactKeys(track.slide, ['dx', 'dy'], 'slide');
      for (const value of [track.slide.dx ?? 0, track.slide.dy ?? 0]) if (!Number.isFinite(value) || Math.abs(value) > 4096) throw new RangeError('slide offsets are finite pixels within ±4096');
    }
    if (track.scale !== undefined) {
      if (track.side === 'shared') throw new TypeError('Only incoming and outgoing tracks declare scale');
      exactKeys(track.scale, ['from', 'to'], 'scale');
      for (const value of [track.scale.from, track.scale.to]) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new RangeError('scale factors are finite and nonnegative');
      if (track.side === 'incoming' && track.scale.to !== 1) diagnostics.push(`scaleReleasedAtSettle:${keyOf(track)}:${track.scale.to}->1`);
    }
    if (typeof track.participant === 'string' && track.participant.length === 0) throw new TypeError('Tracks name a participant key');
    selector(track.participant, 'participant');
    if (track.from !== undefined || track.to !== undefined) {
      if (track.side !== 'shared') throw new TypeError('Only shared tracks declare from/to endpoints');
      if (track.from !== undefined) selector(track.from, 'from');
      if (track.to !== undefined) selector(track.to, 'to');
    }
    if (!['outgoing', 'incoming', 'shared'].includes(track.side)) throw new TypeError('Track side must be outgoing, incoming or shared');
    milliseconds(track.startMs, 'startMs'); milliseconds(track.durationMs, 'durationMs');
    const easing = track.easing === undefined ? undefined : normalizeEasing(track.easing);
    if (track.anchor !== undefined && track.anchor !== 'timeline' && track.anchor !== 'render') throw new TypeError('Track anchor must be timeline or render');
    if (track.side === 'outgoing' && track.anchor === 'render') throw new TypeError('Outgoing tracks are timeline-relative');
    if (track.opacity !== undefined) {
      exactKeys(track.opacity, ['from', 'to'], 'opacity');
      for (const value of [track.opacity.from, track.opacity.to]) if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Opacity is within [0,1]');
    }
    if (track.side !== 'shared' && (track.via !== undefined || track.path !== undefined || track.radius !== undefined || track.clip !== undefined || track.content !== undefined || track.driver !== undefined)) throw new TypeError('Only shared tracks declare geometry, radius, clip, content policy or a driver');
    if (track.side === 'shared' && track.opacity !== undefined) throw new TypeError('Shared tracks animate geometry; declare content opacity on outgoing/incoming tracks');
    if (track.side === 'shared') {
      // Identity is (scope, key): the same key in the page and in an overlay instance are different participants.
      const scope = typeof track.participant === 'string' ? undefined : track.participant.scope;
      const keys = shared.get(scope) ?? new Set<string>();
      if (keys.has(keyOf(track))) throw new TypeError(`Duplicate shared participant ${keyOf(track)}`);
      keys.add(keyOf(track)); shared.set(scope, keys);
    }
    if (track.via !== undefined) { exactKeys(track.via, ['dx', 'dy'], 'via'); for (const value of [track.via.dx ?? 0, track.via.dy ?? 0]) finite(value, 'via'); }
    let path = track.path;
    if (path !== undefined) {
      if (!Array.isArray(path)) throw new TypeError('path is an ordered list of waypoints');
      let previous = track.startMs;
      for (const waypoint of path) {
        exactKeys(waypoint, ['atMs', 'pose', 'radius', 'clip', 'easing'], 'waypoint');
        if (waypoint.clip !== undefined) validateInset(waypoint.clip, 'waypoint clip');
        milliseconds(waypoint.atMs, 'atMs');
        if (waypoint.atMs < previous || waypoint.atMs > track.startMs + track.durationMs) throw new RangeError('Waypoints are ordered within their track');
        previous = waypoint.atMs;
        validatePose(waypoint.pose);
        if (waypoint.radius !== undefined) validateCorners(waypoint.radius, 'waypoint radius');
      }
      path = path.map(waypoint => waypoint.easing === undefined ? waypoint : { ...waypoint, easing: normalizeEasing(waypoint.easing, 'waypoint easing') });
    } else if (track.via !== undefined) {
      path = [{ atMs: track.startMs + track.durationMs, pose: { relativeTo: 'source', dx: track.via.dx, dy: track.via.dy } }];
    }
    if (track.radius !== undefined) { exactKeys(track.radius, ['from', 'to'], 'radius'); validateCorners(track.radius.from, 'radius.from'); validateCorners(track.radius.to, 'radius.to'); }
    if (track.clip !== undefined) { exactKeys(track.clip, ['from', 'to'], 'clip'); validateInset(track.clip.from, 'clip.from'); validateInset(track.clip.to, 'clip.to'); }
    if (track.content !== undefined && !['crossfade', 'translate', 'scale', 'clipReveal', 'reflow'].includes(track.content)) throw new TypeError('Unsupported content policy');
    let driver = track.driver;
    if (driver !== undefined && (typeof driver !== 'string' || !visualDriver(driver))) { diagnostics.push(`driverUnknown:${keyOf(track)}:${String(driver)}->planned`); driver = undefined; }
    let paint = track.paint;
    if (paint !== undefined) {
      if (paint.kind !== 'holdThenFade' && paint.kind !== 'minOpacity') throw new TypeError('Unknown paint policy');
      if (!QUALIFIED_PAINT_POLICIES.has(paint.kind)) {
        diagnostics.push(`paintPolicyUnqualified:${keyOf(track)}:${paint.kind}->holdThenFade`);
        paint = { kind: 'holdThenFade' };
      }
    }
    if ((track.anchor ?? (track.side === 'incoming' ? 'render' : 'timeline')) === 'timeline' && track.startMs + track.durationMs > plan.durationMs) throw new RangeError('Timeline tracks end within the declared duration');
    const { driver: _declared, ...rest } = track;
    return Object.freeze({ ...rest, ...(easing !== undefined ? { easing } : {}), ...(path ? { path: Object.freeze(path) } : {}), ...(paint ? { paint } : {}), ...(driver ? { driver } : {}) });
  });
  const result = { cueMs: plan.cueMs, durationMs: plan.durationMs, tracks: Object.freeze(tracks), ...(plan.preparationBudgetMs !== undefined ? { preparationBudgetMs: plan.preparationBudgetMs } : {}), diagnostics: Object.freeze(diagnostics) };
  // The plan carries the engine as data (non-enumerable): passing a plan is what brings motion in.
  Object.defineProperty(result, PLAN_ENGINE, { value: defaultVisualConfiguration().engine, enumerable: false });
  return Object.freeze(result);
}

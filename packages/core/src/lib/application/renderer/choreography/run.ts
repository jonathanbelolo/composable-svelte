/**
 * One choreography run (WP5b/WP6). Owns its representations in the Host plane and its typed leases on
 * participants. Preparation and every DOM read/write happen in Host frame checkpoints (batched reads,
 * then writes); nothing runs inside the root FIFO. t=0 is the frame in which preparation completes.
 * Contract: fluid-layout-motion-design.md "Svelte realization" through "Plane and scrolling".
 */
import type { TransactionId, TransactionOutcome, VisualTerminalReason } from '../../../routing/staged/types.js';
import type { ChannelEasing, ChannelName, ChannelState, ChannelTrack } from './channel-types.js';
import { CHANNEL_RANGES } from './channel-types.js';
import { channelTracks, normalizeEasing } from './channels.js';
import { hermite } from './hermite.js';
import { Representer, accumulatedLinear, affinePlacement, axisAligned, layoutSize, clipInset, insetCss, sampleClip, type Linear, type CaptureOutcome, type ClipSample, type PendingCapture, type RepresentationHandle } from '../representation/representer.js';
import type { VisualConfiguration, VisualDiagnostic } from '../representation/types.js';
import { NativeSnapshotSession, type NativeEntry } from '../representation/native-snapshot.js';
import { tick as flushed } from 'svelte';
import { acquireChoreographyLease, hasChoreographyLease, type ChoreographyLease } from '../target-registry.js';
import { layerOf, nativeSurfaceOf, nativeSurfaceSlot } from '../../../actions/overlayLayers.js';
import { keyOf, type ChoreographyPlan, type ChoreographyTrack, type Corners, type Inset, type ParticipantSelector, type Pose } from './plan.js';
import { overlayScopeOwner } from './overlay-scopes.js';
import { visualDriver, type VisualDriver, type VisualDriverOutput } from './drivers.js';

/** Implementation defaults (Q7); reported in visual-report.md. */
export const VISUAL_DEFAULTS = Object.freeze({
  preparationBudgetMs: 600, visualSlackMs: 250, minimumRetargetMs: 120, postRevealFadeMs: 150,
  focusSettleMs: 120, crossfadeMs: 120, returnMs: 220, staleSampleMs: 100
});

let observers = 0;
/** Diagnostic: MutationObservers owned by choreography runs and still connected. */
export function liveObservers(): number { return observers; }
/** Declarations the framework itself writes on participants; their changes are not content invalidation. */
/** Framework-written properties: paint opacity, reveal clip, and the slide/scale transform leases. */
const OWN_PROPERTIES = ['opacity', 'clip-path', 'translate', 'scale'] as const;
/**
 * Is `before → after` exactly a framework write? The framework's own opacity/clip-path values (and priority) from
 * `after` are replayed onto `before` in a scratch element of the same engine; the write is ours only if that
 * reproduces `after` exactly. The engine's own re-serialization (`left:0` → `left: 0px`, WebKit's `font` shorthand) is
 * therefore reproduced, while any other change, including value, priority or inherited-longhand changes, is not.
 */
function frameworkWrite(scratch: HTMLElement, reader: HTMLElement, before: string | null, after: string | null): boolean {
  if ((before ?? '') === (after ?? '')) return true;
  scratch.setAttribute('style', before ?? '');
  reader.setAttribute('style', after ?? '');
  for (const name of OWN_PROPERTIES) {
    const value = reader.style.getPropertyValue(name);
    if (value) scratch.style.setProperty(name, value, reader.style.getPropertyPriority(name)); else scratch.style.removeProperty(name);
  }
  return (scratch.getAttribute('style') ?? '') === (after ?? '');
}
function observe(node: HTMLElement, onChange: () => void): () => void {
  let live = true;
  let observer: MutationObserver | undefined;
  const scratch = node.ownerDocument.createElement('div'), reader = node.ownerDocument.createElement('div');
  // Style records on one element form a chain: each record's old value, then the current attribute.
  const meaningful = (records: MutationRecord[]) => {
    if (records.some(record => record.type !== 'attributes' || record.attributeName !== 'style')) return true;
    const chains = new Map<Element, (string | null)[]>();
    for (const record of records) { const target = record.target as Element; const chain = chains.get(target) ?? []; chain.push(record.oldValue); chains.set(target, chain); }
    for (const [target, chain] of chains) {
      const values = [...chain, target.getAttribute('style')];
      for (let index = 1; index < values.length; index++) if (!frameworkWrite(scratch, reader, values[index - 1]!, values[index]!)) return true;
    }
    return false;
  };
  try { observer = new MutationObserver(records => { if (meaningful(records)) onChange(); }); observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'src', 'hidden', 'style'] }); observers++; }
  catch { live = false; }
  return () => { if (!live) return; live = false; observers--; observer?.disconnect(); };
}
/** Late-layout observer for measured destinations; the initial observation of each target is ignored. */
function observeResize(onChange: () => void): { add(node: HTMLElement): void; stop(): void } {
  const seen = new WeakSet<Element>();
  let observer: ResizeObserver | undefined;
  let live = false;
  return {
    add(node) {
      if (!observer) { try { observer = new ResizeObserver(entries => { let changed = false; for (const entry of entries) { if (seen.has(entry.target)) changed = true; else seen.add(entry.target); } if (changed) onChange(); }); live = true; observers++; } catch { return; } }
      observer.observe(node);
    },
    stop() { if (!live) return; live = false; observers--; observer?.disconnect(); }
  };
}
/**
 * Content a user can operate: native controls, focusable elements and embedded interactive content. Embedded
 * browsing contexts and media with native controls (iframe, embed, object, audio/video[controls]) remain
 * pointer-operable even when `tabindex="-1"` removes them from the sequential focus order, so tab order is not
 * used as the criterion for them (a generic `[tabindex="-1"]` element is only programmatically focusable).
 */
const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable="true"],iframe,embed,object,audio[controls],video[controls]';
/** Interactive or focused content must keep its real paint (no invisible controls, no hidden focus). */
function keepsPaint(node: HTMLElement, role: 'surface' | 'control'): boolean {
  if (role === 'control') return true;
  try { return node.matches(FOCUSABLE) || !!node.querySelector(FOCUSABLE) || node.matches(':focus-visible') || !!node.querySelector(':focus-visible'); } catch { return true; }
}
export interface VisualClock {
  now(): number;
  frame(callback: () => void): unknown;
  cancelFrame(handle: unknown): void;
  timeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface Participant { readonly node: HTMLElement; readonly key: string; readonly owner: object | undefined; readonly role: 'surface' | 'control' }
export type SettleReason = VisualTerminalReason | 'superseded' | 'returned' | 'redirected' | 'hostDisposed' | 'unclaimed'; // unclaimed: a deferred preparation discarded before acceptance (acquired nothing)
export type RunDiagnostic =
  | { readonly type: 'prepared'; readonly transaction: TransactionId; readonly at: number; readonly skipped: readonly string[] }
  | { readonly type: 'cue'; readonly transaction: TransactionId; readonly t: number }
  | { readonly type: 'reveal'; readonly transaction: TransactionId; readonly participant: string; readonly t: number; readonly opacity: number; readonly rect: readonly [number, number, number, number]; readonly sampleAge: number }
  | { readonly type: 'unsupported'; readonly transaction: TransactionId; readonly participant: string; readonly reason: string }
  | { readonly type: 'staleSample'; readonly transaction: TransactionId; readonly participant: string; readonly age: number }
  | { readonly type: 'recapture'; readonly transaction: TransactionId; readonly participant: string; readonly t: number; readonly outcome: 'captured' | 'settled' }
  | { readonly type: 'focusPinned'; readonly transaction: TransactionId; readonly participant: string; readonly t: number }
  | { readonly type: 'retarget'; readonly transaction: TransactionId; readonly participant: string; readonly t: number; readonly cause: 'destination' | 'return' | 'successor' | 'replan'; readonly from: readonly [number, number, number, number]; readonly velocity: readonly [number, number, number, number]; readonly to: readonly [number, number, number, number]; readonly constrained: boolean }
  | { readonly type: 'frame'; readonly transaction: TransactionId; readonly t: number; readonly participant: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly vx: number; readonly vy: number; readonly radius?: readonly number[] | undefined; readonly clip?: readonly number[] | undefined }
  | { readonly type: 'content'; readonly transaction: TransactionId; readonly participant: string; readonly requested: string; readonly applied: string; readonly reason?: string | undefined }
  | { readonly type: 'driver'; readonly transaction: TransactionId; readonly participant: string; readonly event: 'failed' | 'noContinuation' | 'continued' | 'disposed'; readonly t: number }
  | { readonly type: 'settled'; readonly transaction: TransactionId; readonly reason: SettleReason; readonly t: number }
  | { readonly type: 'representation'; readonly transaction: TransactionId; readonly participant: string; readonly provider: string; readonly continuity: 'static' | 'live' | 'retained' | 'unrepresented'; readonly reason?: string | undefined }
  | { readonly type: 'preparation'; readonly transaction: TransactionId; readonly workMs: number; readonly slices: number; readonly cached: number; readonly projected: number; readonly elements: number; readonly outcome: 'ready' | 'overBudget'; readonly waitedMs: number; readonly readinessPending?: number | undefined };
/** Preparation work slice per Host frame (no long tasks); within-page runs prepare synchronously before their commit. */
const PREPARATION_SLICE_MS = 32;

export interface RunHost {
  readonly win: Window;
  /** Registry root identity: choreography writes share each node's PropertyAuthority with motion targets. */
  readonly root: object;
  readonly clock: VisualClock;
  plane(): HTMLElement;
  releasePlane(): void;
  find(key: string, owner: object | undefined): Participant[];
  diagnose(event: RunDiagnostic): void;
  cue(transaction: TransactionId): void;
  visualTerminal(transaction: TransactionId, reason: VisualTerminalReason): void;
  /**
   * Conflict arbitration (design §3a.5): `holder` (an earlier run) yields `node` to the caller, returning its
   * paint lease un-restored so the caller acquires as its declared successor. Undefined: nothing to yield.
   */
  arbitrate?: ((node: HTMLElement, holder: object) => ChoreographyLease | undefined) | undefined;
  /** Retire a retained resting reaction on `node` (no restoring write) and return its displayed opacity. */
  takeRetained?: ((node: HTMLElement, channel?: RestingChannelName) => { readonly displayed: number | readonly [number, number]; readonly base: number | readonly [number, number]; retire(): void } | undefined) | undefined;
}

/** Per-run options the Host supplies (overlay transitions). */
export interface RunOptions {
  /** Overlay role nodes (backdrop/content): their paint's stable value is visible (1), not a presenting-state 0. */
  readonly overlayRoles?: ReadonlySet<HTMLElement> | undefined;
  /**
   * Explicit overlay entry (C2/C5): capture sources before the commit, but acquire nothing — no lease, no write, no
   * arbitration of another run — until `accept()` (the committed transition was accepted). Unaccepted, `settle`
   * only disposes the captures: an earlier run keeps progressing untouched.
   */
  readonly deferAcquisition?: boolean | undefined;
  /**
   * Overlay runs: completed `lifetime: 'overlay'` reactions hand their leases here (the overlay-open resting state,
   * held by the Host for the instance epoch). Undefined: every track ends with its run.
   */
  readonly retain?: ((node: HTMLElement, pose: RestingPose, source?: object) => boolean) | undefined;
}
export type RestingChannelName = 'opacity' | 'translate' | 'scale';
/** One retained channel: displayed value (opacity / [dx, dy] / scale factor), its base, and the lease holding it. */
export interface RestingChannel { readonly value: number | readonly [number, number]; readonly base: number | readonly [number, number]; lease?: ChoreographyLease | undefined }
export type RestingPose = { [K in RestingChannelName]?: RestingChannel };

/** A continuous numeric sampler (tracks from channels.ts, or Hermite continuations). */
interface Sampler { sample(ms: number): ChannelState; readonly endMs: number; readonly constrained: boolean }
const GEOMETRY = ['x', 'y', 'width', 'height'] as const;
type Geometry = Record<(typeof GEOMETRY)[number], Sampler>;
const hold = (channel: ChannelName, value: number, startMs = 0): Sampler => channelTracks.hold(channel, value, startMs);
/** Continue from the displayed state (value and velocity) of `previous` at `atMs` to `to`. */
function continueFrom(channel: ChannelName, previous: Sampler, atMs: number, to: number, durationMs: number): Sampler {
  const from = previous.sample(atMs);
  const range = CHANNEL_RANGES[channel];
  const clamped = range ? Math.min(range.max, Math.max(range.min, to)) : to;
  const segment = hermite({ from, to: clamped, durationMs: Math.max(1, durationMs), ...(range ? { range } : {}), allowOvershoot: channel === 'x' || channel === 'y' });
  return {
    endMs: atMs + segment.durationMs, get constrained() { return segment.constrained || previous.constrained; },
    sample: ms => ms < atMs ? previous.sample(ms) : segment.sample(ms - atMs)
  };
}
/**
 * Piecewise planned path (eased tweens between waypoint values). A point's own `easing` governs the segment
 * that ends at it; other segments use the track easing (default ease-in-out).
 */
function piecewise(channel: ChannelName, start: number, startMs: number, points: readonly { atMs: number; value: number; easing?: ChannelEasing | undefined }[], easing: ChoreographyTrack['easing']): Sampler {
  const segments: ChannelTrack[] = [];
  let value = start, at = startMs;
  for (const point of points) {
    segments.push(channelTracks.tween(channel, { from: value, to: point.value, startMs: at, durationMs: Math.max(0, point.atMs - at), easing: point.easing ?? channelEasing(easing, 'ease-in-out') }));
    value = point.value; at = point.atMs;
  }
  if (!segments.length) return hold(channel, start, startMs);
  return {
    endMs: at, get constrained() { return segments.some(segment => segment.constrained); },
    sample: ms => { let active = segments[0]!; for (const segment of segments) if (ms >= segment.startMs) active = segment; return active.sample(ms); }
  };
}
/** A plan's easing is normalized at `defineChoreography`; the CSS string form never reaches a run. */
const channelEasing = (easing: ChoreographyTrack['easing'], fallback: ChannelEasing): ChannelEasing => easing === undefined ? fallback : normalizeEasing(easing);
const easingOf = (waypoint: { readonly easing?: ChoreographyTrack['easing'] }): ChannelEasing | undefined => waypoint.easing === undefined ? undefined : normalizeEasing(waypoint.easing);
const rectOf = (rect: DOMRectReadOnly) => [rect.x, rect.y, rect.width, rect.height] as const;
function poseRect(pose: Pose, source: readonly [number, number, number, number], win: Window): readonly [number, number, number, number] {
  if (pose.relativeTo === 'source') return [source[0] + (pose.dx ?? 0), source[1] + (pose.dy ?? 0), Math.max(0, source[2] + (pose.dw ?? 0)), Math.max(0, source[3] + (pose.dh ?? 0))];
  const width = win.innerWidth, height = win.innerHeight;
  return [pose.x * width, pose.y * height, pose.width * width, pose.height * height];
}
const focusVisible = (node: HTMLElement) => { try { return node.matches(':focus-visible') || !!node.querySelector(':focus-visible'); } catch { return false; } };
/** Hide independently animated descendants in an ancestor copy (legacy path-based placeholders; unused by projection). */
export function placeholders(sourceRoot: HTMLElement, copyWrapper: HTMLElement, descendants: readonly HTMLElement[]): void {
  const copyRoot = copyWrapper.firstElementChild as HTMLElement | null;
  if (!copyRoot) return;
  for (const descendant of descendants) {
    const path: number[] = [];
    for (let node: HTMLElement | null = descendant; node && node !== sourceRoot; node = node.parentElement) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) return;
      path.unshift(Array.prototype.indexOf.call(parent.children, node));
    }
    let target: Element | undefined = copyRoot;
    for (const index of path) target = target?.children[index];
    if (target instanceof HTMLElement) target.style.visibility = 'hidden';
  }
}

interface Representation { readonly wrapper: HTMLElement; copyRoot: HTMLElement | undefined;
  /** Lifetime of the representation's content (providers, retained renderers, replayed/tracked animations). */
  handle?: RepresentationHandle | undefined;
  /** Wrapper-relative inset imposed by the source's clipping ancestors at capture ([t,r,b,l]) and their radius. */
  sourceClip?: { readonly inset: readonly [number, number, number, number]; readonly radius: number; readonly polygon?: readonly (readonly [number, number])[] | undefined } | undefined;
  /** Content carries a rotation/skew matrix inside the moving box (no surface fitting). */
  rotated?: boolean | undefined }
/** Release a convex clip polygon toward the box [-ink, w+ink] x [-ink, h+ink] (see the write phase). */
export function releasePolygon(points: readonly (readonly [number, number])[], w: number, h: number, ink: number, progress: number): [number, number][] {
  const n = points.length, cx = points.reduce((sum, [x]) => sum + x, 0) / n, cy = points.reduce((sum, [, y]) => sum + y, 0) / n;
  const box = { l: -ink, t: -ink, r: w + ink, b: h + ink };
  const angle = (x: number, y: number) => Math.atan2(y - cy, x - cx);
  // Phantom vertices: where the rays from the centroid toward the box corners cross the polygon boundary.
  const corners: [number, number][] = [[box.l, box.t], [box.r, box.t], [box.r, box.b], [box.l, box.b]];
  const phantom = corners.map(([kx, ky]) => {
    const dx = kx - cx, dy = ky - cy;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = points[i]!, [bx, by] = points[(i + 1) % n]!;
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const u = ((ax - cx) * ey - (ay - cy) * ex) / den, v = ((ax - cx) * dy - (ay - cy) * dx) / den;
      if (u >= 0 && v >= 0 && v <= 1) return [cx + dx * u, cy + dy * u] as [number, number];
    }
    return [cx, cy] as [number, number];
  });
  const all = [...points.map(([x, y]) => [x, y] as [number, number]), ...phantom].sort((a, b) => angle(a[0], a[1]) - angle(b[0], b[1]));
  // Target: the point where the vertex's ray from the centroid meets the expanded box.
  const target = ([x, y]: readonly [number, number]): [number, number] => {
    const dx = x - cx, dy = y - cy;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [x, y];
    const sx = dx > 0 ? (box.r - cx) / dx : dx < 0 ? (box.l - cx) / dx : Infinity, sy = dy > 0 ? (box.b - cy) / dy : dy < 0 ? (box.t - cy) / dy : Infinity;
    const scale = Math.min(sx, sy);
    return [cx + dx * scale, cy + dy * scale];
  };
  return all.map(point => { const [tx, ty] = target(point); return [point[0] + (tx - point[0]) * progress, point[1] + (ty - point[1]) * progress]; });
}
/**
 * A viewport polygon in the wrapper's own (untransformed) coordinates: axis-aligned wrappers are placed at the
 * painted rect with a scale; affine wrappers are the layout box centred on the painted centre with matrix L.
 */
function localPolygon(points: readonly (readonly [number, number])[], rect: DOMRectReadOnly, linear: Linear | undefined, size: readonly [number, number] | undefined, scale: readonly [number, number] | undefined): string {
  if (!linear || axisAligned(linear) || !size) { const [sx, sy] = scale ?? [1, 1]; return `polygon(${points.map(([x, y]) => `${(x - rect.x) / sx}px ${(y - rect.y) / sy}px`).join(', ')})`; }
  const [a, b, c, d] = linear, det = a * d - b * c, cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return `polygon(${points.map(([x, y]) => { const dx = x - cx, dy = y - cy; return `${(d * dx - c * dy) / det + size[0] / 2}px ${(-b * dx + a * dy) / det + size[1] / 2}px`; }).join(', ')})`;
}
/** Release a representation and everything its content owns. */
function dropRep(rep: Representation | undefined): void {
  if (!rep) return;
  rep.handle?.dispose();
  const parent = rep.wrapper.parentElement;
  rep.wrapper.remove();
  // A decoration slot in an overlay layer or native surface leaves with its last copy.
  if (parent?.hasAttribute('data-composable-overlay-slot') && !parent.childElementCount) parent.remove();
}
/**
 * C3: a flight whose endpoint lies in an overlay layer (or an app-authored native top-layer surface) renders in that
 * layer's local slot, so it paints above that layer's backdrop and below any later layer — never hidden under the
 * backdrop in the page plane. Copies are inert DOM; `moveBefore` keeps any live content when available.
 */
/**
 * Re-home a copy into its endpoint's overlay layer slot (C3). Copies are portable across layers: projections never
 * hold a live browsing context (same-origin frames are projected, cross-origin frames are declined as sources), and the
 * media they carry — canvas underlays, decorative or detached real `<video>` players — survive a synchronous
 * re-insertion (a media element re-connected before the next stable state is not paused; a canvas keeps its bitmap).
 * `moveBefore` is used where available and is not required. The only unreachable case is a real capability absence:
 * the endpoint's slot lives in another document (a same-origin frame), or no slot can be created. The caller then
 * settles that participant faithfully (never a hidden flight left under a backdrop).
 */
function homeInLayer(rep: Representation, endpoint: Element): 'moved' | 'kept' | 'unreachable:crossDocument' | 'unreachable:noSlot' {
  const layer = layerOf(endpoint);
  const surface = layer ? undefined : nativeSurfaceOf(endpoint);
  if (!layer && !surface) return 'kept';
  if ((layer?.wrapper ?? surface!).ownerDocument !== rep.wrapper.ownerDocument) return 'unreachable:crossDocument';
  let slot: HTMLElement;
  try { slot = layer ? layer.slot('content') : nativeSurfaceSlot(surface!); } catch { return 'unreachable:noSlot'; }
  if (rep.wrapper.parentElement === slot) return 'kept';
  const previous = rep.wrapper.parentElement;
  const move = (slot as Element & { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore;
  let moved = false;
  if (typeof move === 'function' && rep.wrapper.isConnected) { try { move.call(slot, rep.wrapper, null); moved = true; } catch { /* re-insert */ } }
  if (!moved) slot.appendChild(rep.wrapper);
  // A slot the copy left (another layer's or native surface's) goes with its last copy.
  if (previous?.hasAttribute('data-composable-overlay-slot') && !previous.childElementCount) previous.remove();
  return 'moved';
}
/**
 * The plane is an isolated stacking context: a copy whose root blends (`mix-blend-mode`) with what is behind it would
 * blend with nothing there. Such a wrapper (fixed, inert, aria-hidden) is placed beside the plane in the same parent
 * instead, carrying the root's blend mode, so it blends with what really paints beneath it. Established ordering is
 * kept: an outgoing copy goes immediately before the plane (under every other copy); a shared flight goes after it
 * (above outgoing copies), after any earlier blended flight. Wrappers are removed wherever placed (`dropRep`).
 */
const blendOf = (root: HTMLElement | undefined) => { const blend = root?.style.getPropertyValue('mix-blend-mode'); return blend && blend !== 'normal' ? blend : undefined; };
function placeInPlane(plane: HTMLElement, rep: Representation, side: 'outgoing' | 'shared' = 'outgoing', beside = false): void {
  const blend = blendOf(rep.copyRoot);
  // Outgoing copies up to the last blended one are all placed beside the plane, in paint order, so an ordinary copy
  // that paints below a blended one in the source stays below it (placement is decided once: no attached copy moves).
  if (beside && !blend && plane.parentNode) {
    rep.wrapper.setAttribute('data-composable-blend', side);
    if (side === 'outgoing') { plane.before(rep.wrapper); return; }
    let anchor: Element = plane;
    while (anchor.nextElementSibling?.getAttribute('data-composable-blend') === 'shared') anchor = anchor.nextElementSibling;
    anchor.after(rep.wrapper); return;
  }
  if (!blend || !plane.parentNode) { plane.appendChild(rep.wrapper); return; }
  rep.copyRoot!.style.setProperty('mix-blend-mode', 'normal');
  rep.wrapper.style.setProperty('mix-blend-mode', blend);
  rep.wrapper.setAttribute('data-composable-blend', side);
  if (side === 'outgoing') { plane.before(rep.wrapper); return; }
  let anchor: Element = plane;
  while (anchor.nextElementSibling?.getAttribute('data-composable-blend') === 'shared') anchor = anchor.nextElementSibling;
  anchor.after(rep.wrapper);
}
const CLIP_RELEASE_INK = 64;
interface SharedItem {
  readonly track: ChoreographyTrack; readonly key: string; rep: Representation; geo: Geometry;
  corners: Sampler[] | undefined; clip: Sampler[] | undefined;
  source: HTMLElement | undefined; sourceLease: ChoreographyLease | undefined;
  destination: HTMLElement | undefined; destinationLease: ChoreographyLease | undefined; destinationControl: boolean;
  measured: boolean; repOpacity: Sampler; crossfadeAt: number | undefined;
  /** Applied content policy (after qualification). */
  content: 'crossfade' | 'translate' | 'scale' | 'clipReveal' | 'reflow';
  readonly sourceSize: readonly [number, number];
  clipLease: ChoreographyLease | undefined; revealClip: Sampler[] | undefined;
  /** Pre-commit source movement (moving foreign ancestor), folded into continuity at measurement. */
  offset: [number, number]; sourceRect: readonly [number, number, number, number]; ancestorOpacity: number;
  dirty: boolean; unobserve: (() => void) | undefined; stable: number;
  driver: VisualDriver | undefined; driverActive: boolean; lastDriver: { t: number; values: Record<(typeof GEOMETRY)[number], number> } | undefined;
  /** Real source paint currently suppressed by us; `sourcePaint` restores it (focus arrival) within a bound. */
  suppressed: boolean; sourcePaint: Sampler | undefined; nested: HTMLElement[];
  /** Real paint restoration (focus/interactivity) through whichever lease currently owns the node. */
  restoring: { readonly lease: ChoreographyLease; readonly sampler: Sampler } | undefined;
  /** Destination rect at the last measurement (per-frame position check for late layout). */
  measuredRect: readonly [number, number, number, number] | undefined;
  /** Pre-commit viewport change: re-resolve future viewport-relative waypoints next frame. */
  replan: boolean;
}
interface OutgoingItem {
  readonly track: ChoreographyTrack; readonly key: string; readonly node: HTMLElement; readonly control: boolean; readonly lease: ChoreographyLease | undefined;
  readonly stable: number; rep: Representation | undefined; rect: DOMRectReadOnly | undefined; sampleAt: number;
  revealed: boolean; opacity: Sampler; pinned: boolean; dirty: boolean; readonly observer: (() => void) | undefined;
  readonly nested: HTMLElement[];
  /** Foreign ancestor appearance (opacity product), sampled per frame; applied once on the representation. */
  ancestorOpacity: number;
  /** Accumulated 2D scale (foreign/ancestor transforms), sampled per frame; undefined = unsupported now. */
  scale: readonly [number, number] | undefined;
  /** Foreign-held paint: last sampled displayed opacity (the copy records it; its writer is never acquired). */
  displayedOpacity: number | undefined;
  /** Last sampled ancestor clip (scroll containers, clipping boxes), applied at reveal. */
  clip?: ClipSample | undefined;
  /** Accumulated 2D linear transform (rotation/skew/scale) and layout size, sampled per frame. */
  linear?: Linear | undefined; size?: readonly [number, number] | undefined;
  /** Outgoing slide/scale: the real node before reveal, then the copy (relative to `sampledMotion`). */
  motion?: TransformMotion | undefined;
  /** The motion values [dx, dy, factor] painted when `rect` was sampled (the copy's placement basis). */
  sampledMotion?: readonly [number, number, number] | undefined;
  /** R1: the ancestors' accumulated 2D linear map at sampling (local translate delta → viewport); undefined = not 2D. */
  sampledAncestors?: Linear | undefined;
  /** R2: the node's transform-origin as a fraction of its layout box at sampling (the copy scales about it). */
  sampledOrigin?: readonly [number, number] | undefined;
}
interface IncomingItem { readonly track: ChoreographyTrack; readonly node: HTMLElement; readonly lease: ChoreographyLease | undefined; readonly stable: number; readonly control: boolean;
  /** Incoming slide/scale of the real element to its stable transform (undefined when not declared, foreign or unsupported). */
  motion: TransformMotion | undefined; opacity: Sampler; readonly anchor: 'timeline' | 'render' }
/**
 * Slide and uniform scale of one real element through individual `translate`/`scale` leases, composed with the
 * element's stable values: translate = stable + [dx, dy] (px), scale = stable × factor. The CSS order is fixed by
 * the individual properties (translate, then scale about the transform origin, then any existing `transform`).
 * Samplers are offsets (px) and a factor relative to stable; `written` is the last written [dx, dy, factor].
 */
interface TransformMotion {
  translate?: { readonly lease: ChoreographyLease; readonly base: readonly [number, number]; x: Sampler; y: Sampler } | undefined;
  scale?: { readonly lease: ChoreographyLease; readonly base: number; factor: Sampler } | undefined;
  written: [number, number, number];
}
/** Shared items a successor adopts from the displayed poses of a superseded run. */
/** Outgoing-content leases a successor adopts (same node), with the displayed value at hand-off. */
export interface OutgoingAdoption {
  readonly lease: ChoreographyLease; readonly displayed: number;
  /** Active transform channels handed over with their displayed values (whole-run successor continues them). */
  readonly translate?: { readonly lease: ChoreographyLease; readonly value: readonly [number, number]; readonly base: readonly [number, number] } | undefined;
  readonly scale?: { readonly lease: ChoreographyLease; readonly value: number; readonly base: number } | undefined;
}
/** A running native snapshot session handed to a successor: entries are rebound to shared items by participant key. */
export interface NativeAdoption { readonly session: NativeSnapshotSession; readonly keys: readonly (string | undefined)[] }
/** One native snapshot entry and the representation it follows (outgoing or shared). */
interface NativeBinding { readonly entry: NativeEntry; out?: OutgoingItem | undefined; shared?: SharedItem | undefined }
/** Displayed state at hand-off (what was painted, incl. driver output and followed offset), with velocity. */
export interface Adoption {
  readonly key: string; readonly rep: Representation; readonly displayed: Record<(typeof GEOMETRY)[number], ChannelState>;
  /** For a scoped track: the owner (instance epoch) its selector resolved to. Identity is key + scope, never key alone. */
  readonly scopedOwner?: object | undefined;
  readonly sourceLease: ChoreographyLease | undefined; readonly source: HTMLElement | undefined;
  readonly corners?: readonly ChannelState[] | undefined; readonly clip?: readonly ChannelState[] | undefined;
  readonly repOpacity?: number | undefined; readonly ancestorOpacity?: number | undefined; readonly stable?: number | undefined;
  readonly suppressed?: boolean | undefined; readonly nested?: readonly HTMLElement[] | undefined;
}

/** The earlier run holding a lease (its `holder`) yields `node` directly: FIFO adoption without a Host registry. */
const yieldFrom = (holder: object, node: HTMLElement): ChoreographyLease | undefined =>
  typeof (holder as { yieldNode?: unknown }).yieldNode === 'function' ? (holder as { yieldNode(node: HTMLElement): ChoreographyLease | undefined }).yieldNode(node) : undefined;
/** Transform leases a yielding run hands to its successor for the same node (arbitration; see `yieldNode`). */
/** Displayed geometry of shared flights an earlier run yielded by arbitration (the successor continues from it). */
const yieldedShared = new WeakMap<HTMLElement, Pick<Adoption, 'displayed' | 'corners' | 'clip' | 'repOpacity'>>();
/** Displayed transform of leases handed over by a yielding run (consumed with the lease by the successor). */
const yieldedTransformPose = new WeakMap<HTMLElement, { translate?: { value: readonly [number, number]; base: readonly [number, number] }; scale?: { value: number; base: number } }>();
const yieldedTransforms = new WeakMap<HTMLElement, { translate?: ChoreographyLease | undefined; scale?: ChoreographyLease | undefined; 'clip-path'?: ChoreographyLease | undefined }>();

export class ChoreographyRun {
  private phase: 'preparing' | 'playing' | 'returning' | 'settled' = 'preparing';
  private t0 = 0;
  private frameHandle: unknown;
  private readonly timers: unknown[] = [];
  private cued = false;
  private reserved = false;
  private committed = false;
  private destinationOwner: object | undefined;
  private renderAt: number | undefined;
  private returnEnd = 0;
  private readonly shared: SharedItem[] = [];
  private readonly outgoing: OutgoingItem[] = [];
  private readonly incoming: IncomingItem[] = [];
  private readonly media: MediaQueryList | undefined;
  private readonly onMedia = () => { if (this.media?.matches) this.settle('reducedMotion'); };
  private readonly local: boolean;
  private readonly initialNodes = new Set<HTMLElement>();
  private readonly resize = observeResize(() => this.rebase());
  /** Adopted shared state owned from construction; anything not enrolled by `prepare` is cleaned at settle. */
  private readonly enrolled = new Set<Adoption>();
  private readonly representer: Representer;
  private readonly budgetMs: number;
  private pending: { readonly track: ChoreographyTrack; readonly participant: Participant; readonly nested: HTMLElement[]; capture: PendingCapture; restarts: number; dirty: boolean; readonly stop: () => void }[] = [];
  private preparation = { started: 0, slices: 0 };
  /** Opt-in native snapshots for content projection cannot reach (route runs; started at the cue). */
  private readonly nativeRequested: boolean;
  private nativeBindings: NativeBinding[] = [];
  private nativeSession: NativeSnapshotSession | undefined;
  private nativeAdopted: NativeAdoption | undefined;
  /** Successor: continue a predecessor's native session (no new transition, no restart). */
  adoptNative(adoption: NativeAdoption): void { if (adoption.session.live) { this.nativeAdopted = adoption; adoption.session.owner = this; } }
  constructor(private readonly host: RunHost, readonly transaction: TransactionId, private readonly plan: ChoreographyPlan, readonly source: object, private readonly adopted: readonly Adoption[], private readonly done: () => void, private readonly adoptedOutgoing: Map<HTMLElement, OutgoingAdoption> = new Map(), localCommit?: () => void, config?: VisualConfiguration, private readonly options: RunOptions = {}) {
    this.local = localCommit !== undefined;
    this.budgetMs = plan.preparationBudgetMs ?? config?.preparationBudgetMs ?? VISUAL_DEFAULTS.preparationBudgetMs;
    this.nativeRequested = config?.nativeSnapshot === 'namedParticipants';
    const reduced = () => { try { return host.win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
    const cache = (config?.engine as { cache?: import('../representation/cache.js').ProjectionCache } | undefined)?.cache;
    // Declared-opaque content uses the native snapshot only where this run can actually take one (route opt-in, API present).
    this.representer = new Representer({ providers: config?.providers, reducedMotion: reduced, cache, native: this.nativeRequested && !this.local && NativeSnapshotSession.available(host.win.document), diagnose: event => this.representationDiagnostic(event) });
    // The preference is observed for route and local lifetimes alike.
    try { this.media = host.win.matchMedia('(prefers-reduced-motion: reduce)'); this.media.addEventListener('change', this.onMedia); } catch { this.media = undefined; }
    // Successor authority: acquire our own leases on adopted nodes now (superseding the predecessor's
    // without any restoring write), so writes keep working after the predecessor settles.
    for (const adoption of adopted) if (adoption.sourceLease) (adoption as { sourceLease: ChoreographyLease | undefined }).sourceLease = this.succeed(adoption.sourceLease);
    for (const [node, entry] of adoptedOutgoing) {
      // Transform channels are succeeded like paint (no restoring write between the runs).
      const translate = entry.translate ? this.succeed(entry.translate.lease, 'translate') : undefined;
      const scale = entry.scale ? this.succeed(entry.scale.lease, 'scale') : undefined;
      const lease = this.succeed(entry.lease);
      if (translate || scale) this.adoptedTransforms.set(node, { translate: translate && entry.translate ? { ...entry.translate, lease: translate } : undefined, scale: scale && entry.scale ? { ...entry.scale, lease: scale } : undefined });
      if (lease) adoptedOutgoing.set(node, { lease, displayed: entry.displayed }); else adoptedOutgoing.delete(node);
    }
    if (localCommit) {
      // Within-page choreography: capture now (before the immediate business commit), then commit.
      // Decorative preparation can never prevent or swallow the explicit business commit.
      try { this.prepare(); } catch (error) { this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: '*', reason: `prepareFailed:${String(error)}` }); this.settle('failed'); }
      this.reserved = true; this.committed = true; this.cued = true; this.destinationOwner = source;
      try { localCommit(); } catch (error) { this.settle('failed'); throw error; }
      // Local post-commit render checkpoint: render-relative tracks start at the immediate commit.
      this.renderAt = host.clock.now();
      return;
    }
    this.frameHandle = host.clock.frame(() => this.prepare());
    this.timers.push(host.clock.timeout(() => { if (this.phase === 'preparing') { this.preparationReport('overBudget', 0); this.settle('timeout'); } }, this.budgetMs));
  }
  private representationDiagnostic(event: VisualDiagnostic): void {
    if (event.type === 'representation') this.host.diagnose({ ...event, transaction: this.transaction });
    else if (event.type === 'unsupported') this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: event.participant, reason: event.reason });
  }
  private preparationReport(outcome: 'ready' | 'overBudget', waitedMs: number, reads?: readonly { readonly capture: CaptureOutcome }[]): void {
    let workMs = 0, elements = 0, projected = 0, cached = 0;
    for (const read of reads ?? []) if (read.capture.kind === 'captured') { workMs += read.capture.workMs; elements += read.capture.elements; if (read.capture.cached) cached++; else projected++; }
    this.host.diagnose({ type: 'preparation', transaction: this.transaction, workMs: Math.round(workMs * 100) / 100, slices: this.preparation.slices, cached, projected, elements, outcome, waitedMs: Math.round(waitedMs), readinessPending: this.readinessPending });
  }
  /** Replace a predecessor's lease by one owned by this run's lifetime; no restoring write happens. */
  private succeed(previous: ChoreographyLease, property: 'opacity' | 'translate' | 'scale' = 'opacity'): ChoreographyLease | undefined {
    const acquired = acquireChoreographyLease(this.host.root, previous.node, property, () => this.phase !== 'settled', { holder: this, successorOf: previous });
    previous.release(); // superseded (not current): releases the predecessor's hold without writing
    return 'foreign' in acquired ? undefined : acquired;
  }
  /**
   * Paint lease for this run. A live lease of another run is a conflict (design §3a.5): the Host asks that earlier
   * run to yield this node (its representation and tracks for it end, un-restored) and this run succeeds it —
   * one writer and one representation per node, the later accepted run adopting only the conflicting node.
   */
  /** Displayed paint of nodes this run adopted from an earlier run by arbitration (continued, never reset). */
  private readonly adoptedPaint = new Map<HTMLElement, number>();
  /** The true stable paint of a node adopted from a resting reaction (its inline/computed value is the held dim). */
  private readonly restingStable = new Map<HTMLElement, number>();
  private lease(node: HTMLElement): ChoreographyLease | { readonly foreign: string } {
    // A resting overlay reaction on this node: continue from its displayed value (the Host retires the hold, no write).
    const resting = this.host.takeRetained?.(node, 'opacity');
    if (resting && Number.isFinite(resting.displayed as number)) { this.adoptedPaint.set(node, resting.displayed as number); this.restingStable.set(node, resting.base as number); this.liveReactions.add(node); } // the same live page region returning, not an entering control
    const acquired = acquireChoreographyLease(this.host.root, node, 'opacity', () => this.phase !== 'settled', { holder: this });
    resting?.retire(); // after our acquisition: the node's recorded stable value is kept
    if ('foreign' in acquired && acquired.foreign === 'choreography' && acquired.holder && acquired.holder !== this) {
      const shown = Number.parseFloat(node.style.opacity);
      if (Number.isFinite(shown)) this.adoptedPaint.set(node, Math.min(1, Math.max(0, shown)));
      const yielded = yieldFrom(acquired.holder, node) ?? this.host.arbitrate?.(node, acquired.holder);
      if (yielded) { const lease = this.succeed(yielded); if (lease) { this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: '*', reason: 'adoptedFromEarlierRun' }); return lease; } }
    }
    return acquired;
  }
  /** Selector resolution: plain keys in `fallback` (the run's scope); scoped selectors to their bound instance. */
  private resolve(selector: ParticipantSelector, fallback: object | undefined): { readonly key: string; readonly owner: object | undefined; readonly scoped: boolean; readonly unresolved?: 'unknownScope' | 'unboundScope' | undefined } {
    if (typeof selector === 'string') return { key: selector, owner: fallback, scoped: false };
    const owner = overlayScopeOwner(selector.scope);
    if (owner === null) return { key: selector.key, owner: undefined, scoped: true, unresolved: 'unknownScope' };
    if (owner === undefined) return { key: selector.key, owner: undefined, scoped: true, unresolved: 'unboundScope' };
    return { key: selector.key, owner, scoped: true };
  }
  /** Source endpoint (source phase: before the commit, against the current epoch). */
  private sourceOf(track: ChoreographyTrack) { return this.resolve(track.side === 'shared' ? track.from ?? track.participant : track.participant, this.source); }
  /** Destination endpoint (destination phase: after the committed render, against the committed epoch). */
  private destinationOf(track: ChoreographyTrack) { return this.resolve(track.side === 'shared' ? track.to ?? track.participant : track.participant, this.local ? this.source : this.destinationOwner); }
  /** Tracks whose destination was ambiguous (reported once; nothing acquired for them). */
  private readonly ambiguousDestinations = new Set<ChoreographyTrack>();
  /** Route registrations that arrived before the destination owner was known (reconciled at `rendered`). */
  private early: Participant[] = [];
  /** Replay existing registrations of incoming/shared destinations (a run started after they mounted). */
  discoverDestinations(): void {
    const entries: Participant[] = [];
    for (const track of this.plan.tracks) {
      if (track.side !== 'incoming') continue;
      const destination = this.destinationOf(track);
      if (destination.unresolved) continue;
      for (const entry of this.host.find(destination.key, destination.owner)) if (!entries.includes(entry)) entries.push(entry);
    }
    this.admitDestinations(entries);
  }
  /**
   * Destination phase for a batch of candidates: a track with more than one fresh candidate is ambiguous BEFORE any of
   * them is acquired or suppressed (nothing to roll back); the others are admitted normally.
   */
  private admitDestinations(entries: readonly Participant[]): void {
    const fresh = entries.filter(entry => entry.node.isConnected && !(this.local && this.initialNodes.has(entry.node)));
    this.decideAmbiguity(fresh);
    for (const entry of fresh) this.registered(entry, true);
  }
  /** A track whose fresh candidates (plus any destination already assigned) name more than one node is ambiguous. */
  private decideAmbiguity(entries: readonly Participant[]): void {
    for (const track of this.plan.tracks) {
      if (track.side === 'outgoing' || this.ambiguousDestinations.has(track)) continue;
      const destination = this.destinationOf(track);
      if (destination.unresolved || destination.owner === undefined) continue;
      const candidates = new Set(entries.filter(entry => entry.node.isConnected && entry.key === destination.key && entry.owner === destination.owner).map(entry => entry.node));
      for (const item of this.incoming) if (item.track === track) candidates.add(item.node);
      const shared = this.shared.find(candidate => candidate.track === track);
      if (shared?.destination && shared.destination !== shared.source) candidates.add(shared.destination);
      if (candidates.size > 1) this.ambiguous(track);
    }
  }
  /** The batch checkpoint: admit this flush's registrations together (pre-paint). */
  private flushDestinations(): void {
    const entries = this.batch.splice(0);
    if (this.phase === 'playing' && entries.length) this.admitDestinations(entries);
  }
  /** Overlay runs admit registrations of one flush together (instance scopes re-resolve in a microtask). */
  private batch: Participant[] = [];
  /** The Host reports the destination route instance mounting (before its participants register). */
  destinationMounted(owner: object): void { if (this.reserved && !this.local && owner !== this.source && this.destinationOwner === undefined) this.destinationOwner = owner; }
  /**
   * Arbitration: a later run takes `node`. Every item of this run for that node ends without restoring (its copy
   * removed); the paint lease is returned for the successor. Other properties on the node are abandoned.
   */
  yieldNode(node: HTMLElement): ChoreographyLease | undefined {
    let paint: ChoreographyLease | undefined;
    const handTransforms = (motion: TransformMotion | undefined) => {
      if (!motion) return;
      const handed = yieldedTransforms.get(node) ?? {};
      // The displayed transform travels with its lease: the successor continues from it (accepted conflicting writer).
      const pose = yieldedTransformPose.get(node) ?? {};
      if (motion.translate) { handed.translate = motion.translate.lease; pose.translate = { value: [motion.written[0], motion.written[1]], base: motion.translate.base }; motion.translate = undefined; }
      if (motion.scale) { handed.scale = motion.scale.lease; pose.scale = { value: motion.written[2], base: motion.scale.base }; motion.scale = undefined; }
      yieldedTransformPose.set(node, pose);
      yieldedTransforms.set(node, handed);
      this.handedNodes.add(node);
    };
    for (const out of [...this.outgoing]) if (out.node === node) {
      dropRep(out.rep); (out as { rep: Representation | undefined }).rep = undefined; out.observer?.(); handTransforms(out.motion);
      if (out.lease) { paint ??= out.lease; (out as { lease: ChoreographyLease | undefined }).lease = undefined; }
      this.outgoing.splice(this.outgoing.indexOf(out), 1);
    }
    for (const item of [...this.shared]) if (item.source === node || item.destination === node) {
      if (item.source === node && item.sourceLease) { paint ??= item.sourceLease; item.sourceLease = undefined; }
      if (item.destination === node && item.destinationLease) { paint ??= item.destinationLease; item.destinationLease = undefined; }
      // A reveal clip is handed over too (never abandoned): the successor continues it, or it is restored when we settle.
      if (item.destination === node && item.clipLease) { const handed = yieldedTransforms.get(node) ?? {}; handed['clip-path'] = item.clipLease; item.clipLease = undefined; yieldedTransforms.set(node, handed); this.handedNodes.add(node); }
      // The successor continues this flight from its displayed state; its driver ends here, exactly once.
      if (this.phase === 'playing') { const t = this.elapsed(); yieldedShared.set(node, this.displayedState(item, t)); this.disposeDriver(item, t); }
      // The item's OTHER endpoint is not yielded: restore it now (a suppressed source becomes visible again).
      if (item.sourceLease) { item.sourceLease.release(); item.sourceLease = undefined; }
      if (item.destinationLease) { item.destinationLease.release(); item.destinationLease = undefined; }
      if (item.clipLease) { item.clipLease.release(); item.clipLease = undefined; }
      dropRep(item.rep); item.unobserve?.();
      this.shared.splice(this.shared.indexOf(item), 1);
    }
    for (const item of [...this.incoming]) if (item.node === node) {
      handTransforms(item.motion);
      if (item.lease) { paint ??= item.lease; (item as { lease: ChoreographyLease | undefined }).lease = undefined; }
      this.incoming.splice(this.incoming.indexOf(item), 1);
    }
    // (The shared plane is not released here: the adopting run is about to place its copy in it.)
    return paint;
  }
  /**
   * Foreign ancestor appearance (opacity product) of a participant, applied once on its representation. Ancestors
   * whose opacity this run leases (enclosing participants of the same plan) count at their stable value: their
   * own track animates their own representation, and an independently animated descendant follows its own track.
   */
  private foreignAncestorOpacity(node: HTMLElement): number {
    const own = new Map<Element, number>();
    for (const out of this.outgoing) if (out.lease) own.set(out.node, out.stable);
    for (const item of this.shared) if (item.source && item.sourceLease) own.set(item.source, item.stable);
    for (const item of this.incoming) if (item.lease) own.set(item.node, item.stable);
    const win = this.host.win;
    let product = 1;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) product *= own.get(parent) ?? (Number.parseFloat(win.getComputedStyle(parent).opacity) || 0);
    return product;
  }
  /** Every representation this run currently owns (outgoing and shared). */
  private representations(): Representation[] {
    const all: Representation[] = [];
    for (const out of this.outgoing) if (out.rep) all.push(out.rep);
    for (const item of this.shared) all.push(item.rep);
    return all;
  }
  private elapsed(): number { return this.phase === 'preparing' ? 0 : this.host.clock.now() - this.t0; }
  claims(owner: object): boolean { return (this.phase === 'playing' || this.phase === 'returning') && owner === this.source; }
  // -------------------------------------------------------------------------------- preparation
  private prepare(): void {
    this.frameHandle = undefined;
    if (this.phase !== 'preparing') return;
    const doc = this.host.win.document;
    // (Adopted outgoing leases stay held until this plan decides to continue or release them.)
    // Overlays are layered (overlayLayers.ts): an open modal, popover or native top-layer surface elsewhere in the
    // document no longer refuses the run; each participant resolves its own scope and layer.
    void doc;
    const skipped: string[] = [...(this.plan.diagnostics ?? [])];
    const tracked = this.plan.tracks.filter(track => track.side !== 'incoming');
    const nodes = new Map<ChoreographyTrack, Participant>();
    for (const track of tracked) {
      if (track.side === 'shared' && this.adopted.some(item => this.adopts(item, track))) continue;
      const endpoint = this.sourceOf(track);
      if (endpoint.unresolved) { skipped.push(`${keyOf(track)}:${endpoint.unresolved}`); continue; }
      const found = this.host.find(endpoint.key, endpoint.owner);
      if (found.length !== 1) { skipped.push(`${keyOf(track)}:${found.length ? 'ambiguous' : 'missingSource'}`); continue; }
      nodes.set(track, found[0]!);
    }
    // Representation work: resumable projections, chunked across Host frames within the preparation budget
    // (within-page runs: synchronously, before their immediate commit). A source mutated mid-copy restarts.
    for (const participant of nodes.values()) this.initialNodes.add(participant.node);
    this.pending = [...nodes].map(([track, participant]) => {
      const nested = [...nodes.values()].filter(other => other !== participant && participant.node.contains(other.node)).map(other => other.node);
      const entry = { track, participant, nested, capture: this.representer.begin(participant.node, keyOf(track), new Set(nested)), restarts: 0, dirty: false, stop: () => {} };
      if (!this.local) (entry as { stop: () => void }).stop = observe(participant.node, () => { entry.dirty = true; });
      return entry;
    });
    this.preparation = { started: this.host.clock.now(), slices: 0 };
    this.continuePreparation(skipped);
  }
  private continuePreparation(skipped: string[]): void {
    this.frameHandle = undefined;
    if (this.phase !== 'preparing') return;
    this.preparation.slices++;
    const deadline = this.local ? Number.POSITIVE_INFINITY : performance.now() + PREPARATION_SLICE_MS;
    let complete = true;
    for (const entry of this.pending) {
      if (entry.dirty && entry.restarts < 3) { entry.dirty = false; entry.restarts++; entry.capture.abandon(); entry.capture = this.representer.begin(entry.participant.node, keyOf(entry.track), new Set(entry.nested)); }
      if (!entry.capture.step(deadline)) { complete = false; break; }
    }
    if (!complete) { this.frameHandle = this.host.clock.frame(() => this.continuePreparation(skipped)); return; }
    for (const entry of this.pending) entry.stop();
    const reads = this.pending.map(entry => ({ track: entry.track, participant: entry.participant, capture: entry.capture.complete(), nested: entry.nested }));
    this.pending = [];
    // Readiness never holds t0 or the cue: live providers show their captured underlay until their first live frame.
    const pendingReadiness = reads.reduce((count, read) => count + (read.capture.kind === 'captured' ? read.capture.ready.length : 0), 0);
    this.readinessPending = pendingReadiness;
    if (this.options.deferAcquisition && !this.accepted) { this.deferred = { reads, skipped }; this.pendingReads = reads; return; }
    this.finalize(reads, skipped, 0);
  }
  private accepted = false;
  /** Nodes whose leases this run handed to a successor (`yieldNode`). */
  private readonly handedNodes = new Set<HTMLElement>();
  private deferred: { readonly reads: Parameters<ChoreographyRun['finalize']>[0]; readonly skipped: string[] } | undefined;
  /**
   * The deferred explicit run's transition was accepted: acquire now from the pre-commit captures. A source the commit
   * already removed exits (or departs) from its pre-commit geometry.
   */
  accept(): void {
    this.accepted = true;
    const deferred = this.deferred;
    if (!deferred || this.phase !== 'preparing') return;
    this.deferred = undefined;
    this.renderAt = this.host.clock.now();
    this.finalize(deferred.reads, deferred.skipped, 0);
    for (const out of [...this.outgoing]) if (!out.revealed && !out.node.isConnected) this.reveal(out, 0);
    // A shared source the commit already removed retires its representation now (live providers resume detached media).
    for (const item of this.shared) if (item.source && !item.source.isConnected) item.rep.handle?.retire();
  }
  holds(node: HTMLElement): boolean {
    if (this.phase === 'settled') return false;
    return this.outgoing.some(out => out.node === node) || this.incoming.some(item => item.node === node) || this.shared.some(item => item.source === node || item.destination === node)
      || !!this.deferred?.reads.some(read => read.participant.node === node);
  }
  /**
   * C3 faithful per-participant settlement: a flight that cannot reach its destination's layer ends now — its copy is
   * removed, its source and any destination leases are restored (the live endpoints show), and every other track of
   * the run keeps running.
   */
  private settleUnreachable(item: SharedItem, reach: string): void {
    item.destination = undefined;
    this.disposeDriver(item, this.elapsed()); // exactly once: the item leaves this run (settle never sees it again)
    dropRep(item.rep); item.unobserve?.();
    item.sourceLease?.release(); item.sourceLease = undefined;
    item.destinationLease?.release(); item.destinationLease = undefined;
    item.clipLease?.release(); item.clipLease = undefined;
    const index = this.shared.indexOf(item);
    if (index >= 0) this.shared.splice(index, 1);
    this.ambiguousDestinations.add(item.track); // later registrations of this track are not re-admitted
    this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: item.key, reason: `layerUnreachable:${reach.slice('unreachable:'.length)}` });
  }
  /** The owner a scoped track's source selector resolves to (undefined for plain keys). */
  private scopedOwnerOf(track: ChoreographyTrack): object | undefined {
    const selector = track.side === 'shared' ? track.from ?? track.participant : track.participant;
    return typeof selector === 'string' ? undefined : this.sourceOf(track).owner;
  }
  /** Whole-run handoff identity: same key AND same scope (a scoped owner, or both plain) — never key alone. */
  private adopts(adoption: Adoption, track: ChoreographyTrack): boolean {
    return adoption.key === keyOf(track) && adoption.scopedOwner === this.scopedOwnerOf(track);
  }
  /** Overlay roles fade as the overlay's own presentation even when they contain controls (their shell is inert then). */
  private paintKept(node: HTMLElement, role: 'surface' | 'control'): boolean { return !this.options.overlayRoles?.has(node) && !this.liveReactions.has(node) && keepsPaint(node, role); }
  /** Still-mounted, control-bearing page regions reacting under an overlay (see finalize). */
  private readonly liveReactions = new Set<HTMLElement>();
  /** Completed captures not yet enrolled (disposed if the run settles while waiting for readiness). */
  private pendingReads: readonly { readonly capture: CaptureOutcome }[] = [];
  private readinessPending = 0;
  private finalize(reads: readonly { readonly track: ChoreographyTrack; readonly participant: Participant; readonly capture: CaptureOutcome; readonly nested: HTMLElement[] }[], skipped: string[], waitedMs: number): void {
    this.pendingReads = [];
    if (this.phase !== 'preparing') { for (const read of reads) if (read.capture.kind === 'captured') read.capture.handle.dispose(); return; }
    this.preparationReport('ready', waitedMs, reads);
    const tracked = this.plan.tracks.filter(track => track.side !== 'incoming');
    const plane = this.host.plane();
    const win = this.host.win;
    // Paint order: outgoing copies up to the last root-blended one are placed beside the (isolating) plane.
    // Shared flights from the first root-blended one onwards are placed after it (above outgoing copies), in paint order.
    let lastBlended = -1, firstBlendedShared = Infinity;
    reads.forEach(({ track, capture }, index) => {
      if (capture.kind !== 'captured' || !blendOf(capture.copyRoot)) return;
      if (track.side === 'outgoing') lastBlended = index; else firstBlendedShared = Math.min(firstBlendedShared, index);
    });
    // Writes.
    for (const [index, { track, participant, capture, nested }] of reads.entries()) {
      // S4: a settled participant is neither represented nor leased: its live source stays as it is until the commit.
      if (capture.kind !== 'captured' && capture.reason.startsWith('settled:')) { skipped.push(`${keyOf(track)}:${capture.reason}`); continue; }
      if (capture.kind !== 'captured') { skipped.push(`${keyOf(track)}:${capture.reason}`); this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: keyOf(track), reason: capture.reason }); if (track.side === 'shared') continue; }
      const inherited = this.adoptedOutgoing.get(participant.node);
      if (inherited) this.adoptedOutgoing.delete(participant.node);
      const acquired = inherited?.lease ?? this.lease(participant.node);
      const lease = 'foreign' in acquired ? undefined : acquired;
      if (!lease) skipped.push(`${keyOf(track)}:${(acquired as { foreign: string }).foreign}:displayedOnly`);
      const stable = lease ? (this.restingStable.get(participant.node) ?? lease.stableNumber) : Number.parseFloat(win.getComputedStyle(participant.node).opacity) || 1;
      const rep: Representation | undefined = capture.kind === 'captured' ? { wrapper: capture.node, copyRoot: capture.copyRoot, handle: capture.handle, sourceClip: capture.clip ? { inset: clipInset(capture.rect, capture.clip) as [number, number, number, number], radius: capture.clip.radius, ...(capture.clip.polygon ? { polygon: capture.clip.polygon.map(([x, y]) => [x - capture.rect.x, y - capture.rect.y] as const) } : {}) } : undefined } : undefined;
      if (rep) {
        // Own lease: the copy carries our stable projection, not the displayed value. Foreign lease: the copy
        // keeps the displayed values the projection recorded, and we never acquire that writer.
        // (Nested participants are hidden inside the projection itself: layout-preserving placeholders.)
        if (rep.copyRoot && lease) rep.copyRoot.style.opacity = String(stable);
        void nested;
        rep.wrapper.setAttribute('data-route-representation', keyOf(track));
      }
      if (track.side === 'outgoing') {
        const opacity = track.opacity ?? { from: 1, to: 0 };
        // Persistent page reaction (overlay runs, post-commit): a participant that STAYS mounted is a live page region
        // reacting under the overlay (dim/scale/slide), not a leaving copy. Its focusable descendants do not distort its
        // declared curve; focus/interaction behind a modal remain the dismissal coordinator's authority (unchanged).
        const liveReaction = !!this.options.overlayRoles && !!lease && participant.node.isConnected && !this.options.overlayRoles.has(participant.node) && keepsPaint(participant.node, participant.role);
        if (liveReaction) this.liveReactions.add(participant.node);
        if (rep) { rep.wrapper.style.opacity = '0'; placeInPlane(plane, rep, 'outgoing', index <= lastBlended); rep.handle?.attach(); }
        // Controls (declared, native focusable, containing focusable content or visibly focused), and
        // participants whose paint is foreign-held, keep stable paint before commit (hold-then-fade).
        const control = this.paintKept(participant.node, participant.role) || !lease;
        // Handed over (successor) or arbitrated from a running run: continue from the displayed paint (no reset).
        const continued = inherited?.displayed ?? (lease ? this.adoptedPaint.get(participant.node) : undefined);
        this.adoptedPaint.delete(participant.node);
        // Hold-then-fade: control paint holds at stable before commit.
        // A successor continues outgoing paint from the displayed value it adopted (no restoration frame).
        const sampler = control ? hold('opacity', stable)
          : continued !== undefined ? continueFrom('opacity', hold('opacity', continued), track.startMs, opacity.to * stable, Math.max(1, track.durationMs))
          : channelTracks.tween('opacity', { from: opacity.from * stable, to: opacity.to * stable, startMs: track.startMs, durationMs: track.durationMs, easing: channelEasing(track.easing, 'linear') });
        let observer: (() => void) | undefined;
        const item: OutgoingItem = { track, key: keyOf(track), node: participant.node, control, lease, stable, rep, rect: capture.kind === 'captured' ? capture.rect : undefined, sampleAt: 0, revealed: false, opacity: sampler, pinned: false, dirty: false, observer: undefined, nested, ancestorOpacity: capture.kind === 'captured' ? capture.ancestorOpacity : 1, scale: capture.kind === 'captured' ? capture.scale : undefined, displayedOpacity: lease ? undefined : stable, clip: capture.kind === 'captured' ? capture.clip : undefined, linear: capture.kind === 'captured' ? capture.linear : undefined, size: capture.kind === 'captured' && !axisAligned(capture.linear) ? capture.size : undefined };
        item.motion = this.transformMotion(participant.node, track, 'outgoing', control);
        observer = observe(participant.node, () => { item.dirty = true; });
        (item as { observer: (() => void) | undefined }).observer = observer;
        // Within-page removal has no route checkpoint: a pre-paint microtask observer reveals the copy.
        if (this.local && participant.node.parentElement) {
          const parent = participant.node.parentElement;
          const stopRemoval = observe(parent, () => { if (!participant.node.isConnected) this.reveal(item, this.elapsed()); });
          const previous = item.observer;
          (item as { observer: (() => void) | undefined }).observer = () => { previous?.(); stopRemoval(); };
        }
        this.outgoing.push(item);
        if (capture.kind === 'captured') for (const entry of capture.unreachable) this.nativeBindings.push({ entry, out: item });
      } else {
        // A shared source whose paint is foreign-held cannot be suppressed: no duplicate paint, skip honestly.
        if (!lease) { dropRep(rep); this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: keyOf(track), reason: 'foreignSourcePaint' }); continue; }
        const r = rectOf(capture.kind === 'captured' ? capture.rect : participant.node.getBoundingClientRect());
        rep!.wrapper.style.left = '0px'; rep!.wrapper.style.top = '0px'; rep!.wrapper.style.transformOrigin = '0 0';
        if (capture.kind === 'captured' && !axisAligned(capture.linear) && rep!.copyRoot) {
          // Rotated/skewed source: the moving box is its painted bounds; the content keeps its layout size and exact matrix.
          const [a, b, c, d] = capture.linear; const [w, h] = capture.size;
          const root = rep!.copyRoot;
          root.style.position = 'absolute'; root.style.left = '50%'; root.style.top = '50%'; root.style.width = `${w}px`; root.style.height = `${h}px`;
          root.style.transform = `translate(-50%, -50%) matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
          rep!.rotated = true;
        }
        placeInPlane(plane, rep!, 'shared', index >= firstBlendedShared);
        // A flight leaving an overlay (its source is in an overlay layer) starts in that layer's slot (C3).
        const reach = homeInLayer(rep!, participant.node);
        if (reach.startsWith('unreachable')) {
          // Faithful per-participant settlement: no copy, no suppression; the live source stays as it is.
          dropRep(rep); lease.release();
          this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: keyOf(track), reason: `layerUnreachable:${reach.slice('unreachable:'.length)}` });
          continue;
        }
        rep!.handle?.attach();
        // Controls, focusable or already-focused participants (and surfaces containing them) keep their
        // real visible paint; the decoration duplicates rather than hiding a usable control or focus ring.
        const keep = keepsPaint(participant.node, participant.role);
        if (!keep) lease.write('0');
        // Arbitrated from a running flight: continue from its displayed pose and velocity (no jump back to the source).
        const shown = yieldedShared.get(participant.node);
        if (shown) yieldedShared.delete(participant.node);
        const item = this.sharedItem(track, rep!, r, participant.node, lease, shown?.displayed, shown as Adoption | undefined);
        item.stable = stable;
        item.suppressed = !keep;
        item.nested = nested;
        item.ancestorOpacity = capture.kind === 'captured' ? capture.ancestorOpacity : 1;
        this.qualifyContent(item, participant.node);
        // Shared participants recapture on content invalidation too (own stable values, appearance once).
        item.unobserve = observe(participant.node, () => { item.dirty = true; });
        this.shared.push(item);
        if (capture.kind === 'captured') for (const entry of capture.unreachable) this.nativeBindings.push({ entry, shared: item });
      }
    }
    // Ancestors animated by this run contribute through their own representations, never a second time.
    for (const out of this.outgoing) out.ancestorOpacity = this.foreignAncestorOpacity(out.node);
    for (const item of this.shared) if (item.source) item.ancestorOpacity = this.foreignAncestorOpacity(item.source);
    for (const binding of this.nativeBindings) this.host.diagnose({ type: 'representation', transaction: this.transaction, participant: binding.out?.key ?? binding.shared?.key ?? '*', provider: 'native', continuity: 'unrepresented', reason: this.nativeRequested ? (!this.local && NativeSnapshotSession.available(this.host.win.document) ? 'nativeSnapshotAtCue' : this.local ? 'nativeSnapshotUnavailable:withinPage' : 'nativeSnapshotUnavailable:api') : binding.entry.element.localName === 'iframe' ? 'crossOriginFrame' : 'opaqueDeclared' });
    // Successor adoption: continue shared representations from displayed pose and velocity.
    for (const adoption of this.adopted) {
      const track = tracked.find(candidate => candidate.side === 'shared' && this.adopts(adoption, candidate)); // key + scope identity
      this.enrolled.add(adoption);
      if (!track) { dropRep(adoption.rep); adoption.sourceLease?.release(); continue; }
      const sourceRect = adoption.source?.isConnected ? rectOf(adoption.source.getBoundingClientRect()) : ([adoption.displayed.x.value, adoption.displayed.y.value, adoption.displayed.width.value, adoption.displayed.height.value] as const);
      const item = this.sharedItem(track, adoption.rep, sourceRect, adoption.source, adoption.sourceLease, adoption.displayed, adoption);
      // Carry the displayed appearance; requalify content and resume recapture observation of the source.
      item.stable = adoption.stable ?? item.stable;
      item.ancestorOpacity = adoption.ancestorOpacity ?? item.ancestorOpacity;
      item.suppressed = adoption.suppressed ?? false;
      item.nested = [...(adoption.nested ?? [])];
      const shownOpacity = adoption.repOpacity ?? 1;
      item.repOpacity = shownOpacity < 1 ? continueFrom('opacity', hold('opacity', shownOpacity), 0, 1, VISUAL_DEFAULTS.minimumRetargetMs) : hold('opacity', shownOpacity);
      if (adoption.source?.isConnected) { this.qualifyContent(item, adoption.source); const target = item; item.unobserve = observe(adoption.source, () => { target.dirty = true; }); }
      if (track.driver && !item.driver) this.host.diagnose({ type: 'driver', transaction: this.transaction, participant: item.key, event: 'noContinuation', t: 0 });
      this.shared.push(item);
    }
    if (this.nativeAdopted) {
      // Continue the predecessor's native snapshots on the successor's shared representations (same transition, same images).
      const { session, keys } = this.nativeAdopted;
      this.nativeSession = session;
      this.nativeBindings = [];
      session.entries.forEach((entry, index) => { const shared = this.shared.find(item => item.key === keys[index]); this.nativeBindings[index] = shared ? { entry, shared } : { entry }; });
      this.nativeAdopted = undefined;
    }
    // Adopted outgoing leases this plan does not continue are released normally (their node is current).
    // Adopted paint an INCOMING track of this plan may continue (a reopen during dismissal, an open superseding a
    // close) stays held until destination discovery (synchronous for overlay/local runs, before any paint);
    // anything not continued is then released normally.
    const releaseAdopted = () => {
      for (const { lease } of this.adoptedOutgoing.values()) lease.release(); this.adoptedOutgoing.clear();
      for (const { translate, scale } of this.adoptedTransforms.values()) { translate?.lease.release(); scale?.lease.release(); } this.adoptedTransforms.clear();
    };
    if (this.adoptedOutgoing.size && this.plan.tracks.some(track => track.side === 'incoming')) queueMicrotask(() => { if (this.phase === 'playing') releaseAdopted(); });
    else releaseAdopted();
    this.phase = 'playing';
    this.t0 = this.host.clock.now();
    this.host.diagnose({ type: 'prepared', transaction: this.transaction, at: this.t0, skipped });
    this.timers.push(this.host.clock.timeout(() => this.settle('timeout'), this.plan.durationMs + VISUAL_DEFAULTS.visualSlackMs + VISUAL_DEFAULTS.preparationBudgetMs));
    this.write(0);
    this.frameHandle = this.host.clock.frame(() => this.tick());
  }
  private sharedItem(track: ChoreographyTrack, rep: Representation, source: readonly [number, number, number, number], sourceNode: HTMLElement | undefined, sourceLease: ChoreographyLease | undefined, displayed: Adoption['displayed'] | undefined, displayedExtra?: Adoption): SharedItem {
    const end = track.startMs + track.durationMs;
    const points = (track.path ?? []).map(waypoint => ({ atMs: waypoint.atMs, rect: poseRect(waypoint.pose, source, this.host.win), easing: easingOf(waypoint) }));
    const geo = {} as Geometry;
    GEOMETRY.forEach((channel, index) => {
      const planned = points.map(point => ({ atMs: point.atMs, value: point.rect[index]!, easing: point.easing }));
      if (displayed) {
        // Successor: Hermite from the displayed state to its first planned value (or the source pose).
        const target = planned[0]?.value ?? source[index]!;
        const duration = Math.max(VISUAL_DEFAULTS.minimumRetargetMs, (planned[0]?.atMs ?? end) - track.startMs);
        // The displayed state extends linearly before the handover instant (consistent C1 differencing).
        const shownState = displayed[channel];
        const start: Sampler = { endMs: track.startMs, constrained: false, sample: ms => ({ value: shownState.value + shownState.velocity * (ms - track.startMs), velocity: shownState.velocity }) };
        const head = continueFrom(channel, start, track.startMs, target, duration);
        const rest = planned.slice(1);
        geo[channel] = rest.length ? chain(head, piecewise(channel, target, head.endMs, rest, track.easing)) : head;
        if (channel === 'height') this.host.diagnose({ type: 'retarget', transaction: this.transaction, participant: keyOf(track), t: 0, cause: 'successor', from: [displayed.x.value, displayed.y.value, displayed.width.value, displayed.height.value], velocity: [displayed.x.velocity, displayed.y.velocity, displayed.width.velocity, displayed.height.velocity], to: points[0]?.rect ?? source, constrained: GEOMETRY.some(name => geo[name]?.constrained) });
      } else geo[channel] = piecewise(channel, source[index]!, track.startMs, planned, track.easing);
    });
    const radiusPoints = (track.path ?? []).filter(waypoint => waypoint.radius !== undefined);
    const corners = track.radius || radiusPoints.length ? CORNERS.map((channel, index) => piecewise(channel, cornersOf(track.radius?.from ?? 0)[index]!, track.startMs, radiusPoints.map(waypoint => ({ atMs: waypoint.atMs, value: cornersOf(waypoint.radius!)[index]!, easing: easingOf(waypoint) })), track.easing)) : undefined;
    const clipPoints = (track.path ?? []).filter(waypoint => waypoint.clip !== undefined);
    const clip = track.clip || clipPoints.length ? INSETS.map((channel, index) => piecewise(channel, (track.clip?.from ?? [0, 0, 0, 0])[index]!, track.startMs, clipPoints.map(waypoint => ({ atMs: waypoint.atMs, value: waypoint.clip![index]!, easing: easingOf(waypoint) })), track.easing)) : undefined;
    // A successor continues radius/clip channels from their displayed values and velocities.
    const continueArray = (names: readonly ChannelName[], shown: readonly ChannelState[] | undefined, planned: Sampler[] | undefined): Sampler[] | undefined => {
      if (!shown) return planned;
      return names.map((channel, index) => {
        const state = shown[index]!;
        const start: Sampler = { endMs: track.startMs, constrained: false, sample: ms => ({ value: state.value + state.velocity * (ms - track.startMs), velocity: state.velocity }) };
        const bridgeEnd = track.startMs + VISUAL_DEFAULTS.minimumRetargetMs;
        const target = planned ? planned[index]!.sample(bridgeEnd).value : shown[index]!.value;
        const head = continueFrom(channel, start, track.startMs, target, VISUAL_DEFAULTS.minimumRetargetMs);
        // After the bridge, the successor's remaining authored timeline (future waypoints) applies.
        return planned ? chain(head, planned[index]!) : head;
      });
    };
    const driver = track.driver ? visualDriver(track.driver) : undefined;
    return { track, key: keyOf(track), rep, geo, corners: continueArray(CORNERS, displayedExtra?.corners, corners), clip: continueArray(INSETS, displayedExtra?.clip, clip), source: sourceNode, sourceLease, destination: undefined, destinationLease: undefined, destinationControl: false, measured: false, repOpacity: hold('opacity', 1), crossfadeAt: undefined,
      content: track.content ?? 'crossfade', sourceSize: [source[2], source[3]], clipLease: undefined, revealClip: undefined, offset: [0, 0], sourceRect: source, ancestorOpacity: 1,
      dirty: false, unobserve: undefined, stable: 1, driver, driverActive: !!driver && !displayed, lastDriver: undefined,
      suppressed: false, sourcePaint: undefined, nested: [], restoring: undefined, measuredRect: undefined, replan: false };
  }
  /** Qualify the requested content policy against the actual content (decided before playback). */
  private qualifyContent(item: SharedItem, node: HTMLElement): void {
    const requested = item.content;
    let reason: string | undefined;
    if (requested === 'scale' && hasText(node)) reason = 'textBearing';
    if (requested === 'reflow' && node.querySelectorAll('*').length > 32) reason = 'subtreeTooLarge';
    if (reason) item.content = 'crossfade';
    this.fitSurface(item);
    this.host.diagnose({ type: 'content', transaction: this.transaction, participant: item.key, requested, applied: item.content, ...(reason ? { reason } : {}) });
  }
  /**
   * Recapture a participant's representation (shared or outgoing) into the same wrapper with the same
   * rules as preparation: own stable opacity on the copy root, foreign/ancestor appearance once, nested
   * placeholders, content qualification. Returns false when the content is no longer capturable.
   */
  private recaptureInto(source: HTMLElement, rep: Representation, stable: number, nested: readonly HTMLElement[], reflow: boolean, key = ''): { ancestorOpacity: number } | undefined {
    // One capture policy for every path (shared, outgoing, preparation): providers, then projection.
    const capture = this.representer.capture(source, key, new Set(nested));
    if (capture.kind !== 'captured') return undefined;
    const copyRoot = capture.copyRoot;
    if (copyRoot) { copyRoot.style.opacity = String(stable); if (reflow) { copyRoot.style.width = '100%'; copyRoot.style.height = 'auto'; } }
    rep.handle?.dispose();
    rep.wrapper.replaceChildren(...capture.node.childNodes);
    rep.copyRoot = copyRoot;
    rep.handle = capture.handle;
    rep.sourceClip = capture.clip ? { inset: clipInset(capture.rect, capture.clip) as [number, number, number, number], radius: capture.clip.radius } : undefined;
    capture.handle.attach();
    return { ancestorOpacity: capture.ancestorOpacity };
  }
  /**
   * Surface resizing: under crossfade (and clipReveal) the copied surface box (background, border, radius)
   * fills the resizing representation while its children keep their own inlined sizes, so no glyph is
   * stretched. Reflow lets a small subtree re-wrap. Translate and scale keep the source box.
   */
  private fitSurface(item: SharedItem): void {
    const root = item.rep.copyRoot;
    if (!root || item.rep.rotated) return;
    if (item.content === 'crossfade' || item.content === 'clipReveal') { root.style.boxSizing = 'border-box'; root.style.width = '100%'; root.style.height = '100%'; }
    else if (item.content === 'reflow') { root.style.width = '100%'; root.style.height = 'auto'; }
  }
  private recaptureShared(item: SharedItem, t: number): void {
    if (!item.source?.isConnected) return;
    const result = this.recaptureInto(item.source, item.rep, item.stable, item.nested, false, item.key);
    if (result) this.fitSurface(item);
    if (!result) {
      // Settle this participant: its real paint is restored and its decoration removed (no invisible content).
      this.host.diagnose({ type: 'recapture', transaction: this.transaction, participant: item.key, t, outcome: 'settled' });
      this.dropShared(item, t);
      return;
    }
    item.ancestorOpacity = result.ancestorOpacity;
    this.host.diagnose({ type: 'recapture', transaction: this.transaction, participant: item.key, t, outcome: 'captured' });
  }
  private dropShared(item: SharedItem, t: number): void {
    item.unobserve?.(); item.unobserve = undefined;
    dropRep(item.rep);
    if (item.sourceLease) { if (item.sourceLease.node.isConnected) item.sourceLease.release(); else item.sourceLease.abandon(); item.sourceLease = undefined; }
    item.destinationLease?.release(); item.destinationLease = undefined;
    item.clipLease?.release(); item.clipLease = undefined;
    this.disposeDriver(item, t);
    const index = this.shared.indexOf(item);
    if (index >= 0) this.shared.splice(index, 1);
  }
  private disposeDriver(item: SharedItem, t: number): void {
    if (!item.driver) return;
    const driver = item.driver;
    item.driver = undefined; item.driverActive = false;
    try { driver.dispose?.(); } catch { /* disposal failure cannot retain resources */ }
    this.host.diagnose({ type: 'driver', transaction: this.transaction, participant: item.key, event: 'disposed', t });
  }
  /** What `write` paints for a shared item at `t` (planned geometry, driver output, followed offset). May throw (driver). */
  private compose(item: SharedItem, t: number, useDriver = item.driverActive, geo: Geometry = item.geo): { x: number; y: number; width: number; height: number; driverOpacity: number; corners?: number[]; clip?: number[]; rep: number } {
    let output: VisualDriverOutput | undefined;
    if (item.driver && useDriver) {
      output = item.driver.sample({ elapsedMs: t - item.track.startMs, durationMs: item.track.durationMs, progress: Math.min(1, Math.max(0, (t - item.track.startMs) / Math.max(1, item.track.durationMs))), from: item.sourceRect });
      for (const value of [output.x, output.y, output.width, output.height, output.opacity]) if (value !== undefined && !Number.isFinite(value)) throw new RangeError('Driver output must be finite');
    }
    const pick = (channel: (typeof GEOMETRY)[number]) => output?.[channel] ?? geo[channel].sample(t).value;
    return {
      x: pick('x') + item.offset[0], y: pick('y') + item.offset[1], width: pick('width'), height: pick('height'), driverOpacity: output?.opacity ?? 1,
      ...(item.corners ? { corners: item.corners.map(sampler => Math.max(0, sampler.sample(t).value)) } : {}),
      ...(item.clip ? { clip: item.clip.map(sampler => Math.max(0, sampler.sample(t).value)) } : {}),
      rep: item.repOpacity.sample(t).value
    };
  }
  /** Compose with driver-failure isolation: a throwing driver fails only its own track (reported once). */
  private safeCompose(item: SharedItem, t: number): ReturnType<ChoreographyRun['compose']> {
    try { return this.compose(item, t); }
    catch {
      item.driverActive = false;
      this.host.diagnose({ type: 'driver', transaction: this.transaction, participant: item.key, event: 'failed', t });
      return this.compose(item, t, false);
    }
  }
  /** Displayed value and velocity (consistent 1 ms interval ending at `t`) of every painted channel. */
  private displayedState(item: SharedItem, t: number): Pick<Adoption, 'displayed' | 'corners' | 'clip' | 'repOpacity'> {
    const now = this.safeCompose(item, t), before = this.safeCompose(item, t - 1);
    const state = (value: number, previous: number): ChannelState => ({ value, velocity: value - previous });
    return {
      displayed: { x: state(now.x, before.x), y: state(now.y, before.y), width: state(now.width, before.width), height: state(now.height, before.height) },
      ...(now.corners ? { corners: now.corners.map((value, index) => state(value, before.corners![index]!)) } : {}),
      ...(now.clip ? { clip: now.clip.map((value, index) => state(value, before.clip![index]!)) } : {}),
      repOpacity: Math.min(1, Math.max(0, now.rep * now.driverOpacity))
    };
  }
  /**
   * The driver's own path as a sampler (for continuation before the handover instant). It reads a
   * snapshot of the pre-handover geometry, never `item.geo`, which the continuation replaces (reading it
   * would recurse through the new continuation).
   */
  private driverSampler(item: SharedItem, channel: (typeof GEOMETRY)[number], base: Geometry, offset: readonly [number, number]): Sampler {
    const value = (ms: number) => {
      const fallback = base[channel].sample(ms).value + (channel === 'x' ? offset[0] : channel === 'y' ? offset[1] : 0);
      if (!item.driver) return fallback;
      try {
        const output = item.driver.sample({ elapsedMs: ms - item.track.startMs, durationMs: item.track.durationMs, progress: Math.min(1, Math.max(0, (ms - item.track.startMs) / Math.max(1, item.track.durationMs))), from: item.sourceRect });
        const driven = output[channel];
        if (driven === undefined || !Number.isFinite(driven)) return fallback;
        return driven + (channel === 'x' ? offset[0] : channel === 'y' ? offset[1] : 0);
      } catch { return fallback; }
    };
    return { endMs: item.geo[channel].endMs, constrained: false, sample: ms => ({ value: value(ms), velocity: value(ms) - value(ms - 1) }) };
  }
  /** Hand a driven track over to Hermite continuation from its displayed pose (declared capability). */
  private endDriver(item: SharedItem, t: number, at: number, to: readonly [number, number, number, number], duration: number): boolean {
    if (!item.driver || !item.driverActive) return false;
    if (item.driver.continuation === 'none') {
      item.driverActive = false;
      GEOMETRY.forEach((channel, index) => { item.geo[channel] = hold(channel, to[index]!, t); });
      this.host.diagnose({ type: 'driver', transaction: this.transaction, participant: item.key, event: 'noContinuation', t });
      return true;
    }
    const base: Geometry = { ...item.geo };
    const offset = [item.offset[0], item.offset[1]] as const;
    const paths = GEOMETRY.map(channel => this.driverSampler(item, channel, base, offset));
    item.offset = [0, 0];
    item.driverActive = false;
    GEOMETRY.forEach((channel, index) => { item.geo[channel] = continueFrom(channel, paths[index]!, at, to[index]!, duration); });
    this.host.diagnose({ type: 'driver', transaction: this.transaction, participant: item.key, event: 'continued', t });
    return true;
  }
  // ----------------------------------------------------------------------------------- frames
  private tick(): void {
    this.frameHandle = undefined;
    if (this.phase !== 'playing' && this.phase !== 'returning') return;
    if (this.batch.length) this.flushDestinations(); // frame checkpoint for deferred destination admission
    const t = this.elapsed();
    // Read phase.
    for (const rep of this.representations()) rep.handle?.read();
    if (this.phase === 'playing') {
      for (const out of this.outgoing) {
        if (out.revealed || !out.node.isConnected) continue;
        out.rect = out.node.getBoundingClientRect(); out.sampleAt = t; out.sampledMotion = out.motion ? [...out.motion.written] : undefined; if (out.motion) this.sampleMotionFrame(out); out.ancestorOpacity = this.foreignAncestorOpacity(out.node); { const svgGraphic = out.node.namespaceURI === 'http://www.w3.org/2000/svg' && out.node.localName !== 'svg'; const linear = svgGraphic ? [1, 0, 0, 1] as const : accumulatedLinear(out.node); out.linear = linear; out.size = linear && !axisAligned(linear) ? layoutSize(out.node) : undefined; out.scale = linear ? (axisAligned(linear) ? [linear[0], linear[3]] : [1, 1]) : undefined; } out.clip = sampleClip(out.node);
        if (!out.lease) out.displayedOpacity = Number.parseFloat(this.host.win.getComputedStyle(out.node).opacity);
        // Dynamic control obligation: content that becomes interactive holds stable paint immediately.
        if (!out.control && this.paintKept(out.node, 'surface') && !focusVisible(out.node)) {
          (out as { control: boolean }).control = true;
          out.opacity = hold('opacity', out.stable, t);
          this.returnMotion(out, t);
          this.host.diagnose({ type: 'focusPinned', transaction: this.transaction, participant: out.key, t });
        }
        if (!out.pinned && focusVisible(out.node)) {
          out.pinned = true;
          out.opacity = continueFrom('opacity', out.opacity, t, out.stable, VISUAL_DEFAULTS.focusSettleMs);
          this.returnMotion(out, t);
          this.host.diagnose({ type: 'focusPinned', transaction: this.transaction, participant: out.key, t });
        }
        if (out.dirty) { out.dirty = false; this.recapture(out, t); }
      }
      for (const item of [...this.shared]) {
        // Source following/recapture apply only before the commit: after it (always for within-page runs)
        // source movement and mutation are the new state, not something to follow.
        if (item.replan) { item.replan = false; this.replan(item, t); }
        if (!this.committed && !item.measured && item.source?.isConnected) {
          if (item.suppressed && !item.sourcePaint && !item.restoring && keepsPaint(item.source, 'surface') && focusVisible(item.source)) {
            // Visible focus arrived on a suppressed participant: restore real paint and settle the
            // conflicting decoration within the focus-settle bound.
            item.sourcePaint = channelTracks.tween('opacity', { from: 0, to: item.stable, startMs: t, durationMs: VISUAL_DEFAULTS.focusSettleMs, easing: 'linear' });
            item.repOpacity = continueFrom('opacity', item.repOpacity, t, 0, VISUAL_DEFAULTS.focusSettleMs);
            this.host.diagnose({ type: 'focusPinned', transaction: this.transaction, participant: item.key, t });
          }
          if (item.dirty) { item.dirty = false; this.recaptureShared(item, t); }
          // A moving (foreign) ancestor moves the source: follow it until measurement (appearance sampled too).
          const now = item.source.getBoundingClientRect();
          item.offset = [now.x - item.sourceRect[0], now.y - item.sourceRect[1]];
          item.ancestorOpacity = this.foreignAncestorOpacity(item.source);
        }
        if (this.local && !item.destination && !this.ambiguousDestinations.has(item.track)) {
          const destination = this.destinationOf(item.track);
          const all = destination.unresolved ? [] : this.host.find(destination.key, destination.owner);
          // Ambiguity counts only candidates that appeared after the capture (the leaving source may share the key).
          const fresh = all.filter(entry => !this.initialNodes.has(entry.node));
          if (fresh.length > 1) this.ambiguous(item.track);
          const found = fresh.length === 1 ? fresh : fresh.length === 0 && all.length === 1 ? all : [];
          if (found.length === 1) {
            const target = found[0]!;
            item.destination = target.node;
            const reach = homeInLayer(item.rep, target.node);
            if (reach.startsWith('unreachable')) { this.settleUnreachable(item, reach); continue; }
            item.destinationControl = keepsPaint(target.node, target.role);
            if (target.node === item.source) { item.destinationLease = item.sourceLease; item.sourceLease = undefined; }
            else if (!item.destinationControl) { const acquired = this.lease(target.node); if (!('foreign' in acquired)) { item.destinationLease = acquired; acquired.write('0'); } else item.destinationControl = true; }
          }
        }
        if (item.destination && !item.measured && item.destination.isConnected) this.measureDestination(item, t);
        else if (item.destination?.isConnected && item.measuredRect && this.committed) {
          // Late layout: a position-only shift of the measured destination is followed (ResizeObserver cannot see it).
          const now = rectOf(item.destination.getBoundingClientRect());
          if (now.some((value, index) => Math.abs(value - item.measuredRect![index]!) > 0.5)) this.measureDestination(item, t);
        }
        this.enforcePaint(item, t);
      }
    } else {
      for (const item of this.shared) if (!item.measured && item.source?.isConnected) {
        item.measured = true;
        this.retargetGeometry(item, t, rectOf(item.source.getBoundingClientRect()), this.returnEnd - t, 'return');
      }
    }
    this.write(t);
    if (this.phase === 'playing' && !this.cued && t >= this.plan.cueMs) {
      this.cued = true;
      this.host.diagnose({ type: 'cue', transaction: this.transaction, t });
      this.cueCommit(t);
    }
    if ((this.phase as string) === 'settled') return;
    if (this.phase === 'returning' ? t >= this.returnEnd : this.finished(t)) { this.settle(this.phase === 'returning' ? 'returned' : 'completed'); return; }
    this.frameHandle = this.host.clock.frame(() => this.tick());
  }
  private recapture(out: OutgoingItem, t: number): void {
    if (!out.rep) return;
    // Same unified policy as preparation (providers, projection, images): no path-specific capture rules.
    if (!this.recaptureInto(out.node, out.rep, out.stable, out.nested, false, out.key)) {
      // Uncapturable after invalidation: settle this track (no stale snapshot claimed).
      dropRep(out.rep); out.rep = undefined;
      this.host.diagnose({ type: 'recapture', transaction: this.transaction, participant: out.key, t, outcome: 'settled' });
      return;
    }
    this.host.diagnose({ type: 'recapture', transaction: this.transaction, participant: out.key, t, outcome: 'captured' });
  }
  private retargetGeometry(item: SharedItem, t: number, to: readonly [number, number, number, number], duration: number, cause: 'destination' | 'return'): void {
    const shown = this.displayedState(item, t);
    // Authored future waypoints are preserved: the measured endpoint replaces only the final segment.
    const end = item.track.startMs + item.track.durationMs;
    // Only waypoints that leave a real final segment are authored intermediate poses; a pose at the
    // track end (e.g. the `via` shorthand) is a pre-commit placeholder replaced by the measured endpoint.
    // The continuation never starts before the track itself (startMs), nor before a channel family's last
    // authored intermediate waypoint.
    const familyAt = (select: (waypoint: NonNullable<ChoreographyTrack['path']>[number]) => boolean) => cause !== 'destination' ? t
      : Math.max(t, item.track.startMs, ...(item.track.path ?? []).filter(select).map(waypoint => waypoint.atMs).filter(atMs => atMs <= end - VISUAL_DEFAULTS.minimumRetargetMs));
    const at = familyAt(() => true);
    const radiusAt = familyAt(waypoint => waypoint.radius !== undefined);
    const clipAt = familyAt(waypoint => waypoint.clip !== undefined);
    if (at > t) duration = end - at;
    if (item.driver && item.driverActive && this.endDriver(item, t, t, to, Math.max(VISUAL_DEFAULTS.minimumRetargetMs, duration))) {
      this.host.diagnose({ type: 'retarget', transaction: this.transaction, participant: item.key, t, cause, from: [shown.displayed.x.value, shown.displayed.y.value, shown.displayed.width.value, shown.displayed.height.value], velocity: [shown.displayed.x.velocity, shown.displayed.y.velocity, shown.displayed.width.velocity, shown.displayed.height.velocity], to, constrained: false });
      return;
    }
    // Fold the followed source offset into the displayed state before continuing (no jump).
    const [ox, oy] = item.offset;
    if (ox || oy) {
      const bx = item.geo.x, by = item.geo.y;
      item.geo.x = { endMs: bx.endMs, constrained: bx.constrained, sample: ms => { const s = bx.sample(ms); return { value: s.value + ox, velocity: s.velocity }; } };
      item.geo.y = { endMs: by.endMs, constrained: by.constrained, sample: ms => { const s = by.sample(ms); return { value: s.value + oy, velocity: s.velocity }; } };
      item.offset = [0, 0];
    }
    const span = Math.max(VISUAL_DEFAULTS.minimumRetargetMs, duration);
    const from = GEOMETRY.map(channel => shown.displayed[channel]);
    GEOMETRY.forEach((channel, index) => { item.geo[channel] = continueFrom(channel, item.geo[channel], at, to[index]!, span); });
    if (item.corners && item.track.radius) { const target = cornersOf(cause === 'return' ? item.track.radius.from : item.track.radius.to); item.corners = item.corners.map((sampler, index) => continueFrom(CORNERS[index]!, sampler, radiusAt, target[index]!, Math.max(VISUAL_DEFAULTS.minimumRetargetMs, end - radiusAt))); }
    if (item.clip && item.track.clip) { const target = cause === 'return' ? item.track.clip.from : item.track.clip.to; item.clip = item.clip.map((sampler, index) => continueFrom(INSETS[index]!, sampler, clipAt, target[index]!, Math.max(VISUAL_DEFAULTS.minimumRetargetMs, end - clipAt))); }
    this.host.diagnose({ type: 'retarget', transaction: this.transaction, participant: item.key, t, cause, from: [from[0]!.value, from[1]!.value, from[2]!.value, from[3]!.value], velocity: [from[0]!.velocity, from[1]!.velocity, from[2]!.velocity, from[3]!.velocity], to, constrained: GEOMETRY.some(channel => item.geo[channel].constrained) });
  }
  private measureDestination(item: SharedItem, t: number): void {
    item.measured = true;
    item.measuredRect = rectOf(item.destination!.getBoundingClientRect());
    if (item.destination) this.resize.add(item.destination);
    const end = item.track.startMs + item.track.durationMs;
    this.retargetGeometry(item, t, rectOf(item.destination!.getBoundingClientRect()), end - t, 'destination');
    // Interactive destination: visibly usable from commit; the representation crossfades against it.
    if (item.destinationControl) item.repOpacity = continueFrom('opacity', item.repOpacity, t, 0, Math.max(VISUAL_DEFAULTS.crossfadeMs, end - t));
    // clipReveal: the real destination is visible now, clipped to the displayed source rect, growing to full.
    if (item.content === 'clipReveal' && item.destination) {
      const dest = item.destination.getBoundingClientRect();
      const x = item.geo.x.sample(t).value, y = item.geo.y.sample(t).value, w = item.geo.width.sample(t).value, h = item.geo.height.sample(t).value;
      const start = [Math.max(0, y - dest.y), Math.max(0, dest.right - (x + w)), Math.max(0, dest.bottom - (y + h)), Math.max(0, x - dest.x)];
      // Reuse the live clip lease on remeasurement (rebase): continue from the displayed insets.
      if (item.clipLease?.live && item.revealClip) {
        item.revealClip = item.revealClip.map((sampler, index) => continueFrom(INSETS[index]!, sampler, t, 0, Math.max(VISUAL_DEFAULTS.minimumRetargetMs, end - t)));
        return;
      }
      item.clipLease?.release(); item.clipLease = undefined;
      let acquired = acquireChoreographyLease(this.host.root, item.destination, 'clip-path', () => this.phase !== 'settled', { holder: this });
      // Succeed a reveal clip handed over by a yielding earlier run (no restoring write in between).
      const handedClip = yieldedTransforms.get(item.destination)?.['clip-path'];
      if ('foreign' in acquired && acquired.foreign === 'choreography' && handedClip) {
        acquired = acquireChoreographyLease(this.host.root, item.destination, 'clip-path', () => this.phase !== 'settled', { holder: this, successorOf: handedClip });
        handedClip.release();
        yieldedTransforms.get(item.destination)!['clip-path'] = undefined;
      }
      if (!('foreign' in acquired)) {
        item.clipLease = acquired;
        item.revealClip = INSETS.map((channel, index) => channelTracks.tween(channel, { from: start[index]!, to: 0, startMs: t, durationMs: Math.max(VISUAL_DEFAULTS.minimumRetargetMs, end - t), easing: 'ease-out' }));
        item.destinationLease?.write(String(item.stable));
        item.repOpacity = continueFrom('opacity', item.repOpacity, t, 0, VISUAL_DEFAULTS.crossfadeMs);
      }
    }
  }
  /**
   * The route commit cue. With opt-in native snapshots and content projection cannot reach, the commit runs
   * inside a view transition's update callback so the browser's old-state images of exactly those elements
   * remain available to the visual run; otherwise the cue is immediate.
   */
  private cueCommit(t: number): void {
    const doc = this.host.win.document;
    if (!this.local && this.nativeRequested && this.nativeBindings.length && !this.nativeSession && NativeSnapshotSession.available(doc)) {
      const session = new NativeSnapshotSession(doc, this.nativeBindings.map(binding => binding.entry), this, reason => this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: '*', reason }));
      const transaction = this.transaction;
      if (session.start(async () => { this.host.cue(transaction); await flushed(); }, Math.max(1, this.plan.durationMs - t))) { this.nativeSession = session; return; }
    }
    this.host.cue(this.transaction);
  }
  /** Write phase: native snapshot images follow their representations (geometry and opacity), exactly once. */
  private driveNative(t: number): void {
    const session = this.nativeSession;
    if (!session?.live) return;
    this.nativeBindings.forEach((binding, index) => {
      if (binding.out?.rep && binding.out.rect && binding.out.revealed) {
        const [sx, sy] = binding.out.scale ?? [1, 1];
        const [tx, ty, ratio] = copyMotion(binding.out, t, true);
        session.drive(index, binding.out.rect.x + tx, binding.out.rect.y + ty, sx * ratio, sy * ratio, Number(binding.out.rep.wrapper.style.opacity || '1'));
      } else if (binding.shared) {
        const c = this.safeCompose(binding.shared, t);
        const item = binding.shared;
        const scale = item.content === 'scale' ? [c.width / Math.max(1, item.sourceSize[0]), c.height / Math.max(1, item.sourceSize[1])] as const : [1, 1] as const;
        session.drive(index, c.x, c.y, scale[0], scale[1], Math.min(1, Math.max(0, item.repOpacity.sample(t).value * c.driverOpacity * item.ancestorOpacity)));
      } else session.drive(index, 0, 0, 1, 1, 0);
    });
  }
  private finished(t: number): boolean {
    if (!this.committed || t < this.plan.durationMs) return false;
    for (const item of this.shared) {
      if (item.destination && !item.measured) return false;
      const end = Math.max(...GEOMETRY.map(channel => item.geo[channel].endMs), ...(item.revealClip ?? []).map(sampler => sampler.endMs));
      if (t < end) return false;
      if (item.destination && !item.destinationControl && (item.content === 'crossfade' || item.content === 'reflow' || item.content === 'scale')) {
        if (item.crossfadeAt === undefined) { item.crossfadeAt = t; item.repOpacity = continueFrom('opacity', item.repOpacity, t, 0, VISUAL_DEFAULTS.crossfadeMs); return false; }
        if (t < item.crossfadeAt + VISUAL_DEFAULTS.crossfadeMs) return false;
      }
    }
    if (this.renderAt === undefined) return this.incoming.length === 0;
    const since = this.host.clock.now() - this.renderAt;
    return this.incoming.every(item => (item.anchor === 'render' ? since : t) >= item.opacity.endMs) && this.outgoing.every(item => !item.revealed || t >= Math.max(item.opacity.endMs, motionEnd(item.motion)));
  }
  private write(t: number): void {
    for (const out of this.outgoing) {
      const value = Math.min(1, Math.max(0, out.opacity.sample(t).value));
      // Revealed copies carry the track value times the last sampled foreign ancestor appearance (exactly once).
      if (out.revealed) { if (out.rep) { out.rep.wrapper.style.opacity = String(this.relative(out, value) * out.ancestorOpacity); if (out.motion) this.moveCopy(out, t); } }
      else if (out.node.isConnected) { out.lease?.write(String(value)); if (out.motion) writeMotion(out.motion, t); }
    }
    for (const item of [...this.shared]) {
      const c = this.safeCompose(item, t), p = this.safeCompose(item, t - 1);
      const x = { value: c.x, velocity: c.x - p.x }, y = { value: c.y, velocity: c.y - p.y }, w = { value: c.width }, h = { value: c.height };
      const drive = { opacity: c.driverOpacity };
      const style = item.rep.wrapper.style;
      if (item.content === 'scale') {
        // Images/icons: the copy keeps its source size and scales (qualified: no text).
        style.transform = `translate(${x.value}px, ${y.value}px) scale(${Math.max(0, w.value) / Math.max(1, item.sourceSize[0])}, ${Math.max(0, h.value) / Math.max(1, item.sourceSize[1])})`;
        style.width = `${item.sourceSize[0]}px`; style.height = `${item.sourceSize[1]}px`;
      } else {
        style.transform = `translate(${x.value}px, ${y.value}px)`;
        style.width = `${Math.max(0, w.value)}px`; style.height = `${Math.max(0, h.value)}px`;
      }
      style.opacity = String(Math.min(1, Math.max(0, item.repOpacity.sample(t).value * (drive.opacity ?? 1) * item.ancestorOpacity)));
      const corners = c.corners;
      const clip = c.clip;
      if (corners) style.borderRadius = corners.map(value => `${value}px`).join(' ');
      // Source clipping (scroll containers, clipping boxes): exact at the source, released as the track moves.
      const source = item.rep.sourceClip;
      const progress = Math.min(1, Math.max(0, (t - item.track.startMs) / Math.max(1, item.track.durationMs)));
      if (source?.polygon && !clip) {
        // Exact rotated source clip, released toward an unclipped box as the track moves (same point count).
        // Released continuously to the ink-expanded box: every vertex (plus phantom vertices on the polygon where the
        // rays toward the box corners cross it) moves radially to where its ray meets the expanded box, so the shape is
        // unchanged at the start and is exactly the whole box at completion (no endpoint pop, whatever its thinness).
        style.clipPath = progress < 1 && source.polygon.length >= 3 ? `polygon(${releasePolygon(source.polygon, Math.max(0, c.width), Math.max(0, c.height), CLIP_RELEASE_INK, progress).map(([x, y]) => `${x}px ${y}px`).join(', ')})` : '';
      }
      const fromSource = source && !source.polygon && progress < 1 ? source.inset.map(value => value + (-CLIP_RELEASE_INK - value) * progress) : undefined;
      const edges = clip && fromSource ? clip.map((value, index) => Math.max(value, fromSource[index]!)) : clip ?? fromSource;
      if (edges) style.clipPath = `inset(${edges.map(value => `${value}px`).join(' ')}${corners ? ` round ${corners.map(value => `${value}px`).join(' ')}` : fromSource && source!.radius > 0 ? ` round ${source!.radius}px` : ''})`;
      else if (source && !source.polygon) style.clipPath = '';
      if (item.restoring) item.restoring.lease.write(String(Math.min(1, Math.max(0, item.restoring.sampler.sample(t).value))));
      else if (item.sourcePaint && item.sourceLease) item.sourceLease.write(String(Math.min(1, Math.max(0, item.sourcePaint.sample(t).value))));
      if (item.clipLease && item.revealClip) item.clipLease.write(`inset(${item.revealClip.map(sampler => `${Math.max(0, sampler.sample(t).value)}px`).join(' ')})`);
      if (item.destinationLease && item.crossfadeAt !== undefined) item.destinationLease.write(String(Math.min(1, Math.max(0, (1 - item.repOpacity.sample(t).value) * item.destinationLease.stableNumber))));
      this.host.diagnose({ type: 'frame', transaction: this.transaction, t, participant: item.key, x: x.value, y: y.value, width: w.value, height: h.value, vx: x.velocity, vy: y.velocity, ...(corners ? { radius: corners } : {}), ...(clip ? { clip } : {}) });
    }
    const now = this.host.clock.now();
    for (const rep of this.representations()) rep.handle?.write(now);
    this.driveNative(t);
    if (this.renderAt !== undefined) {
      const since = this.host.clock.now() - this.renderAt;
      for (const item of this.incoming) {
        const at = item.anchor === 'render' ? since : t;
        // Paint obligation for the whole track: interactive/focused incoming content never paints below stable.
        const floor = item.control || this.paintKept(item.node, 'surface') ? item.stable : 0;
        item.lease?.write(String(Math.min(1, Math.max(floor, item.opacity.sample(at).value))));
        if (item.motion) writeMotion(item.motion, at);
      }
    }
  }
  // -------------------------------------------------------------------------- render checkpoints
  /** Value handoff at `beforeRemoval`: actual (possibly pinned/settled) track state + last sampled geometry only. */
  beforeRemoval(owner: object): void {
    if (this.phase !== 'playing' || owner !== this.source) return;
    const t = this.elapsed();
    for (const out of this.outgoing) this.reveal(out, t);
    // The source's business owner retires now: live representations keep their frame or transfer render authority.
    for (const item of this.shared) if (item.source && owner === this.source) { item.rep.handle?.retire(); item.sourceLease?.abandon(); item.sourceLease = undefined; }
  }
  /**
   * S2 managed removal checkpoint (from a `<Presence>` boundary whose committed state removed these nodes; Svelte
   * has not yet removed them). Outgoing participants are revealed and retired while still connected, from fresh
   * samples; shared sources hand their live representations over. Not called for throwing/no-op commits or
   * retained participants, so no premature semantic, input or business revocation occurs.
   */
  participantsRemoving(nodes: readonly HTMLElement[]): void {
    if (this.phase !== 'playing') return;
    const t = this.elapsed();
    const leaving = (node: HTMLElement) => nodes.some(candidate => candidate === node || candidate.contains(node));
    for (const out of this.outgoing) {
      if (out.revealed || !leaving(out.node) || !out.node.isConnected) continue;
      out.rect = out.node.getBoundingClientRect(); out.sampleAt = t; out.sampledMotion = out.motion ? [...out.motion.written] : undefined; if (out.motion) this.sampleMotionFrame(out); out.ancestorOpacity = this.foreignAncestorOpacity(out.node); out.clip = sampleClip(out.node);
      { const svgGraphic = out.node.namespaceURI === 'http://www.w3.org/2000/svg' && out.node.localName !== 'svg'; const linear = svgGraphic ? [1, 0, 0, 1] as const : accumulatedLinear(out.node); out.linear = linear; out.size = linear && !axisAligned(linear) ? layoutSize(out.node) : undefined; out.scale = linear ? (axisAligned(linear) ? [linear[0], linear[3]] : [1, 1]) : undefined; }
      this.reveal(out, t);
    }
    for (const item of this.shared) if (item.source && leaving(item.source)) item.rep.handle?.retire();
  }
  /** The copy root already carries the participant's own opacity (stable or foreign displayed): apply the track relatively. */
  /**
   * Slide/scale leases for a real incoming or outgoing element, composed with its stable computed values.
   * Incoming: from the declared offset/factor to stable. Outgoing: from stable to the declared offset/factor;
   * a `held` (control) element keeps its stable transform before commit (hold-then-move, as hold-then-fade:
   * the control stays where it is targeted and focused), and its copy moves after reveal. Foreign leases and
   * non-2D-px translate or non-uniform scale are skipped with `slideSkipped:`/`scaleSkipped:` diagnostics.
   */
  /**
   * R1/R2: at sampling, record how the node's LOCAL slide delta maps to the viewport (its ancestors' linear map:
   * CSS `translate` applies in the parent's coordinate system) and where its transform-origin sits in its box, so the
   * copy continues the same trajectory after removal.
   */
  private sampleMotionFrame(out: OutgoingItem): void {
    const parent = out.node.parentElement;
    out.sampledAncestors = parent ? accumulatedLinear(parent) : [1, 0, 0, 1];
    if (!out.sampledAncestors && out.motion?.translate) this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: out.key, reason: 'slideCopyUnmapped:nonAffineAncestor' });
    const style = this.host.win.getComputedStyle(out.node);
    const [ox, oy] = style.transformOrigin.split(/\s+/).map(part => Number.parseFloat(part));
    const width = out.node.offsetWidth || 0, height = out.node.offsetHeight || 0;
    out.sampledOrigin = width > 0 && height > 0 && Number.isFinite(ox) && Number.isFinite(oy) ? [ox! / width, oy! / height] : [0.5, 0.5];
  }
  /**
   * R3: the stable base of a transform property when the stable projection has no inline value: the style UNDER any
   * live inline write (a predecessor's displayed value must not become this run's base). Read by momentarily
   * removing the inline declaration (synchronous; no paint in between).
   */
  private underlying(node: HTMLElement, property: 'translate' | 'scale'): string {
    const inline = node.style.getPropertyValue(property);
    if (!inline) return this.host.win.getComputedStyle(node).getPropertyValue(property);
    const priority = node.style.getPropertyPriority(property);
    node.style.removeProperty(property);
    const value = this.host.win.getComputedStyle(node).getPropertyValue(property);
    node.style.setProperty(property, inline, priority);
    return value;
  }
  /** A transform lease for this run; a conflicting earlier run yields the node and this run succeeds its lease. */
  /** Transform leases handed over by a whole-run predecessor (succeeded, un-restored), consumed by `transformLease`. */
  private readonly adoptedTransforms = new Map<HTMLElement, { translate?: OutgoingAdoption['translate']; scale?: OutgoingAdoption['scale'] }>();
  /** Resting transform channels this run adopted (displayed delta/factor and the node's true base). */
  private readonly restingTransforms = new Map<HTMLElement, { translate?: { value: readonly [number, number]; base: readonly [number, number] }; scale?: { value: number; base: number } }>();
  private transformLease(node: HTMLElement, property: 'translate' | 'scale'): ChoreographyLease | { readonly foreign: string } {
    const alive = () => this.phase !== 'settled';
    // Whole-run successor: the predecessor's active transform (already succeeded, un-restored) continues from its
    // displayed value — the same continuation as a partial arbitration yield.
    const adopted = this.adoptedTransforms.get(node);
    const inherited = adopted?.[property];
    if (adopted && inherited) {
      const record = this.restingTransforms.get(node) ?? {};
      (record as Record<string, unknown>)[property] = { value: inherited.value, base: inherited.base };
      this.restingTransforms.set(node, record);
      adopted[property] = undefined;
      return inherited.lease;
    }
    const resting = this.host.takeRetained?.(node, property);
    if (resting) { const record = this.restingTransforms.get(node) ?? {}; (record as Record<string, unknown>)[property] = { value: resting.displayed, base: resting.base }; this.restingTransforms.set(node, record); }
    let acquired = acquireChoreographyLease(this.host.root, node, property, alive, { holder: this });
    resting?.retire();
    if ('foreign' in acquired && acquired.foreign === 'choreography' && acquired.holder && acquired.holder !== this) {
      if (!yieldedTransforms.get(node)?.[property]) { const paint = yieldFrom(acquired.holder, node) ?? this.host.arbitrate?.(node, acquired.holder); if (paint) { const lease = this.succeed(paint); lease?.release(); } }
      const previous = yieldedTransforms.get(node)?.[property];
      if (previous) {
        acquired = acquireChoreographyLease(this.host.root, node, property, alive, { holder: this, successorOf: previous });
        previous.release(); // superseded: retires without a restoring write
        const handed = yieldedTransforms.get(node); if (handed) handed[property] = undefined;
        // Adopt the displayed transform of the conflicting writer we succeed (no reset to the declared from).
        const shown = yieldedTransformPose.get(node)?.[property];
        if (shown) { const record = this.restingTransforms.get(node) ?? {}; (record as Record<string, unknown>)[property] = shown; this.restingTransforms.set(node, record); delete yieldedTransformPose.get(node)![property]; }
      }
    }
    return acquired;
  }
  private transformMotion(node: HTMLElement, track: ChoreographyTrack, side: 'incoming' | 'outgoing', held: boolean): TransformMotion | undefined {
    const dx = track.slide?.dx ?? 0, dy = track.slide?.dy ?? 0, scale = track.scale;
    const scales = !!scale && (scale.from !== 1 || scale.to !== 1);
    if (!dx && !dy && !scales) return undefined;
    const easing = channelEasing(track.easing, side === 'incoming' ? 'ease-out' : 'linear');
    const tween = (channel: 'x' | 'y' | 'scale', from: number, to: number, identity: number): Sampler => held ? hold(channel, identity)
      : channelTracks.tween(channel, { from, to, startMs: track.startMs, durationMs: track.durationMs, easing });
    const unsupported = (reason: string) => this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: keyOf(track), reason });
    const style = this.host.win.getComputedStyle(node);
    const motion: TransformMotion = { written: [0, 0, 1] };
    if (dx || dy) {
      const moved = this.transformLease(node, 'translate');
      if ('foreign' in moved) unsupported(`slideSkipped:${moved.foreign}`);
      else {
        // Compose with the element's own stable translation (2D px); an unsupported one is preserved.
        const stable = moved.stable || this.underlying(node, 'translate');
        const parts = stable === 'none' || !stable ? ['0px', '0px'] : stable.trim().split(/\s+/);
        const px = parts.map(part => /^-?\d+(\.\d+)?px$/.test(part) ? Number.parseFloat(part) : Number.NaN);
        if (parts.length > 2 || px.some(value => !Number.isFinite(value))) { moved.release(); unsupported('slideSkipped:unsupportedStableTranslate'); }
        else {
          // A resting slide continues from its displayed offset (true base kept); otherwise the declared endpoints.
          const rest = this.restingTransforms.get(node)?.translate;
          const base = rest ? rest.base : [px[0] ?? 0, px[1] ?? 0] as const;
          const [fx, fy] = rest ? rest.value : side === 'incoming' ? [dx, dy] : [0, 0];
          const [tx, ty] = side === 'incoming' ? [0, 0] : [dx, dy];
          motion.translate = { lease: moved, base: [base[0], base[1]], x: tween('x', fx, tx, 0), y: tween('y', fy, ty, 0) };
        }
      }
    }
    if (scale && scales) {
      // `scale` is arbitrated like `translate` (a ChoreographyProperty of its own).
      const scaled = this.transformLease(node, 'scale');
      if ('foreign' in scaled) unsupported(`scaleSkipped:${scaled.foreign}`);
      else {
        const stable = scaled.stable || this.underlying(node, 'scale');
        const parts = stable === 'none' || !stable ? ['1'] : stable.trim().split(/\s+/);
        const values = parts.map(part => /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(part) ? Number(part) : Number.NaN);
        const uniform = values.length <= 2 && values.every(value => Number.isFinite(value) && value === values[0]) && values[0]! > 0;
        const rest = this.restingTransforms.get(node)?.scale;
        if (rest) motion.scale = { lease: scaled, base: rest.base, factor: tween('scale', rest.value, scale.to, 1) }; // continue from the displayed factor
        else if (!uniform) { scaled.release(); unsupported('scaleSkipped:unsupportedStableScale'); }
        else motion.scale = { lease: scaled, base: values[0]!, factor: tween('scale', scale.from, scale.to, 1) };
      }
    }
    return motion.translate || motion.scale ? motion : undefined;
  }
  /** A node that becomes a control (or focus-pinned) before commit returns to its stable transform within the focus bound. */
  private returnMotion(out: OutgoingItem, t: number): void {
    const motion = out.motion;
    if (!motion) return;
    if (motion.translate) { motion.translate.x = continueFrom('x', motion.translate.x, t, 0, VISUAL_DEFAULTS.focusSettleMs); motion.translate.y = continueFrom('y', motion.translate.y, t, 0, VISUAL_DEFAULTS.focusSettleMs); }
    if (motion.scale) motion.scale.factor = continueFrom('scale', motion.scale.factor, t, 1, VISUAL_DEFAULTS.focusSettleMs);
  }
  /**
   * The outgoing copy continues the node's motion after reveal, relative to the motion painted when its rect was
   * sampled (the copy's placement already includes it): translate by the offset change (viewport px) and scale by
   * the factor ratio about the painted centre (the axis-aligned wrapper's origin is its top-left corner).
   */
  private moveCopy(out: OutgoingItem, t: number): void {
    const wrapper = out.rep?.wrapper;
    if (!wrapper) return;
    const centred = !!(out.linear && out.size && !axisAligned(out.linear));
    const [tx, ty, ratio] = copyMotion(out, t, !centred);
    wrapper.style.translate = tx || ty || ratio !== 1 ? `${tx}px ${ty}px` : '';
    wrapper.style.scale = ratio !== 1 ? String(ratio) : '';
  }
  private relative(out: OutgoingItem, value: number): number {
    const own = out.displayedOpacity ?? out.stable;
    return own > 0 ? Math.min(1, value / own) : 0;
  }
  /** Value handoff for one outgoing participant (route beforeRemoval, or within-page pre-paint removal). */
  private reveal(out: OutgoingItem, t: number): void {
    {
      if (out.revealed) return;
      out.revealed = true;
      out.observer?.();
      if (!out.rep || !out.rect || !out.scale) { dropRep(out.rep); out.rep = undefined; this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: out.key, reason: out.scale ? 'noSample' : 'unsupportedTransform' }); return; }
      const age = t - out.sampleAt;
      if (age > VISUAL_DEFAULTS.staleSampleMs) this.host.diagnose({ type: 'staleSample', transaction: this.transaction, participant: out.key, age });
      const value = Math.min(1, Math.max(0, out.opacity.sample(t).value));
      const [sx, sy] = out.scale;
      if (out.linear && out.size && !axisAligned(out.linear)) {
        // Rotated/skewed space: the layout box centred on the painted centre, with the exact 2D matrix.
        const placed = affinePlacement(out.rect, out.size, out.linear);
        for (const declaration of placed.split(';')) { const [name, value] = declaration.split(':'); if (name && value) out.rep.wrapper.style.setProperty(name, value); }
      } else {
        out.rep.wrapper.style.left = `${out.rect.x}px`; out.rep.wrapper.style.top = `${out.rect.y}px`;
        out.rep.wrapper.style.width = `${out.rect.width / sx}px`; out.rep.wrapper.style.height = `${out.rect.height / sy}px`;
        out.rep.wrapper.style.transformOrigin = '0 0'; out.rep.wrapper.style.transform = sx !== 1 || sy !== 1 ? `scale(${sx}, ${sy})` : '';
      }
      out.rep.wrapper.style.opacity = String(this.relative(out, value) * out.ancestorOpacity);
      out.rep.wrapper.style.clipPath = out.clip?.polygon ? localPolygon(out.clip.polygon, out.rect, out.linear, out.size, out.scale) : out.clip ? insetCss(clipInset(out.rect, out.clip, out.scale), out.clip.radius) : '';
      out.rep.handle?.retire();
      if (out.displayedOpacity !== undefined && out.rep.copyRoot) out.rep.copyRoot.style.opacity = String(out.displayedOpacity);
      // Controls (and pinned focus) play their remainder, or the documented post-reveal fade, on the copy.
      if (out.control || out.pinned) {
        const to = (out.track.opacity?.to ?? 0) * out.stable;
        const end = out.track.startMs + out.track.durationMs;
        const displayed: Sampler = { endMs: t, constrained: false, sample: () => ({ value, velocity: 0 }) };
        if (out.track.startMs > t) {
          // The remainder of the declared track: hold the displayed value until startMs, then fade to `to` by its original end.
          const start = out.track.startMs;
          out.opacity = chain({ endMs: start, constrained: false, sample: () => ({ value, velocity: 0 }) }, channelTracks.tween('opacity', { from: value, to, startMs: start, durationMs: Math.max(1, out.track.durationMs), easing: channelEasing(out.track.easing, 'linear') }));
        } else out.opacity = continueFrom('opacity', displayed, t, to, end > t ? end - t : VISUAL_DEFAULTS.postRevealFadeMs);
      }
      if (out.motion) {
        // Held (control) motion starts on the copy: continue from the displayed values to the declared end.
        const end = out.track.startMs + out.track.durationMs;
        const motion = out.motion;
        const held = out.control || out.pinned;
        if (held && t > out.track.startMs) {
          const span = Math.max(VISUAL_DEFAULTS.minimumRetargetMs, end - t);
          if (motion.translate) { motion.translate.x = continueFrom('x', motion.translate.x, t, out.track.slide?.dx ?? 0, span); motion.translate.y = continueFrom('y', motion.translate.y, t, out.track.slide?.dy ?? 0, span); }
          if (motion.scale) motion.scale.factor = continueFrom('scale', motion.scale.factor, t, out.track.scale?.to ?? 1, span);
        } else if (held) {
          const easing = channelEasing(out.track.easing, 'linear');
          if (motion.translate) { motion.translate.x = channelTracks.tween('x', { from: 0, to: out.track.slide?.dx ?? 0, startMs: out.track.startMs, durationMs: out.track.durationMs, easing }); motion.translate.y = channelTracks.tween('y', { from: 0, to: out.track.slide?.dy ?? 0, startMs: out.track.startMs, durationMs: out.track.durationMs, easing }); }
          if (motion.scale) motion.scale.factor = channelTracks.tween('scale', { from: 1, to: out.track.scale?.to ?? 1, startMs: out.track.startMs, durationMs: out.track.durationMs, easing });
        }
        // The real node leaves: its transform leases retire without a restoring write, like its paint lease.
        motion.translate?.lease.abandon(); motion.scale?.lease.abandon();
        this.moveCopy(out, t);
      }
      // The real node leaves in this same flush: retire its lease without any restoring write.
      out.lease?.abandon();
      this.host.diagnose({ type: 'reveal', transaction: this.transaction, participant: out.key, t, opacity: value, rect: rectOf(out.rect), sampleAge: age });
    }
  }
  rendered(owner: object): void {
    if (this.phase !== 'playing' || !this.reserved || owner === this.source) return;
    this.destinationOwner = owner;
    this.renderAt = this.host.clock.now();
    this.decideAmbiguity([...this.batch, ...this.early]);
    this.flushDestinations(); // the render checkpoint admits this flush's registrations now
    // Registrations that arrived before the destination owner was known are reconciled against it now.
    const early = this.early; this.early = [];
    for (const entry of early) if (entry.node.isConnected) this.registered(entry);
  }
  /**
   * Registration precedes first paint: incoming initial pose and destination suppression are written now.
   * Destinations match exactly (design §3a): the committed destination owner for plain keys (route runs), the
   * run's scope (local runs), or the bound overlay instance for scoped selectors — never another owner's
   * same-key participant. A second candidate for one track is an ambiguity: the first acquisition is rolled
   * back before paint and the track is reported, not guessed.
   */
  registered(entry: Participant, admitted = false): void {
    if (this.phase !== 'playing' || !this.reserved) return;
    if (!admitted) {
      // Every destination registration (route, local, overlay) joins a batch: uniqueness is decided synchronously
      // HERE, before anything is acquired or arbitrated; acquisition follows at the batch checkpoint (a pre-paint
      // microtask, or the route's `rendered()`), so an ambiguous candidate never yields another run's node.
      if (this.local && this.initialNodes.has(entry.node)) return;
      if (!this.local && entry.owner === this.source) return;
      // Deferred: overlay roles (a flush's registrations together), and any candidate another run animates (its
      // arbitration is irreversible). Unheld candidates are admitted at once (a later rollback only restores).
      const contested = hasChoreographyLease(entry.node) && !this.holds(entry.node);
      if (this.options.overlayRoles || contested || this.batch.length) {
        this.batch.push(entry);
        this.decideAmbiguity(this.batch);
        if (this.batch.length === 1) queueMicrotask(() => this.flushDestinations());
        return;
      }
    }
    if (this.local && this.initialNodes.has(entry.node)) return;
    if (!this.local && entry.owner === this.source) return;
    for (const track of this.plan.tracks) {
      if (track.side === 'outgoing' || this.ambiguousDestinations.has(track)) continue;
      const destination = this.destinationOf(track);
      if (destination.unresolved || destination.key !== entry.key) continue;
      if (!destination.scoped && !this.local && this.destinationOwner === undefined) { if (!this.early.includes(entry)) this.early.push(entry); continue; }
      if (entry.owner !== destination.owner) continue;
      if (track.side === 'incoming') {
        const existing = this.incoming.find(item => item.track === track);
        if (existing && existing.node !== entry.node) { this.ambiguous(track); continue; }
        if (existing) continue;
        const opacity = track.opacity ?? { from: 0, to: 1 };
        // A handed-over (reopen) or arbitrated (cross-run) paint continues from its displayed value: no reset jump.
        const inherited = this.adoptedOutgoing.get(entry.node);
        if (inherited) this.adoptedOutgoing.delete(entry.node);
        const acquired = inherited?.lease ?? this.lease(entry.node);
        const lease = 'foreign' in acquired ? undefined : acquired;
        const shown = inherited ? inherited.displayed : lease ? this.adoptedPaint.get(entry.node) : undefined;
        this.adoptedPaint.delete(entry.node);
        // Overlay roles are hidden by their presenting state (inline opacity 0); their stable paint is visible.
        const stable = this.options.overlayRoles?.has(entry.node) ? 1 : lease ? (this.restingStable.get(entry.node) ?? lease.stableNumber) : 1;
        const anchor = track.anchor ?? 'render';
        // Controls enter visibly usable: no paint reduction below stable for interactive destinations.
        const from = this.paintKept(entry.node, entry.role) ? stable : shown ?? opacity.from * stable;
        lease?.write(String(from));
        const easing = channelEasing(track.easing, 'ease-out');
        const motion = this.transformMotion(entry.node, track, 'incoming', false);
        if (motion) writeMotion(motion, Number.NEGATIVE_INFINITY);
        const sampler = shown !== undefined && !this.paintKept(entry.node, entry.role)
          ? continueFrom('opacity', hold('opacity', shown), track.startMs, opacity.to * stable, Math.max(1, track.durationMs))
          : channelTracks.tween('opacity', { from, to: opacity.to * stable, startMs: track.startMs, durationMs: track.durationMs, easing });
        this.incoming.push({ track, node: entry.node, lease, stable, anchor, motion, control: this.paintKept(entry.node, entry.role), opacity: sampler });
      }
      if (track.side === 'shared') {
        const item = this.shared.find(candidate => candidate.track === track);
        if (item?.destination && item.destination !== entry.node && item.destination !== item.source) { this.ambiguous(track); continue; }
        if (item && !item.destination) {
          item.destination = entry.node;
          const reach = homeInLayer(item.rep, entry.node);
          if (reach.startsWith('unreachable')) { this.settleUnreachable(item, reach); continue; }
          item.destinationControl = keepsPaint(entry.node, entry.role);
          if (!item.destinationControl) {
            const acquired = this.lease(entry.node);
            if ('foreign' in acquired) { item.destinationControl = true; this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: item.key, reason: `destination:${acquired.foreign}` }); }
            else { item.destinationLease = acquired; acquired.write('0'); }
          }
        }
      }
    }
  }
  /** Destination ambiguity: roll back what this track acquired for its destination and report it once. */
  private ambiguous(track: ChoreographyTrack): void {
    this.ambiguousDestinations.add(track);
    for (const item of [...this.incoming]) if (item.track === track) { item.lease?.release(); item.motion?.translate?.lease.release(); item.motion?.scale?.lease.release(); this.incoming.splice(this.incoming.indexOf(item), 1); }
    const shared = this.shared.find(candidate => candidate.track === track);
    if (shared?.destination) { shared.destinationLease?.release(); shared.destinationLease = undefined; shared.destination = undefined; shared.destinationControl = false; }
    this.host.diagnose({ type: 'unsupported', transaction: this.transaction, participant: keyOf(track), reason: 'destinationAmbiguous' });
  }

  /** Scroll/reflow rebase: remeasure committed destinations next frame and retarget from displayed state. */
  rebase(): void {
    if (this.phase !== 'playing') return;
    for (const item of this.shared) {
      if (this.committed && item.destination) item.measured = false;
      if ((item.track.path ?? []).some(waypoint => waypoint.pose.relativeTo === 'viewport')) item.replan = true;
    }
  }
  /**
   * Re-resolve future viewport-relative waypoints after a viewport change. Source-relative poses keep the
   * original source basis captured at preparation (pre-commit source movement is carried by the followed
   * offset; post-commit movement of the same node is the new layout, not a source move). The re-plan never
   * starts before the track's `startMs`: before then the existing plan (holding the source) applies.
   */
  private replan(item: SharedItem, t: number): void {
    const at = Math.max(t, item.track.startMs);
    const future = (item.track.path ?? []).filter(waypoint => waypoint.atMs > at);
    if (!future.some(waypoint => waypoint.pose.relativeTo === 'viewport')) return;
    const basis = item.sourceRect;
    const shown = this.displayedState(item, t);
    let target: readonly [number, number, number, number] = basis;
    GEOMETRY.forEach((channel, index) => {
      const points = future.map(waypoint => ({ atMs: waypoint.atMs, value: poseRect(waypoint.pose, basis, this.host.win)[index]!, easing: easingOf(waypoint) }));
      const head = continueFrom(channel, item.geo[channel], at, points[0]!.value, Math.max(1, points[0]!.atMs - at));
      item.geo[channel] = points.length > 1 ? chain(head, piecewise(channel, points[0]!.value, points[0]!.atMs, points.slice(1), item.track.easing)) : head;
    });
    target = poseRect(future[0]!.pose, basis, this.host.win);
    this.host.diagnose({ type: 'retarget', transaction: this.transaction, participant: item.key, t, cause: 'replan', from: [shown.displayed.x.value, shown.displayed.y.value, shown.displayed.width.value, shown.displayed.height.value], velocity: [shown.displayed.x.velocity, shown.displayed.y.velocity, shown.displayed.width.velocity, shown.displayed.height.velocity], to: target, constrained: false });
  }
  /**
   * Paint obligations throughout the handoff: whichever lease currently suppresses the real node (source
   * before commit, or the same node as local destination) is restored within the focus-settle bound as
   * soon as the node is interactive or visibly focused; the conflicting decoration fades.
   */
  private enforcePaint(item: SharedItem, t: number): void {
    if (item.restoring) return;
    // Whichever lease currently owns the real node (source before commit, or the same node as destination).
    const lease = item.sourceLease ?? item.destinationLease;
    if (!lease || !lease.node.isConnected) return;
    const suppressedNow = Number.parseFloat(lease.node.style.opacity || '1') < lease.stableNumber - 1e-6 && item.crossfadeAt === undefined;
    if (!suppressedNow || !keepsPaint(lease.node, 'surface')) return;
    const current = Number.parseFloat(lease.node.style.opacity || '0') || 0;
    // Real interactive content is usable and visibly painted immediately; a visible-focus arrival on
    // otherwise decorative content settles within the focus bound.
    let interactive = false;
    try { interactive = lease.node.matches(FOCUSABLE) || !!lease.node.querySelector(FOCUSABLE); } catch { interactive = true; }
    item.restoring = { lease, sampler: interactive ? hold('opacity', lease.stableNumber, t) : channelTracks.tween('opacity', { from: Math.min(current, lease.stableNumber), to: lease.stableNumber, startMs: t, durationMs: VISUAL_DEFAULTS.focusSettleMs, easing: 'linear' }) };
    if (interactive) lease.write(String(lease.stableNumber));
    item.sourcePaint = undefined;
    if (lease === item.destinationLease) item.destinationControl = true;
    item.repOpacity = continueFrom('opacity', item.repOpacity, t, 0, VISUAL_DEFAULTS.focusSettleMs);
    this.host.diagnose({ type: 'focusPinned', transaction: this.transaction, participant: item.key, t });
  }
  renderFailed(owner: object): void { if (owner === this.source || owner === this.destinationOwner || (this.reserved && this.phase === 'playing')) this.settle('failed'); }
  lifecycle(event: { readonly type: 'commitReserved'; readonly transaction: TransactionId } | { readonly type: 'terminal'; readonly transaction: TransactionId; readonly outcome: TransactionOutcome }): void {
    if (event.transaction !== this.transaction) return;
    if (event.type === 'commitReserved') { this.reserved = true; return; }
    const outcome = event.outcome;
    if (outcome.type === 'committed' && outcome.route === 'accepted') { this.committed = true; return; }
    if (outcome.type === 'superseded') return; // The successor adopts displayed poses (see handOff).
    if (outcome.type === 'committed') { this.settle('redirected'); return; }
    this.beginReturn();
  }
  /** Returning the still-current page from the displayed poses, bounded by the run's visual deadline. */
  private beginReturn(): void {
    if (this.phase !== 'playing') { this.settle('returned'); return; }
    if (this.media?.matches) { this.settle('returned'); return; }
    const t = this.elapsed();
    const deadline = this.plan.durationMs + VISUAL_DEFAULTS.visualSlackMs;
    this.phase = 'returning';
    this.returnEnd = Math.min(deadline, t + VISUAL_DEFAULTS.returnMs);
    for (const item of this.shared) item.measured = false;
    for (const out of this.outgoing) if (!out.revealed) out.opacity = continueFrom('opacity', out.opacity, t, out.stable, Math.max(1, this.returnEnd - t));
    if (this.frameHandle === undefined) this.frameHandle = this.host.clock.frame(() => this.tick());
  }
  /** Supersession: shared representations transfer (with displayed pose/velocity) to the successor. */
  /** Hand an item's active transform leases off with their displayed values (they leave this run un-restored). */
  private handTransformsOff(motion: TransformMotion | undefined): Pick<OutgoingAdoption, 'translate' | 'scale'> {
    if (!motion) return {};
    const handed: { translate?: OutgoingAdoption['translate']; scale?: OutgoingAdoption['scale'] } = {};
    if (motion.translate) { handed.translate = { lease: motion.translate.lease, value: [motion.written[0], motion.written[1]], base: motion.translate.base }; motion.translate = undefined; }
    if (motion.scale) { handed.scale = { lease: motion.scale.lease, value: motion.written[2], base: motion.scale.base }; motion.scale = undefined; }
    return handed;
  }
  handOff(): { readonly shared: Adoption[]; readonly outgoing: Map<HTMLElement, OutgoingAdoption>; readonly native?: NativeAdoption } {
    const outgoing = new Map<HTMLElement, OutgoingAdoption>();
    if (this.phase !== 'playing') return { shared: [], outgoing };
    const t = this.elapsed();
    for (const out of this.outgoing) {
      if (out.revealed || !out.lease || !out.node.isConnected) continue;
      outgoing.set(out.node, { lease: out.lease, displayed: Math.min(1, Math.max(0, out.opacity.sample(t).value)), ...this.handTransformsOff(out.motion) });
      (out as { lease: ChoreographyLease | undefined }).lease = undefined;
    }
    // Incoming paint is handed over with its displayed value too (a close superseding an open continues from it).
    for (const item of this.incoming) {
      if (!item.lease || !item.node.isConnected || outgoing.has(item.node)) continue;
      const shown = Number.parseFloat(item.node.style.opacity);
      outgoing.set(item.node, { lease: item.lease, displayed: Math.min(1, Math.max(0, Number.isFinite(shown) ? shown : item.stable)), ...this.handTransformsOff(item.motion) });
      (item as { lease: ChoreographyLease | undefined }).lease = undefined;
    }
    const adoptions = this.shared.map(item => {
      // Everything not transferred is cleaned up here: observers, drivers, destination/clip leases.
      item.unobserve?.(); item.unobserve = undefined;
      const shown = this.displayedState(item, t);
      this.disposeDriver(item, t);
      const movedLease = item.sourceLease ?? (item.destination && item.destination === item.source ? item.destinationLease : undefined);
      if (item.destinationLease && item.destinationLease !== movedLease) item.destinationLease.release();
      item.clipLease?.release();
      return {
      key: item.key, scopedOwner: this.scopedOwnerOf(item.track), rep: item.rep, sourceLease: movedLease, source: item.source ?? item.destination, ...shown,
      ancestorOpacity: item.ancestorOpacity, stable: item.stable, suppressed: item.suppressed, nested: item.nested
    }; });
    this.shared.length = 0;
    const session = this.nativeSession;
    if (session?.live && this.nativeBindings.some(binding => binding.shared)) {
      this.nativeSession = undefined;
      return { shared: adoptions, outgoing, native: { session, keys: this.nativeBindings.map(binding => binding.shared?.key) } satisfies NativeAdoption };
    }
    return { shared: adoptions, outgoing };
  }
  settle(reason: SettleReason): void {
    if (this.phase === 'settled') return;
    const t = this.elapsed();
    // Handed leases no successor took are released normally (restoring the stable value), never left dead.
    for (const node of this.handedNodes) {
      const handed = yieldedTransforms.get(node);
      for (const property of ['translate', 'scale', 'clip-path'] as const) { const lease = handed?.[property]; if (lease && lease.holder === this) { handed![property] = undefined; lease.release(); } }
    }
    this.handedNodes.clear();
    this.phase = 'settled';
    if (this.frameHandle !== undefined) this.host.clock.cancelFrame(this.frameHandle);
    for (const timer of this.timers) this.host.clock.clearTimeout(timer);
    this.media?.removeEventListener('change', this.onMedia);
    this.resize.stop();
    const finish = (lease: ChoreographyLease | undefined) => { if (!lease) return; if (lease.node.isConnected) lease.release(); else lease.abandon(); };
    for (const { lease } of this.adoptedOutgoing.values()) finish(lease);
    for (const { translate, scale } of this.adoptedTransforms.values()) { finish(translate?.lease); finish(scale?.lease); }
    this.adoptedTransforms.clear();
    this.adoptedOutgoing.clear();
    // Early terminal before enrollment: adopted shared representations/leases are released exactly once.
    for (const adoption of this.adopted) {
      if (this.enrolled.has(adoption)) continue;
      this.enrolled.add(adoption);
      dropRep(adoption.rep);
      finish(adoption.sourceLease);
    }
    if (this.nativeSession && this.nativeSession.owner === this) this.nativeSession.end();
    this.nativeSession = undefined;
    if (this.nativeAdopted) { this.nativeAdopted.session.end(); this.nativeAdopted = undefined; }
    for (const entry of this.pending) { entry.stop(); entry.capture.abandon(); }
    this.pending = [];
    for (const read of this.pendingReads) if (read.capture.kind === 'captured') read.capture.handle.dispose();
    this.pendingReads = [];
    for (const out of this.outgoing) {
      out.observer?.(); dropRep(out.rep);
      // Overlay-lifetime resting reaction: a completed, still-mounted reaction keeps its terminal values (held by the Host).
      if (reason === 'completed' && out.track.lifetime === 'overlay' && !out.revealed && out.node.isConnected && this.options.retain) {
        const pose: RestingPose = {};
        if (out.lease) pose.opacity = { value: Number.parseFloat(out.node.style.opacity), base: this.restingStable.get(out.node) ?? out.stable, lease: out.lease };
        if (out.motion?.translate) pose.translate = { value: [out.motion.written[0], out.motion.written[1]], base: out.motion.translate.base, lease: out.motion.translate.lease };
        if (out.motion?.scale) pose.scale = { value: out.motion.written[2], base: out.motion.scale.base, lease: out.motion.scale.lease };
        if (Object.keys(pose).length && this.options.retain(out.node, pose, this.sourceOf(out.track).owner)) continue;
      }
      finish(out.lease); finish(out.motion?.translate?.lease); finish(out.motion?.scale?.lease);
    }
    for (const item of this.shared) {
      item.unobserve?.(); dropRep(item.rep); finish(item.sourceLease); finish(item.destinationLease); finish(item.clipLease);
      this.disposeDriver(item, t);
    }
    for (const item of this.incoming) { finish(item.lease); finish(item.motion?.translate?.lease); finish(item.motion?.scale?.lease); }
    this.host.releasePlane();
    this.host.diagnose({ type: 'settled', transaction: this.transaction, reason, t });
    this.done();
    if (!this.local && (reason === 'reducedMotion' || reason === 'failed' || reason === 'timeout' || reason === 'unsupported' || reason === 'planeDisposed' || reason === 'completed'))
      this.host.visualTerminal(this.transaction, reason as VisualTerminalReason);
  }
}
const cornersOf = (value: Corners): readonly [number, number, number, number] => typeof value === 'number' ? [value, value, value, value] : value;
const CORNERS = ['radiusTopLeft', 'radiusTopRight', 'radiusBottomRight', 'radiusBottomLeft'] as const;
const INSETS = ['clipTop', 'clipRight', 'clipBottom', 'clipLeft'] as const;
const hasText = (node: Node): boolean => { for (const child of node.childNodes) { if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) return true; if (hasText(child)) return true; } return false; };
/**
 * The copy's motion since its rect was sampled: [tx, ty, ratio]. With a top-left origin (`corner`), tx/ty include the
 * compensation that keeps the scale about the painted centre.
 */
function copyMotion(out: OutgoingItem, t: number, corner: boolean): readonly [number, number, number] {
  const motion = out.motion, rect = out.rect;
  if (!motion || !rect) return [0, 0, 1];
  const [dx0, dy0, f0] = out.sampledMotion ?? [0, 0, 1];
  const lx = motion.translate ? motion.translate.x.sample(t).value - dx0 : 0;
  const ly = motion.translate ? motion.translate.y.sample(t).value - dy0 : 0;
  // R1: the local delta maps to the viewport through the ancestors' linear map (unmapped: no copy translation).
  const m = out.sampledAncestors;
  const dx = m ? m[0] * lx + m[2] * ly : 0, dy = m ? m[1] * lx + m[3] * ly : 0;
  const ratio = motion.scale && f0 > 0 ? Math.max(0, motion.scale.factor.sample(t).value) / f0 : 1;
  // R2: the copy scales about the node's own transform-origin (as a fraction of its box), like the real node.
  const [fx, fy] = out.sampledOrigin ?? [0.5, 0.5];
  if (corner) return [dx + rect.width * fx * (1 - ratio), dy + rect.height * fy * (1 - ratio), ratio];
  // R6: a rotated/skewed copy scales about its centre; the node scales about its origin, a fixed point of its own
  // transform. Shift by (1 - ratio) x the origin's offset from the centre, mapped by the accumulated linear map.
  if (!out.linear || !out.size) return [dx, dy, ratio];
  const [a, b, c, d] = out.linear, ox = (fx - 0.5) * out.size[0], oy = (fy - 0.5) * out.size[1];
  return [dx + (1 - ratio) * (a * ox + c * oy), dy + (1 - ratio) * (b * ox + d * oy), ratio];
}
const motionEnd = (motion: TransformMotion | undefined): number => motion ? Math.max(motion.translate?.x.endMs ?? 0, motion.translate?.y.endMs ?? 0, motion.scale?.factor.endMs ?? 0) : 0;
/** Writes a real element's slide/scale at `at` through its leases (composed with stable values). */
function writeMotion(motion: TransformMotion, at: number): void {
  if (motion.translate) {
    const dx = motion.translate.x.sample(at).value, dy = motion.translate.y.sample(at).value;
    motion.translate.lease.write(`${motion.translate.base[0] + dx}px ${motion.translate.base[1] + dy}px`);
    motion.written[0] = dx; motion.written[1] = dy;
  }
  if (motion.scale) {
    const factor = Math.max(0, motion.scale.factor.sample(at).value);
    motion.scale.lease.write(String(motion.scale.base * factor));
    motion.written[2] = factor;
  }
}
/** Sequential composition: `head` then `tail` (tail begins where head ends). */
function chain(head: Sampler, tail: Sampler): Sampler {
  return { endMs: tail.endMs, get constrained() { return head.constrained || tail.constrained; }, sample: ms => ms < head.endMs ? head.sample(ms) : tail.sample(ms) };
}

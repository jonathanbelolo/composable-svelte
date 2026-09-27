/**
 * The representation service of one visual engine configuration: builds a participant's representation
 * (providers, then structural projection) into the framework's inert wrapper, samples geometry, foreign
 * ancestor appearance and the ancestor clip chain, and owns the representation's lifetime through a
 * handle (frame, retire, dispose). Chunked (route preparation) and synchronous (within-page, recapture).
 */
import { ancestorOpacity } from '../capture-html.js';
import { ProjectionJob, retainPseudoOrder } from './projection.js';
import type { ProjectionCache } from './cache.js';
import { reconstructStack, type StackSample } from './stack.js';
import { canvasProvider, iframeProvider, videoProvider } from './builtins.js';
import type { NativeEntry } from './native-snapshot.js';
import type { ProvidedRepresentation, RepresentationContext, RepresentationProvider, RetainedRenderer, VisualDiagnostic } from './types.js';

/** Viewport-space visible rect imposed by clipping ancestors, with the innermost clipper's inner radius. */
export interface ClipSample { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number; readonly radius: number;
  /** Rotated/skewed clipping ancestors: the exact intersection of their padding-box parallelograms and the axis-aligned chain (viewport space; the rect is its bounds). */
  readonly polygon?: readonly (readonly [number, number])[] | undefined }
const INK = 4096;
/** Intersect every clipping ancestor's padding box (overflow other than visible, or paint containment). */
export function sampleClip(source: Element): ClipSample | undefined {
  const win = source.ownerDocument.defaultView; if (!win) return undefined;
  let top = -Infinity, right = Infinity, bottom = Infinity, left = -Infinity, radius = -1, clipped = false;
  const polygons: [number, number][][] = [];
  // Intersection of the axis-aligned clippers only (the rotated one contributes its polygon).
  const axis = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
  const doc = source.ownerDocument;
  for (let node: Element | null = parentOf(source); node; node = parentOf(node)) {
    if (node === doc.documentElement || node === doc.body) continue; // the viewport is the plane's own space
    const style = win.getComputedStyle(node);
    const contain = style.contain;
    const clips = style.overflowX !== 'visible' || style.overflowY !== 'visible' || /paint|strict|content/.test(contain);
    if (!clips) continue;
    const box = node.getBoundingClientRect();
    const linear = accumulatedLinear(node);
    if (linear && !axisAligned(linear)) {
      // Rotated/skewed clipper: the image of its padding box is a parallelogram centred on its painted centre.
      const [w, h] = layoutSize(node), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const map = (x: number, y: number): [number, number] => { const dx = x - w / 2, dy = y - h / 2; return [cx + linear[0] * dx + linear[2] * dy, cy + linear[1] * dx + linear[3] * dy]; };
      const pl = node.clientLeft, pt = node.clientTop, pw = node.clientWidth, ph = node.clientHeight;
      polygons.push([map(pl, pt), map(pl + pw, pt), map(pl + pw, pt + ph), map(pl, pt + ph)]);
      clipped = true;
      continue;
    }
    // Layout (client) dimensions are unscaled; the painted box may be scaled by transforms on it or its ancestors.
    const layoutWidth = (node as HTMLElement).offsetWidth || node.clientWidth || box.width, layoutHeight = (node as HTMLElement).offsetHeight || node.clientHeight || box.height;
    const sx = layoutWidth ? box.width / layoutWidth : 1, sy = layoutHeight ? box.height / layoutHeight : 1;
    const l = box.left + node.clientLeft * sx, t = box.top + node.clientTop * sy;
    // Axis-specific: overflow-x:visible with overflow-y:auto still clips both (CSS computes visible→auto), keep both.
    left = Math.max(left, l); top = Math.max(top, t); right = Math.min(right, l + node.clientWidth * sx); bottom = Math.min(bottom, t + node.clientHeight * sy);
    axis.left = Math.max(axis.left, l); axis.top = Math.max(axis.top, t); axis.right = Math.min(axis.right, l + node.clientWidth * sx); axis.bottom = Math.min(axis.bottom, t + node.clientHeight * sy);
    if (radius < 0) radius = Math.max(0, (Number.parseFloat(style.borderTopLeftRadius) - Number.parseFloat(style.borderTopWidth) || 0) * Math.min(sx, sy));
    clipped = true;
  }
  // Rotated clippers compose exactly: every parallelogram is convex, so their intersection with each other and with the
  // axis-aligned chain is one convex polygon (only clipper corner radii are not carried by it).
  let polygon: [number, number][] | undefined;
  if (polygons.length) {
    polygon = polygons.slice(1).reduce((subject, clipper) => clipConvex(subject, clipper), polygons[0]!);
    polygon = clipPolygonToRect(polygon, axis);
    if (polygon.length < 3) { left = right = top = bottom = 0; polygon = undefined; }
    else {
      const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
      left = Math.max(left, Math.min(...xs)); top = Math.max(top, Math.min(...ys)); right = Math.min(right, Math.max(...xs)); bottom = Math.min(bottom, Math.max(...ys));
    }
  }
  return clipped ? { top, right, bottom, left, radius: Math.max(0, radius), ...(polygon ? { polygon } : {}) } : undefined;
}
/** Sutherland–Hodgman: a convex polygon clipped by another convex polygon (either winding). */
function clipConvex(subject: readonly (readonly [number, number])[], clipper: readonly (readonly [number, number])[]): [number, number][] {
  let area = 0;
  for (let i = 0; i < clipper.length; i++) { const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area >= 0 ? 1 : -1;
  let out: [number, number][] = subject.map(([x, y]) => [x, y]);
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!;
    const side = (p: readonly [number, number]) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const cross = (p: readonly [number, number], q: readonly [number, number]): [number, number] => { const sp = side(p), sq = side(q), t = sp / (sp - sq); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const current = input[j]!, previous = input[(j + input.length - 1) % input.length]!;
      if (side(current) >= 0) { if (side(previous) < 0) out.push(cross(previous, current)); out.push(current); }
      else if (side(previous) >= 0) out.push(cross(previous, current));
    }
  }
  return out;
}
/** Sutherland–Hodgman: a convex polygon clipped to an axis-aligned rectangle (unbounded edges are ignored). */
function clipPolygonToRect(points: readonly (readonly [number, number])[], rect: { left: number; top: number; right: number; bottom: number }): [number, number][] {
  let out: [number, number][] = points.map(([x, y]) => [x, y]);
  const edge = (inside: (p: readonly [number, number]) => boolean, cross: (a: readonly [number, number], b: readonly [number, number]) => [number, number]) => {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!, previous = input[(i + input.length - 1) % input.length]!;
      if (inside(current)) { if (!inside(previous)) out.push(cross(previous, current)); out.push(current); }
      else if (inside(previous)) out.push(cross(previous, current));
    }
  };
  const atX = (x: number) => (a: readonly [number, number], b: readonly [number, number]): [number, number] => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
  const atY = (y: number) => (a: readonly [number, number], b: readonly [number, number]): [number, number] => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];
  if (Number.isFinite(rect.left)) edge(p => p[0] >= rect.left, atX(rect.left));
  if (Number.isFinite(rect.right)) edge(p => p[0] <= rect.right, atX(rect.right));
  if (Number.isFinite(rect.top)) edge(p => p[1] >= rect.top, atY(rect.top));
  if (Number.isFinite(rect.bottom)) edge(p => p[1] <= rect.bottom, atY(rect.bottom));
  return out;
}
function parentOf(node: Element): Element | null { return node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null); }
/** Wrapper-relative inset for a representation at `rect` (unconstrained edges extend for ink overflow). */
export function clipInset(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, clip: ClipSample, scale: readonly [number, number] = [1, 1]): readonly [number, number, number, number] {
  const [sx, sy] = scale;
  const edge = (value: number, s: number) => (Number.isFinite(value) ? Math.max(value, -INK) : -INK) / s;
  return [edge(clip.top - rect.y, sy), edge(rect.x + rect.width - clip.right, sx), edge(rect.y + rect.height - clip.bottom, sy), edge(clip.left - rect.x, sx)];
}
/** Wrapper-relative polygon clip for a viewport polygon (the wrapper's box at `rect`, unscaled). */
export const polygonCss = (points: readonly (readonly [number, number])[], rect: { readonly x: number; readonly y: number }) => `polygon(${points.map(([x, y]) => `${x - rect.x}px ${y - rect.y}px`).join(', ')})`;
export const insetCss = (inset: readonly number[], radius: number) => `inset(${inset.map(value => `${value}px`).join(' ')}${radius > 0 ? ` round ${radius}px` : ''})`;
/** Is the element entirely clipped away by its ancestors (missing-source fallback)? */
export const fullyClipped = (rect: DOMRectReadOnly, clip: ClipSample | undefined) => !!clip && (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom);

/** 2D linear part [a, b, c, d] (CSS matrix order) of an element's accumulated transforms (own + ancestors). */
export type Linear = readonly [number, number, number, number];
const multiply = (m: Linear, n: Linear): Linear => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3]];
const angle = (text: string): number | undefined => { const m = /^(-?[\d.]+(?:e-?\d+)?)(deg|rad|turn|grad)$/.exec(text); if (!m) return undefined; const v = Number(m[1]); return m[2] === 'deg' ? v * Math.PI / 180 : m[2] === 'rad' ? v : m[2] === 'turn' ? v * 2 * Math.PI : v * Math.PI / 200; };
function elementLinear(style: CSSStyleDeclaration): Linear | undefined {
  let total: Linear = [1, 0, 0, 1];
  if (style.perspective && style.perspective !== 'none') return undefined;
  const rotate = style.rotate;
  if (rotate && rotate !== 'none') {
    const parts = rotate.trim().split(/\s+/);
    const text = parts[parts.length - 1]!;
    const axis = parts.slice(0, -1).join(' ');
    if (axis && axis !== 'z' && axis !== '0 0 1') return undefined;
    const theta = angle(text); if (theta === undefined) return undefined;
    total = multiply(total, [Math.cos(theta), Math.sin(theta), -Math.sin(theta), Math.cos(theta)]);
  }
  const scale = style.scale;
  if (scale && scale !== 'none') { const [x, y = x] = scale.trim().split(/\s+/).map(Number); if (!Number.isFinite(x!) || !Number.isFinite(y!)) return undefined; total = multiply(total, [x!, 0, 0, y!]); }
  const transform = style.transform;
  if (transform && transform !== 'none') {
    const m2 = /^matrix\(([^)]+)\)$/.exec(transform), m3 = /^matrix3d\(([^)]+)\)$/.exec(transform);
    if (m2) { const [a, b, c, d] = m2[1]!.split(',').map(Number); total = multiply(total, [a!, b!, c!, d!]); }
    else if (m3) {
      const v = m3[1]!.split(',').map(Number);
      // Only the 2D-affine subset of a 3D matrix is representable in the plane.
      if ([v[2], v[3], v[6], v[7], v[8], v[9], v[11], v[14]].some(x => Math.abs(x!) > 1e-9) || Math.abs(v[10]! - 1) > 1e-9 || Math.abs(v[15]! - 1) > 1e-9) return undefined;
      total = multiply(total, [v[0]!, v[1]!, v[4]!, v[5]!]);
    } else return undefined;
  }
  return total;
}
export function accumulatedLinear(source: Element): Linear | undefined {
  const win = source.ownerDocument.defaultView; if (!win) return undefined;
  let total: Linear = [1, 0, 0, 1];
  for (let node: Element | null = source; node; node = parentOf(node)) {
    const own = elementLinear(win.getComputedStyle(node));
    if (!own) return undefined;
    total = multiply(own, total);
  }
  const det = total[0] * total[3] - total[1] * total[2];
  return Number.isFinite(det) && Math.abs(det) > 1e-9 ? total : undefined;
}
export const axisAligned = (m: Linear) => Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && m[0] > 0 && m[3] > 0;
/** Untransformed border-box size (layout size), for rotated/skewed placement. */
export function layoutSize(source: Element): readonly [number, number] {
  const html = source as HTMLElement;
  if (typeof html.offsetWidth === 'number') return [html.offsetWidth, html.offsetHeight];
  return [source.clientWidth || source.getBoundingClientRect().width, source.clientHeight || source.getBoundingClientRect().height];
}
/** Wrapper placement for a general 2D affine source: the layout box centred on the painted centre, transformed about its centre. */
export function affinePlacement(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, size: readonly [number, number], m: Linear): string {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return `left:${cx - size[0] / 2}px;top:${cy - size[1] / 2}px;width:${size[0]}px;height:${size[1]}px;transform-origin:50% 50%;transform:matrix(${m[0]},${m[1]},${m[2]},${m[3]},0,0);`;
}

let handles = 0;
/** Live representation handles (resource ledger). */
export function liveRepresentationHandles(): number { return handles; }

export interface RepresentationHandle {
  /** The representation is in the document: scroll offsets and animation replay (idempotent). */
  attach(): void;
  /** Per-frame read phase (live-tracked animated values, while sources exist). */
  read(): void;
  /** Per-frame write phase (providers, retained renderers, tracked values). */
  write(time: number): void;
  /** The source's business owner retires now (same frame as removal). Idempotent. */
  retire(): void;
  /** Idempotent release of every resource. */
  dispose(): void;
  readonly continuity: 'static' | 'live' | 'retained';
  readonly providers: readonly string[];
}
export type CaptureOutcome =
  | { readonly kind: 'captured'; readonly node: HTMLDivElement; readonly copyRoot: HTMLElement | undefined; readonly rect: DOMRectReadOnly; readonly ancestorOpacity: number; readonly scale: readonly [number, number]; readonly linear: Linear; readonly size: readonly [number, number]; readonly clip: ClipSample | undefined; readonly handle: RepresentationHandle; readonly ready: readonly Promise<void>[]; readonly workMs: number; readonly elements: number; readonly cached: boolean;
      /** Content no provider/projection can paint, with its offset in the participant box (native snapshot candidates). */
      readonly unreachable: readonly NativeEntry[] }
  | { readonly kind: 'skipped'; readonly reason: string };

export interface RepresenterOptions {
  readonly providers?: readonly RepresentationProvider[] | undefined;
  readonly diagnose?: ((event: VisualDiagnostic) => void) | undefined;
  readonly reducedMotion?: (() => boolean) | undefined;
  /** Warm preparation reuse (engine-owned). */
  readonly cache?: ProjectionCache | undefined;
  /** Declared-opaque content may use the native snapshot (route opt-in with the API present); otherwise it settles. */
  readonly native?: boolean | undefined;
}

/** One pending representation (chunked preparation). */
export interface PendingCapture { step(deadline: number): boolean; complete(): CaptureOutcome; abandon(): void }

export class Representer {
  private readonly providers: readonly RepresentationProvider[];
  constructor(private readonly options: RepresenterOptions = {}) {
    const custom = options.providers ?? [];
    const all: RepresentationProvider[] = [];
    all.push(...custom, canvasProvider, videoProvider, iframeProvider({ providers: () => this.providers }));
    this.providers = all;
  }
  begin(source: HTMLElement, participant: string, hidden: ReadonlySet<Element> = new Set()): PendingCapture {
    if (!source.isConnected) return settled({ kind: 'skipped', reason: 'disconnected' });
    const doc = source.ownerDocument;
    const controller = new AbortController();
    const diagnostics: string[] = [];
    // One abort signal per provided representation: aborted when that representation is disposed (failure or settle).
    const signals = new WeakMap<RepresentationContext, AbortController>();
    const context = (): RepresentationContext => { const own = new AbortController(); controller.signal.addEventListener('abort', () => own.abort(), { once: true }); const created: RepresentationContext = { document: doc, signal: own.signal, reducedMotion: this.options.reducedMotion?.() ?? false, diagnose: reason => { diagnostics.push(reason); this.options.diagnose?.({ type: 'unsupported', participant, reason }); } }; signals.set(created, own); return created; };
    // Custom providers may claim any element: a warm template must never bypass their participation.
    const warm = this.options.providers?.length ? undefined : this.options.cache?.take(source, hidden);
    const job = new ProjectionJob(source, { providers: this.providers, context, hidden, native: this.options.native ?? false });
    let abandoned = false;
    return {
      step: deadline => warm ? true : job.step(deadline),
      abandon: () => { if (abandoned) return; abandoned = true; job.abandon(); controller.abort(); },
      complete: () => {
        if (!source.isConnected) { job.abandon(); controller.abort(); return { kind: 'skipped', reason: 'disconnected' }; }
        const svgChild = source.namespaceURI === 'http://www.w3.org/2000/svg' && source.localName !== 'svg';
        // SVG graphics inside an <svg>: their full user-space→screen mapping is applied inside the copy (screen CTM).
        const linear = svgChild ? [1, 0, 0, 1] as const : accumulatedLinear(source);
        if (!linear) { job.abandon(); controller.abort(); return { kind: 'skipped', reason: 'transformed-space:3d' }; }
        const aligned = axisAligned(linear);
        const scale: readonly [number, number] = aligned ? [linear[0], linear[3]] : [1, 1];
        const rect = source.getBoundingClientRect();
        if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) { job.abandon(); controller.abort(); return { kind: 'skipped', reason: 'missing-geometry' }; }
        const clip = sampleClip(source);
        if (fullyClipped(rect, clip)) { job.abandon(); controller.abort(); return { kind: 'skipped', reason: 'clippedOut' }; }
        if (!warm) job.step(Infinity);
        // S4 faithful settlement: `settle: true` (also from inside a same-origin iframe) means the containing
        // participant is not represented at all; its live source stays usable until the commit. No size heuristics.
        if (!warm) {
          const preview = job.finish();
          if (preview.settled.length) {
            job.abandon(); controller.abort();
            const reason = preview.settled.map(item => item.reason).join(',');
            this.options.diagnose?.({ type: 'representation', participant, provider: 'settled', continuity: 'unrepresented', reason: `settled:${reason}` });
            return { kind: 'skipped', reason: `settled:${reason}` };
          }
        }
        const wrapper = doc.createElement('div');
        wrapper.inert = true;
        wrapper.setAttribute('aria-hidden', 'true');
        const [sx, sy] = scale;
        // Layout containment: fixed/absolute descendants resolve inside the representation; no paint clipping (shadow ink).
        wrapper.style.cssText = aligned
          ? `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width / sx}px;height:${rect.height / sy}px;pointer-events:none;contain:layout style;margin:0;` + (sx !== 1 || sy !== 1 ? `transform-origin:0 0;transform:scale(${sx},${sy});` : '')
          : `position:fixed;pointer-events:none;contain:layout style;margin:0;${affinePlacement(rect, layoutSize(source), linear)}`;
        const result = warm
          ? { root: warm.root, copyRoot: warm.copyRoot, provided: [], replayed: [], tracked: [], diagnostics: warm.reports, unreachable: [], settled: [], stats: { unrendered: 0, elements: warm.elements, styleWrites: 0, pseudo: 0, svg: 0, provided: 0, replayed: 0, tracked: 0, workMs: 0, slices: 0 } }
          : job.finish();
        wrapper.appendChild(result.root);
        const report = (reason: string) => { diagnostics.push(reason); this.options.diagnose?.({ type: 'unsupported', participant, reason }); };
        const handle = createHandle(result, () => { if (warm) warm.attach(); else job.attach(); }, controller, report, entry => signals.get(entry.context)?.abort());
        // Materialized-pseudo suppression depends on its layer staying first in <head> for this copy's whole lifetime.
        // (Queried on the wrapper: `result.root` is a fragment whose children were moved into it.)
        if (wrapper.querySelector('style[data-composable-pseudo]')) { const release = retainPseudoOrder(doc); controller.signal.addEventListener('abort', release, { once: true }); }
        for (const reason of result.diagnostics) this.options.diagnose?.({ type: 'unsupported', participant, reason });
        const provided = result.provided.map(entry => entry.provider);
        this.options.diagnose?.({ type: 'representation', participant, provider: provided.length ? `projection+${provided.join('+')}` : 'projection', continuity: handle.continuity });
        return { kind: 'captured', node: wrapper, copyRoot: result.copyRoot, rect, ancestorOpacity: ancestorOpacity(source), scale, linear, size: layoutSize(source), clip, handle, ready: result.provided.filter(entry => !!entry.representation.ready).map(entry => entry.representation.ready!.then(() => undefined, error => { this.options.diagnose?.({ type: 'unsupported', participant, reason: `provider:${entry.provider}:readyFailed:${String(error)}` }); })), workMs: result.stats.workMs, elements: result.stats.elements, cached: !!warm,
          unreachable: result.unreachable.map(element => { const box = element.getBoundingClientRect(); return { element, offset: [(box.x - rect.x) / sx, (box.y - rect.y) / sy] as const, size: [box.width / sx, box.height / sy] as const }; }) };
      }
    };
  }
  /** Synchronous representation (within-page capture before the immediate commit; recapture). */
  capture(source: HTMLElement, participant: string, hidden?: ReadonlySet<Element>): CaptureOutcome {
    const pending = this.begin(source, participant, hidden);
    pending.step(Infinity);
    return pending.complete();
  }
}
function settled(outcome: CaptureOutcome): PendingCapture { return { step: () => true, complete: () => outcome, abandon: () => {} }; }

function createHandle(result: ReturnType<ProjectionJob['finish']>, attach: () => void, controller: AbortController, report: (reason: string) => void, abortOne: (entry: ReturnType<ProjectionJob['finish']>['provided'][number]) => void = () => {}): RepresentationHandle {
  handles++;
  let disposed = false, retired = false;
  const reps: ProvidedRepresentation[] = result.provided.map(entry => entry.representation);
  const names = new Map<ProvidedRepresentation, string>(result.provided.map(entry => [entry.representation, entry.provider]));
  /** Render authority transferred at retirement: the renderer replaces its representation for frames and disposal. */
  const retained = new Map<ProvidedRepresentation, RetainedRenderer>();
  /** Providers whose frame hook failed: reported once, their last painted frame stays (no further calls). */
  const failed = new Set<ProvidedRepresentation>();
  const values = new Map<object, string[]>();
  /** Latest stack sample per followed element (values and each animation's current time): reads only. */
  const stackSamples = new Map<object, StackSample[]>();
  /** Properties now carried by a reconstructed stack on the copy (no longer written from samples). */
  const solved = new WeakMap<object, ReadonlySet<string>>();
  const reconstructed: Animation[] = [];
  const continuity = reps.some(rep => rep.continuity === 'retained') ? 'retained' : reps.some(rep => rep.continuity === 'live') || result.tracked.length ? 'live' : 'static';
  const released = new Set<ProvidedRepresentation>();
  const release = (rep: ProvidedRepresentation) => {
    if (released.has(rep)) return;
    released.add(rep);
    // Exactly one disposal per provided representation: the retained renderer if authority was transferred, else the representation.
    const renderer = retained.get(rep);
    try { if (renderer) renderer.dispose(); else rep.dispose(); } catch (error) { report(`provider:${names.get(rep)}:disposeFailed:${String(error)}`); }
    const entry = result.provided.find(item => item.representation === rep); if (entry) abortOne(entry);
  };
  return {
    continuity, providers: result.provided.map(entry => entry.provider),
    attach() { if (!disposed) attach(); },
    read() {
      if (disposed || retired) return;
      for (const track of result.tracked) {
        if (!track.source.isConnected) continue;
        const style = track.source.ownerDocument.defaultView?.getComputedStyle(track.source);
        if (!style) continue;
        // Current times are read after the computed values (the style flush), so both describe the same animation time.
        const now = track.properties.map(property => style.getPropertyValue(property));
        values.set(track, now);
        const times = new Map(track.animations.map(animation => [animation, typeof animation.currentTime === 'number' ? animation.currentTime : null] as const));
        const list = stackSamples.get(track) ?? [];
        const sample = { at: performance.now(), values: now, times };
        // Keep the two latest samples at distinct animation times (verification across time).
        if (list.length && [...times].every(([animation, time]) => list[list.length - 1]!.times.get(animation) === time)) list[list.length - 1] = sample; else list.push(sample);
        if (list.length > 2) list.shift();
        stackSamples.set(track, list);
      }
    },
    write(time) {
      if (disposed) return;
      for (const track of result.tracked) { const now = values.get(track); const done = solved.get(track); if (now) track.properties.forEach((property, index) => { if (!done?.has(property)) track.copy.style.setProperty(property, now[index]!); }); }
      for (const rep of reps) {
        if (failed.has(rep)) continue;
        const renderer = retained.get(rep);
        // After retirement only a transferred renderer keeps rendering; a representation that returned nothing keeps its last frame.
        if (retired && !renderer) continue;
        try { if (renderer) renderer.frame?.(time); else rep.frame?.(time); }
        // A failing provider is disposed now (exactly once): its last painted node stays, its resources do not.
        catch (error) { failed.add(rep); report(`provider:${names.get(rep)}:frameFailed:${String(error)}`); release(rep); }
      }
    },
    retire() {
      if (retired || disposed) return;
      retired = true;
      // Followed animations: reconstruct the element's stack on the copy from the latest sample (fresh if the source is still connected).
      if (result.tracked.length) { retired = false; this.read(); retired = true; }
      for (const track of result.tracked) {
        let outcome;
        try { outcome = reconstructStack(track, stackSamples.get(track) ?? [], performance.now()); }
        catch (error) { report(`animationReconstructionFailed:${String(error)}`); continue; }
        solved.set(track, outcome.solved);
        reconstructed.push(...outcome.replays);
        if (outcome.frozen.length) report(`animationFrozen:${outcome.frozen.join(',')}${outcome.reasons.length ? `:${outcome.reasons.join('|')}` : ''}`);
        else report('animationReconstructed');
      }
      for (const rep of reps) {
        // A provider already disposed (failed) is not retired: its lifecycle ended at the failure.
        if (released.has(rep)) continue;
        let renderer: RetainedRenderer | void = undefined;
        try { renderer = rep.retire?.(); } catch (error) { report(`provider:${names.get(rep)}:retireFailed:${String(error)}`); }
        if (renderer) retained.set(rep, renderer);
        else if (rep.continuity !== 'static') report(`provider:${names.get(rep)}:liveEndedAtRetirement`);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; handles--;
      for (const rep of reps) release(rep);
      for (const animation of [...result.replayed, ...reconstructed]) { try { animation.cancel(); } catch { /* released */ } }
      controller.abort();
    }
  };
}

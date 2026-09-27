/**
 * Structural projection: the default representation of ordinary web content. A resumable walk copies the
 * source subtree with every computed longhand inlined (document rules cannot restyle the copy: inline wins;
 * CSS animations/transitions are disabled on copies and replayed explicitly), materialized ::before/::after, SVG with
 * representation-scoped IDs (paint servers attribute-only), neutral custom elements, flattened open shadow
 * trees, copied form state and scroll offsets. Providers are consulted for every element first.
 * Reads only: the source, its styles and its animations are never mutated.
 * Evidence: docs/development/fluid-motion/representation-probes (P2, P2d, P5, P5b, P7).
 */
import type { ProvidedRepresentation, RepresentationContext, RepresentationProvider } from './types.js';
import { CounterResolver } from './counters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
/** Never copied: motion/transition machinery, identity-bearing names, interaction and rendering hints. */
const DROP = new Set(['transition', 'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function', 'transition-behavior',
  'animation', 'animation-name', 'animation-duration', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state', 'animation-timing-function', 'animation-composition', 'animation-timeline', 'animation-range-start', 'animation-range-end',
  'view-transition-name', 'view-transition-class', 'anchor-name', 'anchor-scope', 'position-anchor', 'pointer-events', 'user-select', '-webkit-user-select', 'cursor', 'will-change', 'content-visibility',
  'container-name', 'counter-reset', 'counter-increment', 'counter-set', 'timeline-scope', 'scroll-timeline-name', 'view-timeline-name', 'scroll-timeline-axis', 'view-timeline-axis', 'view-timeline-inset', 'caret-color', 'interactivity']);
/** Paint servers and resources keep their attributes only: inlined computed styles break references (P2d). */
const SVG_RESOURCES = new Set(['defs', 'lineargradient', 'radialgradient', 'stop', 'pattern', 'clippath', 'mask', 'filter', 'marker', 'symbol', 'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix', 'fecomposite', 'feflood', 'femerge', 'femergenode', 'fedropshadow', 'feturbulence', 'fedisplacementmap', 'femorphology', 'feimage', 'fetile', 'fecomponenttransfer', 'fefunca', 'fefuncr', 'fefuncg', 'fefuncb', 'feconvolvematrix', 'fediffuselighting', 'fespecularlighting', 'fepointlight', 'fespotlight', 'fedistantlight']);
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta', 'title', 'base']);
/** Elements that legitimately have no boxes of their own but still affect what is painted (never pruned). */
const UNBOXED_KEEP = new Set(['br', 'wbr', 'option', 'optgroup', 'datalist', 'col', 'colgroup', 'source', 'track', 'area', 'map', 'param', 'slot']);
/** Built-in elements `attachShadow` accepts (plus any custom element): the only possible closed-root hosts. */
const SHADOW_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'main', 'nav', 'p', 'section', 'span']);
/**
 * Author fact declarations about an element's rendered content (not permissions, not lifecycle):
 * - `light-dom`: its light DOM is its complete rendering (no shadow root), so projection is complete;
 * - `opaque`: its rendering is not observable (e.g. a closed shadow root). A provider represents it, else the native
 *   snapshot on an opted-in route, else the containing participant settles (S4).
 */
export const REPRESENTATION_ATTRIBUTE = 'data-composable-representation';
const PSEUDO_ATTRIBUTE = 'data-composable-pseudo';
/**
 * Layer order is fixed by a name's first appearance: an empty `@layer composable-pseudo;` statement as the first child
 * of <head> (framework-owned, inert, idempotent) makes that layer the earliest, so its important suppression of
 * materialized pseudo-elements outranks every author important declaration, layered or not.
 */
const pseudoOrder = new WeakMap<Document, { count: number; observer: MutationObserver | undefined }>();
let pseudoOrderGuards = 0;
/** Live head-order guards (resource ledger; tests assert zero after disposal). */
export function livePseudoOrderGuards(): number { return pseudoOrderGuards; }
/**
 * Keep the suppression layer first for as long as a representation relying on it lives: one `childList` observer on
 * <head> per document (not subtree), restoring the order statement to first place after any head insertion, released
 * with the last retaining representation (returned release is idempotent).
 */
export function retainPseudoOrder(doc: Document): () => void {
  orderPseudoLayerFirst(doc);
  const entry = pseudoOrder.get(doc) ?? { count: 0, observer: undefined };
  pseudoOrder.set(doc, entry);
  entry.count++;
  if (!entry.observer && doc.head && typeof MutationObserver !== 'undefined') {
    entry.observer = new MutationObserver(() => orderPseudoLayerFirst(doc));
    entry.observer.observe(doc.head, { childList: true });
    pseudoOrderGuards++;
  }
  let released = false;
  return () => {
    if (released) return; released = true;
    if (--entry.count > 0 || !entry.observer) return;
    entry.observer.disconnect(); entry.observer = undefined; pseudoOrderGuards--;
  };
}
function orderPseudoLayerFirst(doc: Document): void {
  const head = doc.head; if (!head) return;
  let statement = head.querySelector<HTMLStyleElement>(':scope > style[data-composable-pseudo-order]');
  if (statement && statement === head.firstElementChild) return;
  if (!statement) { statement = doc.createElement('style'); statement.setAttribute('data-composable-pseudo-order', ''); statement.setAttribute('data-composable-visual-internal', ''); statement.textContent = '@layer composable-pseudo;'; }
  head.insertBefore(statement, head.firstChild);
}
const FORM_ATTRIBUTES = ['type', 'placeholder', 'size', 'rows', 'cols', 'min', 'max', 'step', 'multiple', 'disabled', 'readonly', 'dir', 'lang'];
const COPY_ATTRIBUTES: Record<string, readonly string[]> = {
  ol: ['start', 'reversed', 'type'], li: ['value'], details: ['open'], progress: ['value', 'max'], meter: ['value', 'min', 'max', 'low', 'high', 'optimum'],
  img: ['crossorigin', 'referrerpolicy', 'width', 'height'], source: ['srcset', 'sizes', 'media', 'type'], col: ['span'], colgroup: ['span'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'],
  button: ['disabled'], select: ['disabled', 'multiple', 'size'], option: ['disabled', 'selected'], optgroup: ['disabled', 'label'], abbr: ['title'], bdo: ['dir'], q: ['cite'], dialog: ['open']
};

export interface ProjectionStats { unrendered: number; elements: number; styleWrites: number; pseudo: number; svg: number; provided: number; replayed: number; tracked: number; workMs: number; slices: number }
/** A live-tracked animated property set: source values are read each frame (never mutated) while it exists. */
export interface TrackedAnimation { readonly source: Element; readonly copy: Element & ElementCSSInlineStyle; readonly properties: readonly string[];
  /** Animations that could not be replayed exactly (implicit keyframes without an exposed underlying value, composition, other timelines). */
  readonly animations: readonly Animation[] }
export interface ProjectionResult {
  /** The copy (a fragment holding the projected participant root), appended by the framework into its wrapper. */
  readonly root: DocumentFragment;
  /** The projected participant root inside the shadow tree. */
  readonly copyRoot: HTMLElement | undefined;
  readonly provided: readonly { readonly provider: string; readonly representation: ProvidedRepresentation; readonly context: RepresentationContext }[];
  /** Replayed animations (populated by `attach()`). */
  readonly replayed: readonly Animation[];
  readonly tracked: readonly TrackedAnimation[];
  readonly diagnostics: readonly string[];
  /** S4: elements a provider asked to settle; any entry settles the containing participant. */
  readonly settled: readonly { readonly element: Element; readonly reason: string }[];
  /** Elements no provider or projection can paint (cross-origin frames): candidates for the native snapshot provider. */
  readonly unreachable: readonly Element[];
  readonly stats: ProjectionStats;
}

/** Controls whose native appearance is lost when author-level box/paint values are set inline. */
const NATIVE_CONTROLS = new Set(['input', 'textarea', 'select', 'button', 'meter', 'progress']);
const controlCache = new WeakMap<Document, { host: HTMLElement; values: Map<string, Map<string, string>> }>();
/** Computed values of an unstyled control of the same kind in the source document (UA plus tag rules, as the copy gets). */
function controlDefaults(element: Element, target: Document = element.ownerDocument, kind: string = element.localName, namespace?: string): ReadonlyMap<string, string> {
  const doc = target;
  let cache = controlCache.get(doc);
  if (!cache || !cache.host.isConnected) {
    // Same styling context as copies: a class-free light-DOM subtree of the document (UA + tag rules apply alike).
    const host = doc.createElement('div'); host.setAttribute('aria-hidden', 'true'); host.setAttribute('data-composable-visual-internal', ''); host.inert = true;
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:strict;width:0;height:0;';
    (doc.body ?? doc.documentElement).appendChild(host);
    cache = { host, values: new Map() }; controlCache.set(doc, cache);
  }
  const type = NATIVE_CONTROLS.has(kind) ? element.getAttribute('type') ?? '' : '';
  const key = `${namespace ?? ''}|${kind}|${type}`;
  let values = cache.values.get(key);
  if (!values) {
    const probe = namespace ? doc.createElementNS(namespace, kind) : doc.createElement(kind); if (type) probe.setAttribute('type', type);
    const holder = namespace && kind !== 'svg' ? doc.createElementNS(namespace, 'svg') : undefined;
    if (holder) { holder.appendChild(probe); cache.host.appendChild(holder); } else cache.host.appendChild(probe);
    const style = doc.defaultView!.getComputedStyle(probe);
    values = new Map(); for (let index = 0; index < style.length; index++) { const name = style[index]!; values.set(name, style.getPropertyValue(name)); }
    (holder ?? probe).remove(); cache.values.set(key, values);
  }
  return values;
}
/** Release cached control defaults (Host teardown/tests). */
export function releaseControlDefaults(doc: Document): void { controlCache.get(doc)?.host.remove(); controlCache.delete(doc); }
/**
 * The visible selection of a file input: the copy (inert, no name/form, never submitted) receives a new FileList
 * referencing the same File objects, so the native control paints the same label. Files are not read or uploaded
 * and the source's selection is untouched.
 */
export function copyFileSelection(field: HTMLInputElement, out: HTMLInputElement, report: (reason: string) => void): void {
  try {
    const transfer = new DataTransfer();
    for (const file of Array.from(field.files ?? [])) transfer.items.add(file);
    out.files = transfer.files;
  } catch { report('fileInputSelectionUnrepresented'); }
}
const unquote = (content: string): string | undefined => {
  // Concatenated string tokens: "a" "b" → ab. Anything else (counter(), attr(), url()) is unresolved.
  const tokens = content.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g);
  if (!tokens || tokens.join(' ').replace(/\s+/g, '') !== content.replace(/\s+/g, '')) return undefined;
  return tokens.map(token => token.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
};

interface Frame { readonly source: Node; readonly parentCopy: Node; readonly parentStyle: ReadonlyMap<string, string> | undefined; readonly inSvg: boolean; readonly isRoot: boolean; readonly after?: Element | undefined;
  /** Inside an SVG resource (defs, symbol, gradient, pattern, clipPath, mask, marker, filter): attributes only. */
  readonly inResource?: boolean | undefined }

/**
 * A resumable projection of one participant. `step(deadline)` copies until the deadline (performance.now()
 * value) and returns true when complete. Synchronous use: `step(Infinity)`.
 */
export class ProjectionJob {
  private readonly stack: Frame[] = [];
  private readonly scrolls: [HTMLElement, number, number][] = [];
  /** Every copied scroll container and its source: offsets are read live when the copy is attached. */
  private readonly scrollables: [HTMLElement, Element][] = [];
  private readonly provided: { provider: string; representation: ProvidedRepresentation; context: RepresentationContext }[] = [];
  private readonly replayPlans: (() => Animation | undefined)[] = [];
  private readonly tracked: TrackedAnimation[] = [];
  private readonly diagnostics: string[] = [];
  private readonly unreachable: Element[] = [];
  private readonly settled: { element: Element; reason: string }[] = [];
  private readonly prefix: string;
  private readonly container: DocumentFragment;
  private copyRoot: HTMLElement | undefined;
  private counters: CounterResolver | undefined;
  private materialized = false;
  /** Outer <svg> viewport for an SVG graphic participant (the representation's copy root). */
  private svgOuter: Element | undefined;
  /** Sticky/fixed descendants: painted offset from the participant root at capture (their position depends on scroll/viewport). */
  private readonly placed: [HTMLElement, number, number, Element][] = [];
  private sourceOrigin: readonly [number, number] = [0, 0];
  private done = false;
  private finished: ProjectionResult | undefined;
  readonly stats: ProjectionStats = { unrendered: 0, elements: 0, styleWrites: 0, pseudo: 0, svg: 0, provided: 0, replayed: 0, tracked: 0, workMs: 0, slices: 0 };
  private static serial = 0;
  constructor(readonly source: HTMLElement, private readonly options: { readonly providers: readonly RepresentationProvider[]; readonly context: (source: Element) => RepresentationContext; readonly hidden?: ReadonlySet<Element> | undefined; readonly native?: boolean | undefined }) {
    const doc = source.ownerDocument;
    this.prefix = `crp${(ProjectionJob.serial++).toString(36)}-`;
    this.container = doc.createDocumentFragment();
    const svgChild = source.namespaceURI === SVG_NS && source.localName !== 'svg';
    if (svgChild) {
      // An SVG graphic participant paints only inside an <svg>: an outer viewport at its painted bounds, the
      // owner's resources (defs) for its references, and its user space mapped through its screen CTM.
      const owner = (source as unknown as SVGGraphicsElement).ownerSVGElement;
      const box = source.getBoundingClientRect();
      const outer = doc.createElementNS(SVG_NS, 'svg');
      outer.setAttribute('width', String(box.width)); outer.setAttribute('height', String(box.height));
      outer.style.cssText = 'display:block;overflow:visible;position:relative;';
      const group = doc.createElementNS(SVG_NS, 'g');
      const ctm = (source as unknown as SVGGraphicsElement).getScreenCTM?.();
      const parentCtm = ((source.parentNode as unknown as SVGGraphicsElement | null)?.getScreenCTM?.()) ?? ctm;
      if (parentCtm) group.setAttribute('transform', `matrix(${parentCtm.a} ${parentCtm.b} ${parentCtm.c} ${parentCtm.d} ${parentCtm.e - box.x} ${parentCtm.f - box.y})`);
      outer.appendChild(group);
      this.container.appendChild(outer);
      this.svgOuter = outer;
      this.stack.push({ source, parentCopy: group, parentStyle: undefined, inSvg: true, isRoot: true });
      for (const defs of Array.from(owner?.querySelectorAll(':scope > defs') ?? [])) if (!defs.contains(source)) this.stack.push({ source: defs, parentCopy: outer, parentStyle: undefined, inSvg: true, isRoot: false, inResource: true });
    } else this.stack.push({ source, parentCopy: this.container, parentStyle: undefined, inSvg: false, isRoot: true });
  }
  get complete(): boolean { return this.done; }
  /** Sticky/fixed descendants were found (their painted position depends on scroll and viewport). */
  hasScrollDependentPlacement(): boolean { return this.placed.length > 0; }
  /** Generated text was resolved from document-wide counter state (it depends on content outside the participant). */
  usesDocumentCounters(): boolean { return this.counters !== undefined; }
  /** Sticky/fixed copies and their sources (re-placed from current source geometry when reused). */
  placedTargets(): readonly (readonly [HTMLElement, Element])[] { return this.placed.map(([copy, , , source]) => [copy, source] as const); }
  /** Copied scroll containers and their source offsets (applied by `attach()`). */
  scrollTargets(): readonly (readonly [HTMLElement, number, number])[] { return this.scrolls; }
  scrollableTargets(): readonly (readonly [HTMLElement, Element])[] { return this.scrollables; }
  step(deadline: number): boolean {
    if (this.done) return true;
    const started = performance.now();
    this.stats.slices++;
    try {
      while (this.stack.length) {
        const frame = this.stack.pop()!;
        this.visit(frame);
        if (performance.now() >= deadline) break;
      }
    } finally { this.stats.workMs += performance.now() - started; }
    if (!this.stack.length) this.done = true;
    return this.done;
  }
  /** Complete the copy (no document effects). Call `attach()` once the result is in the document. */
  finish(): ProjectionResult {
    if (this.finished) return this.finished;
    if (!this.done) this.step(Infinity);
    if (this.materialized && !this.container.querySelector(`style[${PSEUDO_ATTRIBUTE}]`)) {
      const style = this.container.ownerDocument.createElement('style');
      style.setAttribute(PSEUDO_ATTRIBUTE, ''); style.setAttribute('data-composable-visual-internal', '');
      // Important declarations in a cascade layer beat all unlayered important ones (CSS Cascade 5), whatever their
      // specificity, and an earlier layer's beat a later one's: the layer is ordered first in the document (below).
      style.textContent = `@layer composable-pseudo{[${PSEUDO_ATTRIBUTE}]::before,[${PSEUDO_ATTRIBUTE}]::after{content:none!important}}`;
      orderPseudoLayerFirst(this.container.ownerDocument);
      this.container.appendChild(style);
    }
    this.finished = { root: this.container, copyRoot: this.copyRoot, provided: this.provided, replayed: this.replayedAnimations, tracked: this.tracked, diagnostics: this.diagnostics, unreachable: this.unreachable, settled: this.settled, stats: this.stats };
    return this.finished;
  }
  private readonly replayedAnimations: Animation[] = [];
  private attachedOnce = false;
  /** In the document: restore scroll offsets and replay declarative animations in phase (idempotent). */
  attach(): void {
    if (this.attachedOnce || !this.finished || !this.copyRoot?.isConnected) return;
    this.attachedOnce = true;
    // Live offsets at attach (a same-turn property scroll has no event yet); recorded offsets if the source is gone.
    for (const [copy, top, left] of this.scrolls) { copy.scrollTop = top; copy.scrollLeft = left; }
    for (const [copy, source] of this.scrollables) if (source.isConnected) { copy.scrollTop = source.scrollTop; copy.scrollLeft = source.scrollLeft; }
    // Sticky/fixed descendants: place them where they were painted (their stuck/viewport position does not survive copying).
    if (this.placed.length && this.copyRoot) {
      const origin = this.copyRoot.getBoundingClientRect();
      const scale = origin.width && this.copyRoot.offsetWidth ? origin.width / this.copyRoot.offsetWidth : 1;
      for (const [copy, dx, dy] of this.placed) { const box = copy.getBoundingClientRect(); copy.style.setProperty('translate', `${(dx - (box.x - origin.x)) / scale}px ${(dy - (box.y - origin.y)) / scale}px`); }
    }
    for (const plan of this.replayPlans) { try { const animation = plan(); if (animation) this.replayedAnimations.push(animation); } catch { this.diagnostics.push('animationReplayFailed'); } }
    this.stats.replayed = this.replayedAnimations.length;
  }
  /** Before completion or after failure: release anything providers created. */
  abandon(): void { for (const { representation } of this.provided) { try { representation.dispose(); } catch { /* disposal cannot retain */ } } this.provided.length = 0; }

  /**
   * Inline the source's computed values (one cssText assignment). A value is skipped only when the copy's own
   * context reproduces it for any property kind: it equals the class-free default of the same element kind in
   * the representation context (UA + tag rules) AND the parent's computed value (inheritance). The root writes all.
   */
  private write(from: CSSStyleDeclaration, to: ElementCSSInlineStyle, defaults?: ReadonlyMap<string, string>, parent?: ReadonlyMap<string, string>): Map<string, string> {
    // Each computed value is read once; children compare against this map (no second read of the parent).
    const read = new Map<string, string>();
    let text = '';
    for (let index = 0; index < from.length; index++) {
      const name = from[index]!;
      const value = from.getPropertyValue(name);
      read.set(name, value);
      if (DROP.has(name)) continue;
      if (defaults && defaults.get(name) === value && (!parent || parent.get(name) === value)) continue;
      text += `${name}:${value};`;
      this.stats.styleWrites++;
    }
    // Document rules still match copy tags: no CSS animation/transition may start on decoration.
    to.style.cssText = `${text}animation:none;transition:none;`;
    return read;
  }
  /** The representation box is the source's border box: no own placement, margins or transforms (sampled separately). */
  private rootPlacement(copy: ElementCSSInlineStyle): void {
    for (const property of ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-block-start', 'margin-block-end', 'margin-inline-start', 'margin-inline-end']) copy.style.setProperty(property, '0px');
    // Physical and logical insets (engines list logical longhands in computed styles too).
    for (const property of ['top', 'right', 'bottom', 'left', 'inset', 'inset-block', 'inset-inline', 'inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end']) copy.style.removeProperty(property);
    for (const property of ['transform', 'translate', 'rotate', 'scale']) copy.style.setProperty(property, 'none');
    copy.style.setProperty('position', 'relative'); copy.style.setProperty('float', 'none');
    // An atomic inline root would sit on a line box in the wrapper (its strut and baseline shift it vertically); its
    // block-level equivalent has the same written box at the wrapper's origin.
    const display = copy.style.getPropertyValue('display');
    const block: Record<string, string> = { 'inline-block': 'block', 'inline-flex': 'flex', 'inline-grid': 'grid', 'inline-table': 'table', 'inline flow-root': 'flow-root', 'inline flex': 'flex', 'inline grid': 'grid', 'inline table': 'table' };
    if (block[display]) copy.style.setProperty('display', block[display]!);
  }
  private scoped(value: string): string { return value.replace(/url\(\s*(["']?)#([^"')]+)\1\s*\)/g, (_match, _quote, id) => `url("#${this.prefix}${id}")`); }
  private provide(element: Element): ProvidedRepresentation | { readonly settle: string } | undefined {
    for (const provider of this.options.providers) {
      let result;
      const context = this.options.context(element);
      try { result = provider.represent(element, context); }
      catch (error) { this.diagnostics.push(`provider:${provider.name}:representFailed:${String(error)}`); continue; }
      if (result === undefined) continue;
      if ('declined' in result) {
        if (result.settle === true) return { settle: `${provider.name}:${result.declined}` }; // S4
        this.diagnostics.push(`provider:${provider.name}:declined:${result.declined}`); if (result.declined === 'crossOriginFrame') this.unreachable.push(element); continue;
      }
      // Observe readiness where it is created: a preparation abandoned before completion cannot leak a rejection.
      if (result.ready) result.ready.then(undefined, error => this.diagnostics.push(`provider:${provider.name}:readyFailed:${String(error)}`));
      this.provided.push({ provider: provider.name, representation: result, context });
      this.stats.provided++;
      return result;
    }
    return undefined;
  }
  private animations(element: Element, copy: Element & ElementCSSInlineStyle): void {
    let list: Animation[];
    try { list = element.getAnimations({ subtree: false }); } catch { return; }
    const tracked = new Set<string>();
    const followed: Animation[] = [];
    for (const animation of list) {
      const effect = animation.effect as KeyframeEffect | null;
      if (!effect || typeof effect.getKeyframes !== 'function' || effect.pseudoElement) { continue; }
      let frames: ComputedKeyframe[];
      try { frames = effect.getKeyframes(); } catch { continue; }
      const properties = new Set<string>();
      for (const frame of frames) for (const key of Object.keys(frame)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key)) properties.add(key);
      // Exact replay needs every property at both ends, replace composition and the document timeline.
      const at = (offset: number) => frames.filter(frame => Math.abs((frame.computedOffset ?? -1) - offset) < 1e-9);
      const explicit = [...properties].every(property => at(0).some(frame => property in frame) && at(1).some(frame => property in frame));
      const replaceable = (effect.composite ?? 'replace') === 'replace' && frames.every(frame => (frame.composite ?? 'auto') === 'auto' || frame.composite === 'replace') && (effect.iterationComposite ?? 'replace') === 'replace';
      const timeline = animation.timeline === element.ownerDocument.timeline;
      if (explicit && replaceable && timeline) {
        const keyframes = frames.map(frame => { const out: Record<string, unknown> = {}; for (const [key, value] of Object.entries(frame)) if (key !== 'computedOffset' && key !== 'composite') out[key] = value; return out; });
        const timing = effect.getTiming();
        this.replayPlans.push(() => {
          const replay = copy.animate(keyframes as Keyframe[], timing);
          replay.playbackRate = animation.playbackRate;
          if (animation.currentTime !== null) replay.currentTime = animation.currentTime;
          if (animation.playState === 'paused' || animation.playState === 'finished') replay.pause();
          return replay;
        });
      } else {
        // Non-mutating fallback: follow the source's animated values each frame while it exists.
        for (const property of properties) tracked.add(property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^css-/, ''));
        followed.push(animation);
      }
    }
    if (tracked.size) { this.tracked.push({ source: element, copy, properties: [...tracked], animations: followed }); this.stats.tracked++; }
  }
  /**
   * Light content a closed shadow root leaves out of the flat tree is not copied. Only children of a possible shadow
   * host (a custom element or a built-in `attachShadow` accepts) without an open root are checked, since only there
   * can the flat tree hide light content (native controls such as `select`/`option` are never touched): a child element
   * with no boxes (not `display: none`/`contents`) or non-blank text without rects is pruned. If the host is rendered,
   * does not skip its contents, and carries no representation declaration, that proves a closed root: the participant
   * settles (S4). Declared hosts keep their declared path (`opaque`: provider, admitted native snapshot, or settle).
   */
  private rendered(node: Element | Text): boolean {
    const host = node.parentElement;
    if (!host || (host as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot || !(host.localName.includes('-') || SHADOW_HOSTS.has(host.localName))) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!/\S/.test((node as Text).data)) return true;
      const range = node.ownerDocument!.createRange(); range.selectNodeContents(node);
      if (range.getClientRects().length) return true;
    } else {
      const element = node as Element;
      if (UNBOXED_KEEP.has(element.localName) || element.getClientRects().length) return true;
      const display = element.ownerDocument.defaultView!.getComputedStyle(element).display;
      if (display === 'none' || display === 'contents') return true;
    }
    this.stats.unrendered++;
    const win = node.ownerDocument!.defaultView!;
    if (!host.hasAttribute(REPRESENTATION_ATTRIBUTE) && host.getClientRects().length && (win.getComputedStyle(host).getPropertyValue('content-visibility') || 'visible') === 'visible' && !this.settled.some(item => item.element === host)) {
      this.settled.push({ element: host, reason: `closedShadow:${host.localName}` });
    }
    return false;
  }
  private visit(frame: Frame): void {
    const { source, parentCopy } = frame;
    // ::after marker frame: appended once the element's children are copied.
    if (frame.after) { parentCopy.appendChild(frame.after); return; }
    if (source.nodeType === Node.TEXT_NODE) {
      if (!frame.isRoot && !this.rendered(source as Text)) return;
      parentCopy.appendChild(source.ownerDocument!.createTextNode((source as Text).data)); return;
    }
    if (source.nodeType !== Node.ELEMENT_NODE) return;
    const element = source as Element;
    const local = element.localName;
    if (SKIP_TAGS.has(local) && element.namespaceURI === HTML_NS) return;
    const doc = this.container.ownerDocument;
    const win = element.ownerDocument.defaultView;
    if (!win) return;
    if (!frame.isRoot && !frame.inSvg && element.namespaceURI === HTML_NS && !this.rendered(element)) return;
    this.stats.elements++;
    const hidden = this.options.hidden?.has(element) ?? false;
    // Providers first (root and descendants).
    // Hidden nested participants are placeholders: no provider (no second player, mirror or renderer).
    const offered = hidden ? undefined : this.provide(element);
    if (offered && 'settle' in offered) {
      // S4: the containing participant settles (the whole projection is discarded by its owner); nothing is copied.
      this.settled.push({ element, reason: offered.settle });
      return;
    }
    const provided = offered;
    if (provided) {
      const style = win.getComputedStyle(element);
      const holder = doc.createElement('div');
      this.write(style, holder);
      // Provided elements are replaced (atomic inline boxes): an inline holder div would ignore its size and break the line.
      if (style.display === 'inline') holder.style.setProperty('display', 'inline-block');
      holder.style.setProperty('overflow', 'hidden');
      for (const property of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']) holder.style.setProperty(property, '0px');
      holder.style.setProperty('box-sizing', 'border-box');
      if (frame.isRoot) { this.rootPlacement(holder); this.copyRoot = holder; }
      provided.node.style.setProperty('width', '100%'); provided.node.style.setProperty('height', '100%'); provided.node.style.setProperty('display', 'block');
      holder.appendChild(provided.node);
      if (hidden) holder.style.setProperty('visibility', 'hidden');
      parentCopy.appendChild(holder);
      return;
    }
    const svg = element.namespaceURI === SVG_NS;
    const style = win.getComputedStyle(element);
    let copy: Element & ElementCSSInlineStyle;
    let values: ReadonlyMap<string, string> | undefined;
    if (svg) {
      this.stats.svg++;
      copy = doc.createElementNS(SVG_NS, local) as Element & ElementCSSInlineStyle;
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) continue;
        if (attribute.name === 'id') { copy.setAttribute('id', this.prefix + attribute.value); continue; }
        if (attribute.localName === 'href' && attribute.value.startsWith('#')) { copy.setAttributeNS(attribute.namespaceURI, attribute.name, `#${this.prefix}${attribute.value.slice(1)}`); continue; }
        // External references of image/use/feImage load the same asset (original request semantics); others are not fetched.
        if (attribute.localName === 'href') { if (['image', 'use', 'feimage'].includes(local.toLowerCase())) copy.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value); continue; }
        try { copy.setAttributeNS(attribute.namespaceURI, attribute.name, this.scoped(attribute.value)); } catch { /* invalid attribute names are skipped */ }
      }
      if (!frame.inResource && !SVG_RESOURCES.has(local.toLowerCase())) {
        values = this.write(style, copy, frame.isRoot ? undefined : controlDefaults(element, doc, local, SVG_NS), frame.isRoot ? undefined : frame.parentStyle);
        for (const property of ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end']) {
          const value = copy.style.getPropertyValue(property);
          if (value.includes('url(')) copy.style.setProperty(property, this.scoped(value));
        }
      }
    } else {
      const custom = local.includes('-');
      const tag = custom ? 'div' : local === 'a' ? 'a' : local;
      copy = doc.createElement(tag) as HTMLElement;
      for (const name of COPY_ATTRIBUTES[local] ?? []) { const value = element.getAttribute(name); if (value !== null) copy.setAttribute(name, value); }
      if (local === 'input' || local === 'textarea' || local === 'select') {
        for (const name of FORM_ATTRIBUTES) { const value = element.getAttribute(name); if (value !== null) copy.setAttribute(name, value); }
        (copy as HTMLElement).tabIndex = -1;
      }
      if (local === 'button') (copy as HTMLButtonElement).type = 'button';
      if (local === 'img') {
        const image = element as HTMLImageElement;
        const out = copy as HTMLImageElement;
        out.alt = ''; out.decoding = 'sync'; out.loading = 'eager'; out.draggable = false;
        out.src = image.currentSrc || image.src;
      }
      if (local === 'iframe' || local === 'video' || local === 'canvas' || local === 'object' || local === 'embed' || local === 'audio') {
        // Replaced/live content without a provider: an honest box of the element's own paint (reported).
        copy = doc.createElement('div') as HTMLElement;
        this.diagnostics.push(`unrepresented:${local}`);
      }
      values = this.write(style, copy, NATIVE_CONTROLS.has(local) ? controlDefaults(element) : frame.isRoot ? undefined : controlDefaults(element, doc, copy.localName), NATIVE_CONTROLS.has(local) || frame.isRoot ? undefined : frame.parentStyle);
      if (custom) copy.style.setProperty('display', style.display);
    }
    if (hidden) copy.style.setProperty('visibility', 'hidden');
    // The copy root is always the participant's own copy (for SVG graphics: inside its viewport, which carries the mapping).
    if (frame.isRoot) { if (!this.svgOuter) this.rootPlacement(copy); this.copyRoot = copy as HTMLElement; }
    if (local === 'input' || local === 'textarea') {
      const field = element as HTMLInputElement;
      if (local === 'textarea') copy.textContent = field.value;
      else {
        // Type-specific visual state; non-assignable state (a selected file) is never set programmatically.
        const out = copy as HTMLInputElement, type = (field.type || 'text').toLowerCase();
        if (type === 'checkbox' || type === 'radio') { out.checked = field.checked; out.indeterminate = field.indeterminate; }
        else if (type === 'file') { if (field.files?.length) copyFileSelection(field, out, reason => this.diagnostics.push(reason)); }
        else { try { out.value = field.value; } catch { this.diagnostics.push(`inputValueUnassignable:${type}`); } }
      }
    }
    if (!svg && (element.scrollTop || element.scrollLeft)) this.scrolls.push([copy as HTMLElement, element.scrollTop, element.scrollLeft]);
    if (!svg && (style.overflowX !== 'visible' || style.overflowY !== 'visible')) this.scrollables.push([copy as HTMLElement, element]);
    if (frame.isRoot && !svg) { const box = element.getBoundingClientRect(); this.sourceOrigin = [box.x, box.y]; }
    if (!frame.isRoot && !svg && (style.position === 'sticky' || style.position === 'fixed')) { const box = element.getBoundingClientRect(); this.placed.push([copy as HTMLElement, box.x - this.sourceOrigin[0], box.y - this.sourceOrigin[1], element]); }
    // Closed shadow roots are unreachable by design: a defined custom element without an open root is reported
    // (and represented natively when the route opts in); its light DOM and box are still copied.
    // Closed shadow roots have no public read API. Declared opaque content: native snapshot (opted-in route) or settle.
    // A defined custom element without an open root whose serialization declares a root: a detected closed root
    // (static reconstruction is not qualified: settle). Otherwise its light DOM is projected and completeness is
    // reported unverified (a light-only element and one whose closed root slots all of it cannot be told apart).
    const declared = svg ? null : element.getAttribute(REPRESENTATION_ATTRIBUTE);
    if (declared === 'opaque') { if (this.options.native) this.unreachable.push(element); else this.settled.push({ element, reason: `opaqueDeclared:${local}` }); }
    else if (!svg && declared !== 'light-dom' && local.includes('-') && !(element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot && element.ownerDocument.defaultView?.customElements.get(local)) {
      let serialized = '';
      try { serialized = (element as Element & { getHTML?: (options: { serializableShadowRoots: boolean }) => string }).getHTML?.({ serializableShadowRoots: true }) ?? ''; } catch { serialized = ''; }
      if (/^\s*<template[^>]*\bshadowrootmode\b/i.test(serialized)) this.settled.push({ element, reason: `closedShadow:serializable:${local}` });
      else this.diagnostics.push(`representationCompletenessUnverified:${local}`);
    }
    this.animations(element, copy);
    parentCopy.appendChild(copy);
    if (local === 'input' || local === 'textarea' || local === 'img' || copy.localName === 'div' && ['iframe', 'video', 'canvas', 'object', 'embed', 'audio'].includes(local)) return;
    // A hidden nested participant is a layout-preserving placeholder: its box only (no content, no providers).
    if (hidden) return;
    // Children (pushed in reverse for document order): ::before, (open shadow) flattened children, ::after.
    const children: Node[] = [];
    const tree: ParentNode = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot ?? element;
    for (const child of Array.from(tree.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === 'slot') {
        const slot = child as HTMLSlotElement;
        const assigned = slot.assignedNodes({ flatten: true });
        children.push(...(assigned.length ? assigned : Array.from(slot.childNodes)));
      } else children.push(child);
    }
    const pseudo = (which: '::before' | '::after'): Node | undefined => {
      if (svg) return undefined;
      const pseudoStyle = win.getComputedStyle(element, which);
      const content = pseudoStyle.content;
      if (!content || content === 'none' || content === 'normal') return undefined;
      const literal = unquote(content);
      const span = doc.createElement('span');
      this.write(pseudoStyle, span);
      span.style.setProperty('content', 'normal');
      // Plain strings directly; counter()/counters()/attr() through the read-only counter simulation.
      const text = literal ?? (this.counters ??= new CounterResolver(this.source, reason => { if (reason.startsWith('settle:')) { if (!this.settled.some(item => item.reason === reason.slice(7))) this.settled.push({ element: this.source, reason: reason.slice(7) }); } else this.diagnostics.push(reason); })).content(element, which, content, pseudoStyle.quotes, (element.closest('[lang]')?.getAttribute('lang') ?? element.ownerDocument.documentElement.lang) || '');
      if (text === undefined) this.diagnostics.push(`generatedContentUnresolved:${which}`);
      span.textContent = text ?? '';
      this.stats.pseudo++;
      return span;
    };
    const before = pseudo('::before'); if (before) copy.appendChild(before);
    const after = pseudo('::after');
    // Materialized pseudo-elements replace the copy's own: tag-matched rules (e.g. the UA `q::before`) would add them again.
    if (before || after) { copy.setAttribute(PSEUDO_ATTRIBUTE, ''); this.materialized = true; }
    const inResource = frame.inResource || (svg && SVG_RESOURCES.has(local.toLowerCase()));
    const pushed: Frame[] = children.map(child => ({ source: child, parentCopy: copy, parentStyle: values, inSvg: frame.inSvg || svg, isRoot: false, inResource }));
    if (after) {
      // Append ::after once all children are copied: a marker frame that appends it.
      this.stack.push({ source: element, parentCopy: copy, parentStyle: undefined, inSvg: false, isRoot: false, after: after as Element });
    }
    for (let index = pushed.length - 1; index >= 0; index--) this.stack.push(pushed[index]!);
    if (local === 'select') {
      // The copy shows the selected option's text as the control's value.
      const selected = (element as HTMLSelectElement).selectedIndex;
      queueMicrotask(() => { try { (copy as HTMLSelectElement).selectedIndex = selected; } catch { /* best effort */ } });
    }
  }
}

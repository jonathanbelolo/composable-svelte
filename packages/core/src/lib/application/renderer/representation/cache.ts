/**
 * Warm preparation reuse: registered participants are projected in idle time (bounded slices) and reused by
 * preparation when still valid, so cold projection work leaves the transition's critical path.
 *
 * Bounded: at most MAX_ENTRIES participants and MAX_ELEMENTS copied elements, least recently used evicted,
 * entries dropped on unregistration. Invalidation (conservative): any mutation in the subtree, any attribute
 * change on an ancestor, viewport resize, font loading, colour-scheme change, scroll or input inside it. At use,
 * the pseudo-class state (:hover/:focus/:focus-visible/:active/:focus-within) and size must equal the warm state.
 * Eligible only without animations, providers (live/replaced content), SVG ids or nested placeholders:
 * those are always projected fresh.
 */
import { ProjectionJob, copyFileSelection } from './projection.js';
import type { RepresentationContext } from './types.js';

export const CACHE_LIMITS = Object.freeze({ entries: 24, elements: 12000, sliceMs: 8, registered: 64 });
const STATE = ':hover,:focus,:focus-visible,:active,:focus-within';
interface Entry { scrollables?: readonly (readonly [readonly number[], Element])[] | undefined; scheduled?: (() => void) | undefined; placed?: readonly (readonly [readonly number[], Element])[] | undefined; observer?: MutationObserver | undefined; styleStamp?: string | undefined; readonly node: HTMLElement; template: DocumentFragment | undefined; reports?: readonly string[] | undefined; scrolls: readonly (readonly [readonly number[], number, number])[]; fingerprint: string; size: readonly [number, number]; elements: number; used: number; job: ProjectionJob | undefined; stop: () => void }
const state = (node: HTMLElement) => { const list = [...node.querySelectorAll(STATE)]; return `${node.matches(STATE) ? 'r' : ''}|${list.map(el => [...node.querySelectorAll('*')].indexOf(el)).join(',')}`; };
const pathTo = (root: Node, node: Node): number[] => { const path: number[] = []; for (let at: Node | null = node; at && at !== root; at = at.parentNode) path.unshift(Array.prototype.indexOf.call(at.parentNode!.childNodes, at)); return path; };
const follow = (root: Node, path: readonly number[]): Node | undefined => { let at: Node | undefined = root; for (const index of path) at = at?.childNodes[index]; return at; };

/** Live/replaced content is always represented by providers at preparation, never from a warm template. */
const PROVIDED = 'canvas,video,iframe,audio,object,embed';
const STATEFUL_CONTROLS = 'input,select,textarea';
/**
 * Stylesheet content stamp: CSSOM edits (rules and declarations) create no mutation records, so every readable
 * document and adopted sheet is serialized and hashed at use. Unreadable (cross-origin) sheets cannot be edited
 * by script; their replacement is a DOM mutation. Application stylesheets are only read.
 */
function styleStamp(doc: Document): string {
  let hash = 2166136261, length = 0;
  const feed = (text: string) => { length += text.length; for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
  const sheets = [...Array.from(doc.styleSheets), ...((doc as Document & { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? [])];
  for (const sheet of sheets) { feed(sheet.disabled ? '|d' : '|e'); try { for (const rule of Array.from(sheet.cssRules)) feed(rule.cssText); } catch { feed('|x'); } }
  return `${sheets.length}:${length}:${hash >>> 0}`;
}
/** Nodes the framework itself owns (plane, announcer, measurement hosts): their mutations are not application styling. */
const OWN = '[data-composable-route-plane],[data-composable-route-announcer],[data-composable-visual-internal]';
export class ProjectionCache {
  /** Disabled when custom providers are configured: they may claim any element, so templates could bypass them. */
  constructor(private readonly enabled = true) {}
  private readonly entries = new Map<HTMLElement, Entry>();
  private documentObserver: MutationObserver | undefined;
  private win: Window | undefined;
  private stopGlobal: (() => void) | undefined;
  private hits = 0; private misses = 0;
  stats(): { readonly entries: number; readonly templates: number; readonly elements: number; readonly hits: number; readonly misses: number } { let elements = 0, templates = 0; for (const entry of this.entries.values()) if (entry.template) { elements += entry.elements; templates++; } return { entries: this.entries.size, templates, elements, hits: this.hits, misses: this.misses }; }
  private global(win: Window): void {
    if (this.win === win) return;
    this.stopGlobal?.();
    this.win = win;
    const all = () => { for (const entry of this.entries.values()) this.invalidate(entry); };
    const within = (event: Event) => { const target = event.target; if (!(target instanceof Node)) return; for (const entry of this.entries.values()) if (entry.node.contains(target as Node)) this.invalidate(entry); };
    // Any application DOM change can restyle a participant (:has(), sibling and ancestor selectors, <style> text):
    // every template is invalidated (conservative and complete for DOM-driven styling).
    const documentObserver = new MutationObserver((records: MutationRecord[]) => this.documentRecords(records));
    documentObserver.observe(win.document, { attributes: true, childList: true, characterData: true, subtree: true });
    this.documentObserver = documentObserver;
    const scheme = win.matchMedia?.('(prefers-color-scheme: dark)');
    win.addEventListener('resize', all); win.addEventListener('scroll', within, true); win.addEventListener('input', within, true); win.addEventListener('change', within, true);
    scheme?.addEventListener?.('change', all); win.document.fonts?.addEventListener?.('loadingdone', all);
    this.stopGlobal = () => { documentObserver.disconnect(); this.documentObserver = undefined; win.removeEventListener('resize', all); win.removeEventListener('scroll', within, true); win.removeEventListener('input', within, true); win.removeEventListener('change', within, true); scheme?.removeEventListener?.('change', all); win.document.fonts?.removeEventListener?.('loadingdone', all); this.win = undefined; };
  }
  private documentRecords(records: readonly MutationRecord[]): void {
    const own = (node: Node) => { const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement; return !!element?.closest(OWN); };
    if (records.some(record => !own(record.target))) for (const entry of this.entries.values()) this.invalidate(entry);
  }
  private invalidate(entry: Entry): void { entry.template = undefined; entry.job = undefined; this.schedule(entry); }
  /** Start warming a registered participant (idle, bounded slices). */
  warm(node: HTMLElement, context: (source: Element) => RepresentationContext): void {
    const win = node.ownerDocument.defaultView; if (!win) return;
    // Disabled or full: nothing is installed (no observers or listeners).
    if (!this.enabled || this.entries.has(node) || this.entries.size >= CACHE_LIMITS.registered) return;
    this.global(win);
    const entry: Entry = { node, template: undefined, scrolls: [], fingerprint: '', size: [0, 0], elements: 0, used: 0, job: undefined, stop: () => {} };
    const observer = new MutationObserver(() => this.invalidate(entry));
    entry.observer = observer;
    observer.observe(node, { subtree: true, childList: true, attributes: true, characterData: true });
    (entry as { stop: () => void }).stop = () => observer.disconnect();
    (entry as unknown as { context: typeof context }).context = context;
    this.entries.set(node, entry);
    this.schedule(entry);
  }
  forget(node: HTMLElement): void { const entry = this.entries.get(node); if (!entry) return; entry.stop(); entry.scheduled?.(); entry.scheduled = undefined; entry.job = undefined; this.entries.delete(node); if (!this.entries.size) { this.stopGlobal?.(); this.stopGlobal = undefined; this.win = undefined; } }
  dispose(): void { for (const node of [...this.entries.keys()]) this.forget(node); this.stopGlobal?.(); this.stopGlobal = undefined; }
  private schedule(entry: Entry): void {
    const win = this.win; if (!win || entry.template || !this.entries.has(entry.node)) return;
    const idle = (win as Window & { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = (deadline?: { timeRemaining(): number }) => {
      if (!this.entries.has(entry.node) || entry.template || !entry.node.isConnected) return;
      // Animated subtrees are always projected fresh (no idle polling; a later invalidation re-warms).
      if (entry.node.getAnimations({ subtree: true }).length) return;
      entry.job ??= new ProjectionJob(entry.node, { providers: [], context: (entry as unknown as { context: (source: Element) => RepresentationContext }).context });
      const budget = Math.min(CACHE_LIMITS.sliceMs, deadline ? Math.max(1, deadline.timeRemaining()) : CACHE_LIMITS.sliceMs);
      if (!entry.job.step(performance.now() + budget)) { this.schedule(entry); return; }
      const job = entry.job;
      const result = job.finish();
      entry.job = undefined;
      // Ineligible content is always projected fresh.
      // Always fresh: provider/live content, animations and SVG ids. Form state and sticky/fixed placement are
      // re-synchronized from the live source whenever a template is used (their changes create no mutation records).
      // Counter-resolved text depends on content before the participant, which templates do not observe.
      if (result.provided.length || result.tracked.length || result.unreachable.length || result.settled.length || result.root.querySelector('[id]') || job.usesDocumentCounters()) return;
      const copyRoot = result.copyRoot; if (!copyRoot) return;
      // Scroll offsets are addressed by their path in the copy's own tree (pseudo-elements shift source indices).
      // Reports that describe the content (completeness unverified) are repeated on every use of the template.
      entry.reports = result.diagnostics.filter(reason => reason.startsWith('representationCompletenessUnverified'));
      entry.template = result.root; entry.scrolls = job.scrollTargets().map(([copy, top, left]) => [pathTo(copyRoot, copy), top, left] as const);
      entry.placed = job.placedTargets().map(([copy, source]) => [pathTo(copyRoot, copy), source] as const);
      entry.scrollables = job.scrollableTargets().map(([copy, source]) => [pathTo(copyRoot, copy), source] as const); entry.fingerprint = state(entry.node);
      const rect = entry.node.getBoundingClientRect(); entry.size = [rect.width, rect.height];
      entry.elements = result.stats.elements; entry.used = performance.now(); entry.styleStamp = styleStamp(entry.node.ownerDocument);
      this.evict();
    };
    // The scheduled callback is owned by the entry and cancelled by forget()/dispose().
    entry.scheduled?.();
    if (idle) { const id = idle.call(win, deadline => { entry.scheduled = undefined; run(deadline); }, { timeout: 500 }); entry.scheduled = () => (win as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id); }
    else { const id = win.setTimeout(() => { entry.scheduled = undefined; run(); }, 50); entry.scheduled = () => win.clearTimeout(id); }
  }
  private evict(): void {
    const live = [...this.entries.values()].filter(entry => entry.template).sort((a, b) => a.used - b.used);
    let elements = live.reduce((sum, entry) => sum + entry.elements, 0), count = live.length;
    for (const entry of live) { if (count <= CACHE_LIMITS.entries && elements <= CACHE_LIMITS.elements) break; entry.template = undefined; elements -= entry.elements; count--; }
  }
  /** A valid warm copy (fragment with its root) for `node`, or undefined (then projected fresh). */
  take(node: HTMLElement, hidden: ReadonlySet<Element>): { readonly root: DocumentFragment; readonly copyRoot: HTMLElement; readonly attach: () => void; readonly elements: number; readonly reports: readonly string[] } | undefined {
    const entry = this.entries.get(node);
    // Same-turn changes: drain pending mutation records synchronously before trusting a template.
    if (entry) {
      if (entry.observer?.takeRecords().length) this.invalidate(entry);
      const pending = this.documentObserver?.takeRecords(); if (pending?.length) this.documentRecords(pending);
      if (entry.template && entry.styleStamp !== styleStamp(node.ownerDocument)) this.invalidate(entry);
    }
    if (!entry?.template || hidden.size || node.matches(PROVIDED) || node.querySelector(PROVIDED)) { this.misses++; return undefined; }
    const rect = node.getBoundingClientRect();
    if (Math.abs(rect.width - entry.size[0]) > 0.5 || Math.abs(rect.height - entry.size[1]) > 0.5 || state(node) !== entry.fingerprint || node.getAnimations({ subtree: true }).length) { this.invalidate(entry); this.misses++; return undefined; }
    entry.used = performance.now(); this.hits++;
    const root = entry.template.cloneNode(true) as DocumentFragment;
    const copyRoot = root.firstElementChild as HTMLElement;
    const scrollables = entry.scrollables ?? [], placed = entry.placed ?? [];
    // Form state from the live source (checked/indeterminate/value; a selected file is never assigned).
    const sourceControls = [...node.querySelectorAll<HTMLInputElement>(STATEFUL_CONTROLS)], copyControls = [...copyRoot.querySelectorAll<HTMLInputElement>(STATEFUL_CONTROLS)];
    if (node.matches(STATEFUL_CONTROLS)) { sourceControls.unshift(node as HTMLInputElement); copyControls.unshift(copyRoot as unknown as HTMLInputElement); }
    if (sourceControls.length !== copyControls.length) { this.invalidate(entry); this.hits--; this.misses++; return undefined; }
    sourceControls.forEach((field, index) => {
      const out = copyControls[index]!;
      if (field.localName === 'textarea') out.textContent = field.value;
      else if (field.localName === 'select') { try { (out as unknown as HTMLSelectElement).selectedIndex = (field as unknown as HTMLSelectElement).selectedIndex; } catch { /* best effort */ } }
      else { const type = (field.type || 'text').toLowerCase(); if (type === 'checkbox' || type === 'radio') { out.checked = field.checked; out.indeterminate = field.indeterminate; } else if (type === 'file') copyFileSelection(field, out, () => {}); else { try { out.value = field.value; } catch { /* unassignable */ } } }
    });
    return { root, copyRoot, elements: entry.elements, reports: entry.reports ?? [], attach: () => {
      // Scroll offsets are read live from the source at attach (property-only scrolling creates no records).
      for (const [path, source] of scrollables) { const target = path.length ? follow(copyRoot, path) as HTMLElement | undefined : copyRoot; if (target && source.isConnected) { target.scrollTop = source.scrollTop; target.scrollLeft = source.scrollLeft; } }
      // Sticky/fixed descendants: placed from the source's current geometry (not the warm-time geometry).
      if (placed.length) {
        const sourceOrigin = node.getBoundingClientRect(), origin = copyRoot.getBoundingClientRect();
        const scale = origin.width && copyRoot.offsetWidth ? origin.width / copyRoot.offsetWidth : 1;
        for (const [path, source] of placed) { const copy = follow(copyRoot, path) as HTMLElement | undefined; if (!copy || !source.isConnected) continue; copy.style.removeProperty('translate'); const want = source.getBoundingClientRect(), box = copy.getBoundingClientRect(); copy.style.setProperty('translate', `${((want.x - sourceOrigin.x) - (box.x - origin.x)) / scale}px ${((want.y - sourceOrigin.y) - (box.y - origin.y)) / scale}px`); }
      }
    } };
  }
}

/**
 * Coordinator-owned overlay stacking (fluid-overlays design §10 C1).
 *
 * Each overlay layer's portal wrapper becomes its own stacking context in the root stacking context:
 * `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 50 + rank`.
 * - **Rank is the dismissal coordinator's order** (`dismissalLayerOrder`: priority, then ancestry, then latest,
 *   inert exits included) of the layer enrolled inside the wrapper, recomputed whenever that order changes. There is
 *   no second opening-order stack, so paint order always agrees with Escape/pointer/focus selection.
 * - **Containing blocks are unchanged.** The wrapper's box is exactly the block its absolute descendants used before
 *   (the initial containing block, or `body`'s padding box when `body` is positioned), so percentage offsets and
 *   sizes, scrolling and `fixed` descendants resolve as before. The wrapper takes no pointer events; every primitive's
 *   content container sets its own `pointer-events`.
 * - The layer's backdrop (`z-50`), content (`z-[51]`) and local decoration slots stack only within their layer, so
 *   an earlier layer — including its content — paints below a later layer's backdrop.
 *
 * Public outer-layer styling contract: overlay layers occupy `z-index` 50 + n of the root stacking context;
 * classes on a layer's inner backdrop/content order only within that layer.
 */
import { dismissalLayerOrder, onDismissalLayersChanged } from './dismissalCoordinator.js';

const BASE = 50;
const STYLE = ['position', 'top', 'left', 'width', 'height', 'z-index', 'pointer-events'] as const;

export type OverlaySlotName = 'backdrop' | 'content';

export interface OverlayLayer {
  /** The layer's portal wrapper (its stacking context). */
  readonly wrapper: HTMLElement;
  /** Order among live layers of the document (0 = lowest). */
  readonly rank: number;
  readonly live: boolean;
  /**
   * A local decoration slot: inert, `aria-hidden`, `pointer-events: none`, `position: fixed; inset: 0`.
   * `backdrop` paints above the layer's backdrop and below its content; `content` paints above its content.
   * Created on demand; removed with the layer or by `releaseSlots()`.
   */
  slot(name: OverlaySlotName): HTMLElement;
  /** Removes this layer's decoration slots (a run that no longer needs them). */
  releaseSlots(): void;
}

interface Entry extends OverlayLayer { rank: number; live: boolean; readonly slots: Map<OverlaySlotName, HTMLElement>; readonly original: Map<string, [string, string]> }

const layers = new WeakMap<Document, Entry[]>();
const byWrapper = new WeakMap<HTMLElement, Entry>();

function list(doc: Document): Entry[] {
  let entries = layers.get(doc);
  if (!entries) { entries = []; layers.set(doc, entries); }
  return entries;
}

const subscribed = new WeakSet<Document>();
/** Ranks follow the coordinator's order; a wrapper whose layer has not enrolled yet sorts above enrolled ones. */
function restack(doc: Document): void {
  const order = dismissalLayerOrder(doc);
  const entries = list(doc);
  const position = (entry: Entry) => { const index = order.findIndex(node => entry.wrapper.contains(node)); return index >= 0 ? index : order.length + entries.indexOf(entry); };
  [...entries].sort((a, b) => position(a) - position(b)).forEach((entry, rank) => {
    entry.rank = rank;
    entry.wrapper.style.setProperty('z-index', String(BASE + rank));
  });
  if (!subscribed.has(doc)) { subscribed.add(doc); onDismissalLayersChanged(doc, () => restack(doc)); }
}

function makeSlot(doc: Document, name: OverlaySlotName): HTMLElement {
  const slot = doc.createElement('div');
  slot.setAttribute('data-composable-overlay-slot', name);
  slot.setAttribute('aria-hidden', 'true');
  slot.inert = true;
  slot.style.cssText = `position:fixed;inset:0;pointer-events:none;overflow:visible;contain:layout style;z-index:${name === 'backdrop' ? BASE : BASE + 1};`;
  return slot;
}

/** Enrol `wrapper` as an overlay layer of its document (ranked by the coordinator). `dispose` via the action. */
export function enrollOverlayLayer(wrapper: HTMLElement): { readonly layer: OverlayLayer; dispose(): void } {
  const doc = wrapper.ownerDocument;
  const original = new Map<string, [string, string]>();
  for (const name of STYLE) original.set(name, [wrapper.style.getPropertyValue(name), wrapper.style.getPropertyPriority(name)]);
  const entry: Entry = {
    wrapper, rank: 0, live: true, slots: new Map(), original,
    slot(name) {
      const existing = entry.slots.get(name);
      if (existing?.isConnected) return existing;
      const slot = makeSlot(doc, name);
      entry.slots.set(name, slot);
      // Slots are appended after the layer's content container: equal z-index paints in tree order, so the
      // backdrop slot sits above the backdrop (z-50) and below the content (z-51); the content slot above both.
      if (name === 'backdrop') { const content = entry.slots.get('content'); if (content?.parentNode === wrapper) wrapper.insertBefore(slot, content); else wrapper.appendChild(slot); }
      else wrapper.appendChild(slot);
      return slot;
    },
    releaseSlots() { for (const slot of entry.slots.values()) slot.remove(); entry.slots.clear(); }
  };
  wrapper.style.setProperty('position', 'absolute');
  wrapper.style.setProperty('top', '0');
  wrapper.style.setProperty('left', '0');
  wrapper.style.setProperty('width', '100%');
  wrapper.style.setProperty('height', '100%');
  wrapper.style.setProperty('pointer-events', 'none');
  wrapper.setAttribute('data-composable-overlay-layer', '');
  list(doc).push(entry);
  byWrapper.set(wrapper, entry);
  restack(doc);
  let disposed = false;
  return {
    layer: entry,
    dispose() {
      if (disposed) return;
      disposed = true;
      entry.live = false;
      entry.releaseSlots();
      const entries = list(doc);
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
      byWrapper.delete(wrapper);
      for (const [name, [value, priority]] of original) { if (value) wrapper.style.setProperty(name, value, priority); else wrapper.style.removeProperty(name); }
      wrapper.removeAttribute('data-composable-overlay-layer');
      restack(doc);
    }
  };
}

/** Svelte action: `<div use:portal use:overlayLayer>`. */
export function overlayLayer(node: HTMLElement): { destroy(): void } {
  const { dispose } = enrollOverlayLayer(node);
  return { destroy: dispose };
}

/** The innermost live overlay layer containing `node` (through its portal wrapper), if any. */
export function layerOf(node: Node): OverlayLayer | undefined {
  for (let current: Node | null = node; current; current = current.parentNode ?? ((current as ShadowRoot).host ?? null)) {
    const entry = current.nodeType === Node.ELEMENT_NODE ? byWrapper.get(current as HTMLElement) : undefined;
    if (entry?.live) return entry;
  }
  return undefined;
}

/** Live overlay layers of `doc`, lowest first. */
export function overlayLayers(doc: Document): readonly OverlayLayer[] { return [...list(doc)]; }

/**
 * An app-authored native top-layer surface containing `node` (`dialog:modal` or an open `[popover]`), if any.
 * Decoration for such a surface is placed INSIDE it (design §10 C3): it paints in the surface's top-layer box,
 * hides with its closing ancestor, and carries no popover state of its own.
 */
export function nativeSurfaceOf(node: Element): HTMLElement | undefined {
  for (let current: Element | null = node; current; current = current.parentElement) {
    try { if (current.matches('dialog:modal, [popover]:popover-open')) return current as HTMLElement; } catch { return undefined; }
  }
  return undefined;
}

/** An inert, aria-hidden, pointer-transparent decoration slot inside a native surface (created on demand). */
export function nativeSurfaceSlot(surface: HTMLElement): HTMLElement {
  const existing = surface.querySelector<HTMLElement>(':scope > [data-composable-overlay-slot="native"]');
  if (existing) return existing;
  const slot = makeSlot(surface.ownerDocument, 'content');
  slot.setAttribute('data-composable-overlay-slot', 'native');
  // No z escalation: positioned and appended last, it paints above the surface's in-flow content in the
  // surface's own top-layer stacking context.
  slot.style.removeProperty('z-index');
  surface.appendChild(slot);
  return slot;
}

/** Live decoration slots (resource ledger; tests assert zero after settle). */
export function liveOverlaySlots(doc: Document): number { return doc.querySelectorAll('[data-composable-overlay-slot]').length; }

// ------------------------------------------------------------------------------------------------ instance scopes

const scopeRoots = new WeakMap<Element, object>();

/**
 * Register `root` (an overlay instance's content container, re-created on every open) as the participant scope
 * root of `scope` (that instance's owner object, a new object per open = a new epoch). Returns the release.
 */
export function bindOverlayScope(root: Element, scope: object): () => void {
  scopeRoots.set(root, scope);
  return () => { if (scopeRoots.get(root) === scope) scopeRoots.delete(root); };
}

/**
 * The overlay instance scope whose registered root contains `node`, resolved by DOM containment at call time
 * (through portals and open shadow roots) — independent of which component initialised the caller.
 */
export function overlayScopeOf(node: Node): object | undefined {
  for (let current: Node | null = node; current; current = current.parentNode ?? ((current as ShadowRoot).host ?? null)) {
    if (current.nodeType === Node.ELEMENT_NODE) { const scope = scopeRoots.get(current as Element); if (scope) return scope; }
  }
  return undefined;
}

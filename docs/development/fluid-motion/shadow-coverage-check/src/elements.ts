import type { ProvidedRepresentation, RepresentationProvider } from '@composable-svelte/core/application/motion';

// A component whose internals live in a closed shadow root: no public API outside the component can read them.
const BADGE_CSS = `
  :host { display: block; width: 160px; height: 48px; border-radius: 12px; overflow: hidden; position: relative;
    background: linear-gradient(90deg, #0ea5e9, #7c3aed); color: #fff; font: 600 14px/48px sans-serif; text-align: center; }
  .bar { position: absolute; left: 0; bottom: 0; height: 8px; width: 100%; background: #facc15; transform-origin: 0 0; }
  :host([animated]) .bar { animation: grow 1200ms linear infinite; }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }`;

export const constructions = { 'closed-badge': 0 };
export class ClosedBadge extends HTMLElement {
  static observedAttributes = ['label', 'animated'];
  readonly #root = this.attachShadow({ mode: 'closed' });
  constructor() { super(); constructions['closed-badge']++; this.#render(); }
  attributeChangedCallback() { this.#render(); }
  #render() {
    const label = (this.getAttribute('label') ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
    this.#root.innerHTML = `<style>${BADGE_CSS}</style><span>${label}</span><i class="bar"></i>`;
  }
  /**
   * Component-owned representation: only the component can see its closed root, so it builds an equivalent
   * instance for the motion plane — same attributes, and its internal animation at the same time.
   */
  representation(document: Document): ClosedBadge {
    const copy = document.createElement('closed-badge') as ClosedBadge;
    for (const { name, value } of this.attributes) copy.setAttribute(name, value);
    copy.follow(this);
    return copy;
  }
  /**
   * Follow another instance: the component's own observed attributes (added, changed and removed) and its internal
   * animation times, which only this component can read from the other's closed root. Other attributes (for example
   * the framework's placement styling on a representation) are left untouched.
   */
  follow(source: ClosedBadge): void {
    for (const name of ClosedBadge.observedAttributes) {
      const value = source.getAttribute(name);
      if (value === null) { if (this.hasAttribute(name)) this.removeAttribute(name); }
      else if (this.getAttribute(name) !== value) this.setAttribute(name, value);
    }
    const from = source.#root.getAnimations();
    this.#root.getAnimations().forEach((animation, index) => {
      const time = from[index]?.currentTime;
      if (typeof time === 'number') animation.currentTime = time;
    });
  }
}

// Closed root with a named slot: the host's unslotted light children are not rendered.
export class ClosedSlotCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'closed' }).innerHTML =
      `<style>:host{display:block;width:200px;height:56px;box-sizing:border-box;padding:8px;border-radius:10px;background:#14532d;color:#dcfce7;font:600 14px sans-serif}</style><slot name="title"></slot>`;
  }
}

// A custom element with no shadow root at all: ordinary light DOM.
export class LightCard extends HTMLElement {}

// Closed but declared serializable by its author (attachShadow option; no framework patching).
export class ClosedSerializable extends HTMLElement {
  constructor() {
    super();
    const init = { mode: 'closed', serializable: true } as ShadowRootInit;
    this.attachShadow(init).innerHTML = `<style>:host{display:block;width:120px;height:32px;background:#7c2d12;color:#fff;font:13px/32px sans-serif}</style><b>Serial</b>`;
  }
}

/** A closed root on a built-in element (allowed for div, span, article…): no custom-element signal at all. */
export function attachClosedToDiv(host: HTMLElement): void {
  host.attachShadow({ mode: 'closed' }).innerHTML =
    `<style>:host{display:block;width:140px;height:40px;background:#831843;color:#fff;font:600 14px/40px sans-serif;text-align:center}</style>Opaque div`;
}

// Indistinguishable pair: A renders its light DOM directly; B wraps the same slotted content in a painted box
// inside a closed root that adds no geometry of its own.
export class PairLight extends HTMLElement {}
export class PairClosed extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'closed' }).innerHTML = `<style>:host{display:block}.w{background:#dc2626}</style><div class="w"><slot></slot></div>`;
  }
}

// Serializable root containing another component: an inert copy must not run that component's constructor.
export class SerialWithChild extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'closed', serializable: true } as ShadowRootInit).innerHTML =
      `<style>:host{display:block;width:170px}</style><closed-badge label="Inner"></closed-badge>`;
  }
}

// Incomplete serialization, author-declared serializable: a nested closed root that is not serializable.
export class SerialNested extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'closed', serializable: true } as ShadowRootInit);
    root.innerHTML = `<style>:host{display:block;width:120px;height:32px;background:#0f766e;color:#fff;font:13px/32px sans-serif}</style><div class="inner"></div>`;
    root.querySelector('.inner')!.attachShadow({ mode: 'closed' }).innerHTML = `<b style="color:#fde047">Nested</b>`;
  }
}
// Incomplete serialization: styles come from a constructed (adopted) style sheet, which markup cannot carry.
export class SerialAdopted extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'closed', serializable: true } as ShadowRootInit);
    const sheet = new CSSStyleSheet();
    // :host rules reach a copy through the host's computed style; rules for inner elements do not.
    sheet.replaceSync(':host{display:block;width:120px;height:32px;background:#6d28d9;color:#fff;font:13px/32px sans-serif} b{display:inline-block;padding:0 8px;background:#fde047;color:#111}');
    root.adoptedStyleSheets = [sheet];
    root.innerHTML = `<b>Adopted</b>`;
  }
}

export function defineElements(): void {
  const all = { 'closed-badge': ClosedBadge, 'closed-slot-card': ClosedSlotCard, 'light-card': LightCard, 'closed-serial': ClosedSerializable, 'pair-light': PairLight, 'pair-closed': PairClosed, 'serial-nested': SerialNested, 'serial-adopted': SerialAdopted, 'serial-with-child': SerialWithChild };
  for (const [name, element] of Object.entries(all)) if (!customElements.get(name)) customElements.define(name, element);
}

export const providerStats = { represented: 0, retired: 0, disposed: 0 };

/**
 * The component library's provider (registered-component path, existing public API). It recognizes its own
 * elements and represents each with a component-built instance; the framework places and inerts it.
 */
export function closedBadgeProvider(): RepresentationProvider {
  return {
    name: 'closed-badge',
    represent(source, context): ProvidedRepresentation | undefined {
      if (!(source instanceof ClosedBadge)) return undefined;
      const node = source.representation(context.document);
      providerStats.represented++;
      let released = false;
      const release = () => { if (!released) { released = true; providerStats.disposed++; node.remove(); } };
      return {
        node,
        continuity: 'retained',
        // While the source exists, follow its attributes and animation time.
        frame: () => { if (source.isConnected) node.follow(source); },
        // After retirement the instance keeps rendering itself (its own CSS animation) until disposal.
        retire: () => { providerStats.retired++; return { dispose: release }; },
        dispose: release
      };
    }
  };
}

/**
 * Declared path (platform opt-in, no patching): a component that attaches its closed root with
 * `serializable: true` lets `getHTML({ serializableShadowRoots: true })` include it. This provider rebuilds a
 * static copy from that markup under a neutral host. Adopted style sheets are not serialized, and document
 * rules that target the host's tag do not reach the neutral host.
 */
let serializationComplete: boolean | undefined;
/**
 * One-time capability check on a detached throwaway host (no page mutation, no patching): does this engine
 * serialize every child of a serializable shadow root? Firefox 142 serializes only the first child.
 */
export function shadowSerializationComplete(document: Document): boolean {
  if (serializationComplete !== undefined) return serializationComplete;
  const probe = document.createElement('div') as HTMLDivElement & { getHTML?: (options: object) => string };
  probe.attachShadow({ mode: 'closed', serializable: true } as ShadowRootInit).innerHTML = '<i>a</i><b>b</b>';
  return (serializationComplete = !!probe.getHTML && probe.getHTML({ serializableShadowRoots: true }).includes('<b>b</b>'));
}

export function serializableShadowProvider(): RepresentationProvider {
  return {
    name: 'serializable-shadow',
    represent(source, context) {
      const element = source as Element & { getHTML?: (options: object) => string };
      if (!source.localName.includes('-') || source.shadowRoot || typeof element.getHTML !== 'function') return undefined;
      const html = element.getHTML({ serializableShadowRoots: true });
      if (!/^<template shadowrootmode="(closed|open)"/.test(html)) return undefined;
      // Declared, but this engine's markup would be incomplete: settle the participant rather than copy part of it.
      if (!shadowSerializationComplete(context.document)) return { declined: 'serializationIncomplete', settle: true };
      // A defined component inside the markup whose own root was not serialized cannot be copied without running it.
      // Inspect an inert parse (no browsing context, nothing constructed); open the roots so they can be read.
      const parsed = (Document as unknown as { parseHTMLUnsafe(html: string): Document }).parseHTMLUnsafe(`<div>${html.replace(/shadowrootmode="closed"/g, 'shadowrootmode="open"')}</div>`);
      const registry = context.document.defaultView?.customElements;
      const opaqueChild = (root: ParentNode): boolean => [...root.querySelectorAll('*')].some(child =>
        (child.localName.includes('-') && !!registry?.get(child.localName) && !child.shadowRoot) || (!!child.shadowRoot && opaqueChild(child.shadowRoot)));
      const top = parsed.body.firstElementChild;
      if (top?.shadowRoot && opaqueChild(top.shadowRoot)) return { declined: 'serializationIncomplete:nestedComponent', settle: true };
      // Inert copy: rename custom-element tags first, so no component constructor runs for the copy (parsing
      // into the live document would construct them). A declarative root attaches to the template's parent.
      const neutral = html.replace(/<(\/?)([a-z][a-z0-9]*-[a-z0-9._-]*)(?=[\s/>])/g, '<$1composable-inert-$2');
      const holder = context.document.createElement('div');
      (holder as HTMLElement & { setHTMLUnsafe(html: string): void }).setHTMLUnsafe(`<div>${neutral}</div>`);
      const node = holder.firstElementChild as HTMLElement;
      node.style.cssText = source.getAttribute('style') ?? '';
      return { node, continuity: 'static', dispose: () => node.remove() };
    }
  };
}

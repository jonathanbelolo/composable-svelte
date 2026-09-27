/**
 * Shared per-element observation used by the recorder and the removal witness, so both apply the
 * same DOM/style paint-eligibility rule.
 */
import type { ElementObservation, RepresentationObservation } from './types.js';

export type ElementQuery = Element | string | (() => Element | null);

export function resolveElement(query: ElementQuery | undefined): Element | null {
  if (!query) return null;
  if (typeof query === 'string') return document.querySelector(query);
  if (typeof query === 'function') return query();
  return query instanceof Element ? query : null;
}

/** Ancestor opacity product and whether an ancestor hides the element. */
export function inspectAncestors(el: Element): { opacityProduct: number; hidden: boolean } {
  let opacityProduct = 1;
  let hidden = false;
  for (let curr = el.parentElement; curr; curr = curr.parentElement) {
    const style = window.getComputedStyle(curr);
    const opacity = Number(style.opacity);
    opacityProduct *= opacity;
    if (style.display === 'none' || style.visibility === 'hidden' || opacity === 0) hidden = true;
  }
  return { opacityProduct, hidden };
}

/** Non-zero area is required: a 0×h or w×0 box paints nothing. */
export function hasPaintableArea(rect: DOMRect | undefined): boolean {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

export function isPaintEligible(parts: {
  connected: boolean;
  display: string | undefined;
  visibility: string | undefined;
  opacity: number | undefined;
  hasHiddenAncestor: boolean;
  rect: DOMRect | undefined;
}): boolean {
  return (
    parts.connected &&
    !parts.hasHiddenAncestor &&
    parts.display !== undefined &&
    parts.display !== 'none' &&
    parts.visibility !== 'hidden' &&
    parts.opacity !== undefined &&
    parts.opacity > 0 &&
    hasPaintableArea(parts.rect)
  );
}

const DISCONNECTED: ElementObservation = {
  connected: false,
  rect: undefined,
  opacity: undefined,
  transform: undefined,
  isFocused: false,
  pointerEvents: undefined,
  visibility: undefined,
  display: undefined,
  isHitTarget: false,
  hitElementTag: null,
  hitTested: false,
  paintEligible: false,
  focusVisible: false,
  containsFocus: false
};

/** Observes one element. Throws on unexpected DOM API failure; callers decide how to record it. */
export function observeElement(el: Element | null): ElementObservation {
  if (!el || !el.isConnected) return DISCONNECTED;
  const computed = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const opacity = Number(computed.opacity);
  const ancestors = inspectAncestors(el);

  // Hit test at the rect center; only meaningful when the center is inside the viewport.
  let isHitTarget = false;
  let hitElementTag: string | null = null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hitTested =
    cx >= 0 &&
    cy >= 0 &&
    cx < (window.innerWidth || document.documentElement.clientWidth) &&
    cy < (window.innerHeight || document.documentElement.clientHeight);
  if (hitTested) {
    const hit = document.elementFromPoint(cx, cy);
    if (hit) {
      hitElementTag = hit.tagName.toLowerCase();
      isHitTarget = hit === el || el.contains(hit);
    }
  }

  const active = document.activeElement;
  return {
    connected: true,
    rect,
    opacity,
    transform: computed.transform,
    isFocused: active === el,
    pointerEvents: computed.pointerEvents,
    visibility: computed.visibility,
    display: computed.display,
    isHitTarget,
    hitElementTag,
    hitTested,
    effectiveOpacity: opacity * ancestors.opacityProduct,
    hasHiddenAncestor: ancestors.hidden,
    paintEligible: isPaintEligible({
      connected: true,
      display: computed.display,
      visibility: computed.visibility,
      opacity,
      hasHiddenAncestor: ancestors.hidden,
      rect
    }),
    focusVisible: el.matches(':focus-visible'),
    containsFocus: active !== null && el.contains(active)
  };
}

export function observeRepresentation(rep: Element | null): RepresentationObservation {
  const present = rep !== null;
  const connected = rep?.isConnected ?? false;
  if (!rep || !connected) {
    return {
      present,
      connected,
      styleOpacity: undefined,
      computedOpacity: undefined,
      display: undefined,
      visibility: undefined,
      rect: undefined,
      hasHiddenAncestor: false,
      isPaintEligible: false
    };
  }
  const computed = window.getComputedStyle(rep);
  const computedOpacity = Number(computed.opacity);
  const rect = rep.getBoundingClientRect();
  const hasHiddenAncestor = inspectAncestors(rep).hidden;
  return {
    present,
    connected,
    styleOpacity: rep instanceof HTMLElement ? rep.style.opacity : undefined,
    computedOpacity,
    display: computed.display,
    visibility: computed.visibility,
    rect,
    hasHiddenAncestor,
    isPaintEligible: isPaintEligible({
      connected,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computedOpacity,
      hasHiddenAncestor,
      rect
    })
  };
}

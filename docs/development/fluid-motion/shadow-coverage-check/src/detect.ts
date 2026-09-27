/**
 * Read-only shadow evidence for an element (no patching, no mutation). Proposed to Core91 as the detection rule.
 * - `open`: an open root is readable.
 * - `declared`: a closed root the author declared serializable (its markup is readable).
 * - `confirmed`: some light child is not rendered while the host is, so a shadow root must be there.
 * - `suspected`: a defined custom element without an open root and no proof either way.
 * - `none`: no evidence (for a built-in element this includes an undetectable closed root without light children).
 */
export type ShadowEvidence = 'open' | 'declared' | 'confirmed' | 'suspected' | 'none';

// Elements that may host an author shadow root (DOM Standard `attachShadow` allow-list), plus custom elements.
const SHADOW_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'main', 'nav', 'p', 'section', 'span']);
// Children that never produce boxes even without a shadow root.
const BOXLESS = new Set(['wbr']);

export function shadowEvidence(element: Element): ShadowEvidence {
  const custom = element.localName.includes('-');
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || (!custom && !SHADOW_HOSTS.has(element.localName))) return 'none';
  if (element.shadowRoot) return 'open';
  const html = (element as Element & { getHTML?: (options: object) => string }).getHTML?.({ serializableShadowRoots: true });
  if (html && /^<template shadowrootmode=/.test(html)) return 'declared';
  const view = element.ownerDocument.defaultView;
  if (view && element.getClientRects().length > 0) {
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const display = view.getComputedStyle(child as Element).display;
        if (!BOXLESS.has((child as Element).localName) && display !== 'none' && display !== 'contents' && (child as Element).getClientRects().length === 0) return 'confirmed';
      } else if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) {
        const range = element.ownerDocument.createRange(); range.selectNodeContents(child);
        if (range.getClientRects().length === 0) return 'confirmed';
      }
    }
  }
  return custom && view?.customElements.get(element.localName) ? 'suspected' : 'none';
}

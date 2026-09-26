import { isFocusable, tabbable } from 'tabbable';
export type FocusElement = HTMLElement | SVGElement;
const options = { getShadowRoot: (node: Element) => node.shadowRoot ?? undefined };
export function deepActive(document: Document): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}
export function composedContains(parent: Element, target: Node): boolean {
  let current: Node | null = target;
  while (current) {
    if (current === parent) return true;
    current = current.parentNode ?? (current.nodeType === 11 ? (current as ShadowRoot).host : null);
  }
  return false;
}
export function eligible(node: Element | null | undefined, document: Document): boolean {
  return !!node && node.ownerDocument === document && node.isConnected && isFocusable(node, options);
}
export function candidates(node: HTMLElement): FocusElement[] {
  return node.isConnected ? tabbable(node, options) : [];
}

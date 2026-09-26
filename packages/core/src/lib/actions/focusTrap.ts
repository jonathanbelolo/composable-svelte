import { enrollLayer } from './dismissalCoordinator.js';

interface FocusTrapOptions {
  returnFocus?: HTMLElement | null | undefined;
  autoFocus?: boolean | undefined;
}
/**
 * A standalone modal focus boundary. Native primitives share their existing
 * dismissal entry instead, so nested portals have one document ordering.
 * Focus work is synchronized with rendering and revoked on action destruction.
 */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
  const handle = enrollLayer({node, focus: {
    node, modal: true, autoFocus: options.autoFocus ?? true,
    returnFocus: () => options.returnFocus ?? null
  }});
  return { destroy() { handle.release(); } };
}

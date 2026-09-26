import { rehomeAdoptedLayers } from './dismissalCoordinator.js';

/**
 * Portal (teleport) an element to a different location in the DOM.
 *
 * Default target is document.body, but can be customized.
 * Properly handles cleanup when component is destroyed.
 *
 * @example
 * ```svelte
 * <div use:portal>
 *   This will be appended to document.body
 * </div>
 * ```
 *
 * @example
 * ```svelte
 * <div use:portal={'#portal-target'}>
 *   This will be appended to #portal-target
 * </div>
 * ```
 */
export function portal(
  node: HTMLElement,
  target: HTMLElement | string = 'body'
) {
  let targetEl: HTMLElement | null = null;

  const mount = () => {
    // Resolve target
    if (typeof target === 'string') {
      targetEl = node.ownerDocument.querySelector(target);
      if (!targetEl) {
        console.error(`[portal] Target not found: ${target}`);
        return;
      }
    } else {
      targetEl = target;
    }

    // Move node to target. An explicit Element target may belong to another document; enrolled layers inside follow the node.
    const from = node.ownerDocument;
    targetEl.appendChild(node);
    if (node.ownerDocument !== from) rehomeAdoptedLayers(from);
  };

  const unmount = () => {
    if (targetEl && node.parentNode === targetEl) {
      targetEl.removeChild(node);
    }
  };

  mount();

  return {
    update(newTarget: HTMLElement | string) {
      unmount();
      target = newTarget;
      mount();
    },
    destroy() {
      unmount();
    }
  };
}

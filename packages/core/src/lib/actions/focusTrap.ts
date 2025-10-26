/**
 * Focus trap action to keep focus within a container element.
 *
 * Used for modal dialogs to ensure keyboard navigation stays within the modal.
 * Follows ARIA authoring practices for dialog focus management.
 *
 * Features:
 * - Traps Tab and Shift+Tab navigation within container
 * - Auto-focuses first focusable element on mount
 * - Returns focus to trigger element on destroy
 *
 * @example
 * ```svelte
 * <div use:focusTrap={{ returnFocus: triggerElement }}>
 *   <button>First</button>
 *   <button>Last</button>
 * </div>
 * ```
 */

interface FocusTrapOptions {
  /**
   * Element to return focus to when trap is destroyed.
   * Typically the button/element that opened the modal.
   */
  returnFocus?: HTMLElement | null;

  /**
   * Whether to auto-focus the first focusable element on mount.
   * @default true
   */
  autoFocus?: boolean;
}

/**
 * Get all focusable elements within a container.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => {
      // Check if element is visible and not hidden
      const element = el as HTMLElement;
      return (
        element.offsetParent !== null &&
        !element.hasAttribute('aria-hidden') &&
        window.getComputedStyle(element).display !== 'none' &&
        window.getComputedStyle(element).visibility !== 'hidden'
      );
    }
  ) as HTMLElement[];
}

export function focusTrap(
  node: HTMLElement,
  options: FocusTrapOptions = {}
) {
  const { returnFocus = null, autoFocus = true } = options;

  // Store the previously focused element
  const previouslyFocused = returnFocus || (document.activeElement as HTMLElement);

  // Focus first element on mount
  if (autoFocus) {
    // Use setTimeout to ensure the element is fully rendered
    setTimeout(() => {
      const focusableElements = getFocusableElements(node);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }, 0);
  }

  // Handle Tab key navigation
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const focusableElements = getFocusableElements(node);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift+Tab: Move focus backwards
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: Move focus forwards
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  // Add event listener
  node.addEventListener('keydown', handleKeyDown);

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeyDown);

      // Return focus to previously focused element
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        // Use setTimeout to ensure modal is fully removed from DOM
        setTimeout(() => {
          try {
            previouslyFocused.focus();
          } catch (error) {
            console.warn('[focusTrap] Failed to return focus:', error);
          }
        }, 0);
      }
    }
  };
}

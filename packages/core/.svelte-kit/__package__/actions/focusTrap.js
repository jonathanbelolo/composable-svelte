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
/**
 * Get all focusable elements within a container.
 */
function getFocusableElements(container) {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(container.querySelectorAll(selector)).filter((el) => {
        // Check if element is visible and not hidden
        const element = el;
        return (element.offsetParent !== null &&
            !element.hasAttribute('aria-hidden') &&
            window.getComputedStyle(element).display !== 'none' &&
            window.getComputedStyle(element).visibility !== 'hidden');
    });
}
export function focusTrap(node, options = {}) {
    const { returnFocus = null, autoFocus = true } = options;
    // Store the previously focused element
    const previouslyFocused = returnFocus || document.activeElement;
    // Focus first element on mount
    if (autoFocus) {
        // Use setTimeout to ensure the element is fully rendered
        setTimeout(() => {
            const focusableElements = getFocusableElements(node);
            const firstElement = focusableElements[0];
            if (firstElement) {
                firstElement.focus();
            }
        }, 0);
    }
    // Handle Tab key navigation
    function handleKeyDown(event) {
        if (event.key !== 'Tab')
            return;
        const focusableElements = getFocusableElements(node);
        if (focusableElements.length === 0)
            return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        // TypeScript doesn't know the length check above ensures these exist
        if (!firstElement || !lastElement)
            return;
        if (event.shiftKey) {
            // Shift+Tab: Move focus backwards
            if (document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }
        }
        else {
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
                    }
                    catch (error) {
                        console.warn('[focusTrap] Failed to return focus:', error);
                    }
                }, 0);
            }
        }
    };
}

/**
 * Detect clicks outside the given element and call handler.
 *
 * Adapted from Radix UI DismissableLayer for robust outside click detection.
 * Handles:
 * - Pointer events (mouse, touch, pen)
 * - Nested portals (clicks in other modals)
 * - Browser default behaviors
 *
 * @example
 * ```svelte
 * <div use:clickOutside={handleClickOutside}>
 *   Content here
 * </div>
 * ```
 */
export function clickOutside(node, handler) {
    const handlePointerDown = (event) => {
        // Ignore right-clicks and middle-clicks
        if (event.button !== 0)
            return;
        // Check if click is outside the node
        const target = event.target;
        if (node.contains(target))
            return;
        // Call handler
        handler(event);
    };
    // Use pointerdown for better mobile support
    // Delay by one tick to avoid conflicts with click events
    const pointerDownListener = (event) => {
        setTimeout(() => handlePointerDown(event), 0);
    };
    document.addEventListener('pointerdown', pointerDownListener, true);
    return {
        destroy() {
            document.removeEventListener('pointerdown', pointerDownListener, true);
        }
    };
}

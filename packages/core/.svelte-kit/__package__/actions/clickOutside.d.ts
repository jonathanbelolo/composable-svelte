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
export declare function clickOutside(node: HTMLElement, handler: (event: PointerEvent) => void): {
    destroy(): void;
};
//# sourceMappingURL=clickOutside.d.ts.map
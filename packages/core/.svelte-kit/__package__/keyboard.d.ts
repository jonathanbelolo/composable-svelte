/**
 * Keyboard navigation utilities for accessible components.
 * Adapted from Radix UI Roving Focus patterns.
 */
export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
/**
 * Handle arrow key navigation in a list.
 *
 * @param event - Keyboard event
 * @param currentIndex - Current focused index
 * @param itemCount - Total number of items
 * @param orientation - List orientation (horizontal or vertical)
 * @returns New index to focus, or null if key not handled
 *
 * @example
 * ```typescript
 * function handleKeyDown(event: KeyboardEvent) {
 *   const newIndex = handleArrowNavigation(
 *     event,
 *     activeIndex,
 *     tabs.length,
 *     'horizontal'
 *   );
 *
 *   if (newIndex !== null) {
 *     setActiveIndex(newIndex);
 *   }
 * }
 * ```
 */
export declare function handleArrowNavigation(event: KeyboardEvent, currentIndex: number, itemCount: number, orientation?: 'horizontal' | 'vertical'): number | null;
/**
 * Create a focus trap that keeps focus within a container.
 *
 * Used for modals and dialogs to prevent Tab from leaving the modal.
 *
 * @param container - Container element to trap focus within
 * @returns Cleanup function
 *
 * @example
 * ```typescript
 * $effect(() => {
 *   if (visible) {
 *     const cleanup = createFocusTrap(containerElement);
 *     return cleanup;
 *   }
 * });
 * ```
 */
export declare function createFocusTrap(container: HTMLElement): () => void;
//# sourceMappingURL=keyboard.d.ts.map
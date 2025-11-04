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
export declare function focusTrap(node: HTMLElement, options?: FocusTrapOptions): {
    destroy(): void;
};
export {};
//# sourceMappingURL=focusTrap.d.ts.map
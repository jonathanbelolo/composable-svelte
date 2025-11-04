import type { Snippet } from 'svelte';
/**
 * Tooltip component - Hover-triggered tooltip with state-based animations.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * coordinated animations and state management.
 *
 * @example
 * ```svelte
 * <Tooltip content="Click to save">
 *   <button>Save</button>
 * </Tooltip>
 * ```
 */
interface TooltipProps {
    /**
     * Tooltip content (string).
     */
    content: string;
    /**
     * Tooltip position relative to trigger element.
     * @default 'top'
     */
    position?: 'top' | 'bottom' | 'left' | 'right';
    /**
     * Delay before showing tooltip (ms).
     * @default 300
     */
    delay?: number;
    /**
     * Additional CSS classes for the tooltip container.
     */
    class?: string;
    /**
     * Disable tooltip.
     * @default false
     */
    disabled?: boolean;
    /**
     * Trigger element (wrapped children).
     */
    children: Snippet;
}
declare const Tooltip: import("svelte").Component<TooltipProps, {}, "">;
type Tooltip = ReturnType<typeof Tooltip>;
export default Tooltip;
//# sourceMappingURL=Tooltip.svelte.d.ts.map
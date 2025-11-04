import type { PresentationState } from '../../../navigation/types.js';
/**
 * TooltipPrimitive - Animation-driven tooltip display
 *
 * Watches presentation state and triggers animations via Motion One.
 * This is the low-level primitive - use Tooltip.svelte for most cases.
 */
interface TooltipPrimitiveProps {
    /**
     * Presentation state from tooltip reducer
     */
    presentation: PresentationState<string>;
    /**
     * Callback when presentation animation completes
     */
    onPresentationComplete?: () => void;
    /**
     * Callback when dismissal animation completes
     */
    onDismissalComplete?: () => void;
    /**
     * Tooltip position relative to trigger
     * @default 'top'
     */
    position?: 'top' | 'bottom' | 'left' | 'right';
    /**
     * Additional CSS classes
     */
    class?: string;
}
declare const TooltipPrimitive: import("svelte").Component<TooltipPrimitiveProps, {}, "">;
type TooltipPrimitive = ReturnType<typeof TooltipPrimitive>;
export default TooltipPrimitive;
//# sourceMappingURL=TooltipPrimitive.svelte.d.ts.map
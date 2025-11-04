import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface SheetPrimitiveProps<State, Action> {
    /**
     * Scoped store for the sheet content.
     * When null, sheet is hidden. When non-null, sheet is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;
    /**
     * Callback when presentation animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'presentationCompleted' } }
     */
    onPresentationComplete?: () => void;
    /**
     * Callback when dismissal animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'dismissalCompleted' } }
     */
    onDismissalComplete?: () => void;
    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;
    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean;
    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
    /**
     * Side from which the sheet slides in.
     * @default 'bottom'
     */
    side?: 'bottom' | 'left' | 'right';
    /**
     * Height of the sheet as CSS value (for bottom sheets).
     * @default '60vh'
     */
    height?: string;
    /**
     * Element to return focus to when sheet is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
}
declare const SheetPrimitive: import("svelte").Component<SheetPrimitiveProps<unknown, unknown>, {}, "">;
type SheetPrimitive = ReturnType<typeof SheetPrimitive>;
export default SheetPrimitive;
//# sourceMappingURL=SheetPrimitive.svelte.d.ts.map
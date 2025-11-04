import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface PopoverPrimitiveProps<State, Action> {
    /**
     * Scoped store for the popover content.
     * When null, popover is hidden. When non-null, popover is visible.
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
     * Element to return focus to when popover is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
}
declare const PopoverPrimitive: import("svelte").Component<PopoverPrimitiveProps<unknown, unknown>, {}, "">;
type PopoverPrimitive = ReturnType<typeof PopoverPrimitive>;
export default PopoverPrimitive;
//# sourceMappingURL=PopoverPrimitive.svelte.d.ts.map
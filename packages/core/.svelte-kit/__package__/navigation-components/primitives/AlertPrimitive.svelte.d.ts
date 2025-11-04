import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface AlertPrimitiveProps<State, Action> {
    /**
     * Scoped store for the alert content.
     * When null, alert is hidden. When non-null, alert is visible.
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
     * Element to return focus to when alert is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
}
declare const AlertPrimitive: import("svelte").Component<AlertPrimitiveProps<unknown, unknown>, {}, "">;
type AlertPrimitive = ReturnType<typeof AlertPrimitive>;
export default AlertPrimitive;
//# sourceMappingURL=AlertPrimitive.svelte.d.ts.map
import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
import type { PresentationState } from '../navigation/types.js';
import type { SpringConfig } from '../animation/spring-config.js';
interface AlertProps<State, Action> {
    /**
     * Scoped store for the alert content.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;
    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: () => void;
    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: () => void;
    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;
    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;
    /**
     * Override backdrop classes.
     */
    backdropClass?: string;
    /**
     * Override content container classes.
     */
    class?: string;
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
}
declare const Alert: import("svelte").Component<AlertProps<unknown, unknown>, {}, "">;
type Alert = ReturnType<typeof Alert>;
export default Alert;
//# sourceMappingURL=Alert.svelte.d.ts.map
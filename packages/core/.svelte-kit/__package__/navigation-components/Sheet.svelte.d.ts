import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
import type { PresentationState } from '../navigation/types.js';
import type { SpringConfig } from '../animation/spring-config.js';
interface SheetProps<State, Action> {
    /**
     * Scoped store for the sheet content.
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
}
declare const Sheet: import("svelte").Component<SheetProps<unknown, unknown>, {}, "">;
type Sheet = ReturnType<typeof Sheet>;
export default Sheet;
//# sourceMappingURL=Sheet.svelte.d.ts.map
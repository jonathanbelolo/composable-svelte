import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
import type { PresentationState } from '../navigation/types.js';
import type { SpringConfig } from '../animation/spring-config.js';
interface DrawerProps<State, Action> {
    /**
     * Scoped store for the drawer content.
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
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right';
    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string;
}
declare const Drawer: import("svelte").Component<DrawerProps<unknown, unknown>, {}, "">;
type Drawer = ReturnType<typeof Drawer>;
export default Drawer;
//# sourceMappingURL=Drawer.svelte.d.ts.map
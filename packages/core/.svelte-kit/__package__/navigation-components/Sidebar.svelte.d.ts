import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
import type { PresentationState } from '../navigation/types.js';
import type { SpringConfig } from '../animation/spring-config.js';
interface SidebarProps<State, Action> {
    /**
     * Scoped store for the sidebar content.
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
     * Override content container classes.
     */
    class?: string;
    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
    /**
     * Side where the sidebar is positioned.
     * @default 'left'
     */
    side?: 'left' | 'right';
    /**
     * Width of the sidebar as CSS value.
     * @default '240px'
     */
    width?: string;
}
declare const Sidebar: import("svelte").Component<SidebarProps<unknown, unknown>, {}, "">;
type Sidebar = ReturnType<typeof Sidebar>;
export default Sidebar;
//# sourceMappingURL=Sidebar.svelte.d.ts.map
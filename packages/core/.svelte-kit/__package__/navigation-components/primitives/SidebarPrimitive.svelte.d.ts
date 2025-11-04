import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface SidebarPrimitiveProps<State, Action> {
    /**
     * Scoped store for the sidebar content.
     * When null, sidebar is hidden. When non-null, sidebar is visible.
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
declare const SidebarPrimitive: import("svelte").Component<SidebarPrimitiveProps<unknown, unknown>, {}, "">;
type SidebarPrimitive = ReturnType<typeof SidebarPrimitive>;
export default SidebarPrimitive;
//# sourceMappingURL=SidebarPrimitive.svelte.d.ts.map
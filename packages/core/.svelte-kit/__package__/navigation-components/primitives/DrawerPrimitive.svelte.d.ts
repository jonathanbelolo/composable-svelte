import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface DrawerPrimitiveProps<State, Action> {
    /**
     * Scoped store for the drawer content.
     * When null, drawer is hidden. When non-null, drawer is visible.
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
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right';
    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string;
    /**
     * Element to return focus to when drawer is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
}
declare const DrawerPrimitive: import("svelte").Component<DrawerPrimitiveProps<unknown, unknown>, {}, "">;
type DrawerPrimitive = ReturnType<typeof DrawerPrimitive>;
export default DrawerPrimitive;
//# sourceMappingURL=DrawerPrimitive.svelte.d.ts.map
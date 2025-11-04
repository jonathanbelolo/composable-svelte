import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
import type { PresentationState } from '../navigation/types.js';
import type { SpringConfig } from '../animation/spring.js';
interface AnimatedNavigationStackProps<State, Action> {
    /**
     * Scoped store for the stack content.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Stack of screen states.
     */
    stack: readonly State[];
    /**
     * Presentation state for animation lifecycle.
     */
    presentation: PresentationState<any>;
    /**
     * Callback to handle going back in the stack.
     */
    onBack?: () => void;
    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: () => void;
    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: () => void;
    /**
     * Custom spring configuration for animations.
     * @default Uses drawer preset (0.35s duration, 0.25 bounce)
     */
    springConfig?: Partial<SpringConfig>;
    /**
     * Disable all default styling.
     * When true, component behaves more like the primitive.
     * @default false
     */
    unstyled?: boolean;
    /**
     * Override container classes.
     */
    class?: string;
    /**
     * Override header classes.
     */
    headerClass?: string;
    /**
     * Override content classes.
     */
    contentClass?: string;
    /**
     * Show back button in header.
     * @default true
     */
    showBackButton?: boolean;
}
declare const AnimatedNavigationStack: import("svelte").Component<AnimatedNavigationStackProps<unknown, unknown>, {}, "">;
type AnimatedNavigationStack = ReturnType<typeof AnimatedNavigationStack>;
export default AnimatedNavigationStack;
//# sourceMappingURL=AnimatedNavigationStack.svelte.d.ts.map
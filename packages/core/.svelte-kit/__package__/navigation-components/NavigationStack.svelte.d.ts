import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
interface NavigationStackProps<State, Action> {
    /**
     * Scoped store for the stack content.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Stack of screen states.
     */
    stack: readonly State[];
    /**
     * Callback to handle going back in the stack.
     */
    onBack?: () => void;
    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
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
declare const NavigationStack: import("svelte").Component<NavigationStackProps<unknown, unknown>, {}, "">;
type NavigationStack = ReturnType<typeof NavigationStack>;
export default NavigationStack;
//# sourceMappingURL=NavigationStack.svelte.d.ts.map
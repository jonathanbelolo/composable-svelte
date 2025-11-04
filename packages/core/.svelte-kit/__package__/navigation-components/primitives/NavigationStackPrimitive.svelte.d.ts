import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
interface NavigationStackPrimitiveProps<State, Action> {
    /**
     * Scoped store for the stack content.
     * When null, stack is hidden. When non-null, stack is visible.
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
}
declare const NavigationStackPrimitive: import("svelte").Component<NavigationStackPrimitiveProps<unknown, unknown>, {}, "">;
type NavigationStackPrimitive = ReturnType<typeof NavigationStackPrimitive>;
export default NavigationStackPrimitive;
//# sourceMappingURL=NavigationStackPrimitive.svelte.d.ts.map
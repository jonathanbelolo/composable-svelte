import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
interface TabsPrimitiveProps<State, Action> {
    /**
     * Scoped store for the tabs content.
     * When null, tabs are hidden. When non-null, tabs are visible.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Tab labels for rendering tab buttons.
     */
    tabs: string[];
    /**
     * Currently active tab index.
     */
    activeTab: number;
    /**
     * Callback when tab is clicked.
     */
    onTabChange: (index: number) => void;
}
declare const TabsPrimitive: import("svelte").Component<TabsPrimitiveProps<unknown, unknown>, {}, "">;
type TabsPrimitive = ReturnType<typeof TabsPrimitive>;
export default TabsPrimitive;
//# sourceMappingURL=TabsPrimitive.svelte.d.ts.map
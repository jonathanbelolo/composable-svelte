import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
interface TabsProps<State, Action> {
    /**
     * Scoped store for the tabs content.
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
    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;
    /**
     * Override tab list container classes.
     */
    tabListClass?: string;
    /**
     * Override individual tab button classes.
     */
    tabClass?: string;
    /**
     * Override content container classes.
     */
    class?: string;
}
declare const Tabs: import("svelte").Component<TabsProps<unknown, unknown>, {}, "">;
type Tabs = ReturnType<typeof Tabs>;
export default Tabs;
//# sourceMappingURL=Tabs.svelte.d.ts.map
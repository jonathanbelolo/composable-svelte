import type { Store } from '../../../types.js';
import type { CollapsibleState, CollapsibleAction } from './collapsible.types.js';
interface CollapsibleContext {
    store: Store<CollapsibleState, CollapsibleAction>;
    contentId: string;
    triggerId: string;
}
export declare function setCollapsibleContext(context: CollapsibleContext): void;
export declare function getCollapsibleContext(): CollapsibleContext;
/**
 * Collapsible component - Single expandable section.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * state management. Provides context for trigger and content components.
 *
 * @example
 * ```svelte
 * <Collapsible {store}>
 *   <CollapsibleTrigger>Click to expand</CollapsibleTrigger>
 *   <CollapsibleContent>This is the collapsible content</CollapsibleContent>
 * </Collapsible>
 * ```
 */
interface CollapsibleProps {
    /**
     * Collapsible store.
     */
    store: Store<CollapsibleState, CollapsibleAction>;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Children content.
     */
    children?: import('svelte').Snippet;
}
declare const Collapsible: import("svelte").Component<CollapsibleProps, {}, "">;
type Collapsible = ReturnType<typeof Collapsible>;
export default Collapsible;
//# sourceMappingURL=Collapsible.svelte.d.ts.map
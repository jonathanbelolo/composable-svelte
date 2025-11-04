import type { Store } from '../../../types.js';
import type { AccordionState, AccordionAction } from './accordion.types.js';
export declare function setAccordionContext(store: Store<AccordionState, AccordionAction>): void;
export declare function getAccordionContext(): Store<AccordionState, AccordionAction>;
import type { AccordionItem } from './accordion.types.js';
/**
 * Accordion component - Collapsible sections.
 *
 * Uses Composable Architecture pattern with reducer and store for
 * state management.
 *
 * @example
 * ```svelte
 * <Accordion items={[
 *   { id: '1', title: 'Section 1', content: 'Content 1' },
 *   { id: '2', title: 'Section 2', content: 'Content 2' }
 * ]} />
 * ```
 */
interface AccordionProps {
    /**
     * Accordion items (optional - use this for declarative mode or omit to use composition with AccordionItem children).
     */
    items?: AccordionItem[];
    /**
     * Initially expanded item IDs.
     */
    initialExpandedIds?: string[];
    /**
     * Allow multiple items expanded simultaneously.
     */
    allowMultiple?: boolean;
    /**
     * Allow all items to be collapsed (no minimum expanded).
     */
    collapsible?: boolean;
    /**
     * Callback when an item is expanded.
     */
    onExpand?: (id: string) => void;
    /**
     * Callback when an item is collapsed.
     */
    onCollapse?: (id: string) => void;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Accordion: import("svelte").Component<AccordionProps, {}, "">;
type Accordion = ReturnType<typeof Accordion>;
export default Accordion;
//# sourceMappingURL=Accordion.svelte.d.ts.map
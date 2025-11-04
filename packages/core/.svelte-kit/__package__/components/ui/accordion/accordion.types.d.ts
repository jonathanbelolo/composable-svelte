/**
 * Accordion Types
 *
 * State management types for accordion component (collapsible sections).
 *
 * @packageDocumentation
 */
/**
 * Accordion item configuration.
 */
export interface AccordionItem {
    /**
     * Unique identifier for the item.
     */
    id: string;
    /**
     * Title/header text.
     */
    title: string;
    /**
     * Content to display when expanded.
     */
    content: string;
    /**
     * Whether the item is disabled.
     */
    disabled?: boolean;
}
/**
 * Accordion state.
 */
export interface AccordionState {
    /**
     * All accordion items.
     */
    items: AccordionItem[];
    /**
     * IDs of currently expanded items.
     */
    expandedIds: string[];
    /**
     * Whether multiple items can be expanded simultaneously.
     * If false, expanding one item will collapse others (radio behavior).
     */
    allowMultiple: boolean;
    /**
     * Whether all items can be collapsed (no minimum expanded).
     */
    collapsible: boolean;
}
/**
 * Accordion actions.
 */
export type AccordionAction = {
    type: 'itemToggled';
    id: string;
} | {
    type: 'itemExpanded';
    id: string;
} | {
    type: 'itemCollapsed';
    id: string;
} | {
    type: 'allExpanded';
} | {
    type: 'allCollapsed';
} | {
    type: 'itemsChanged';
    items: AccordionItem[];
} | {
    type: 'itemRegistered';
    id: string;
    disabled?: boolean;
} | {
    type: 'itemUnregistered';
    id: string;
};
/**
 * Accordion dependencies.
 */
export interface AccordionDependencies {
    /**
     * Callback when an item is expanded.
     */
    onExpand?: (id: string) => void;
    /**
     * Callback when an item is collapsed.
     */
    onCollapse?: (id: string) => void;
}
/**
 * Create initial accordion state.
 */
export declare function createInitialAccordionState(items?: AccordionItem[], initialExpandedIds?: string[], allowMultiple?: boolean, collapsible?: boolean): AccordionState;
//# sourceMappingURL=accordion.types.d.ts.map
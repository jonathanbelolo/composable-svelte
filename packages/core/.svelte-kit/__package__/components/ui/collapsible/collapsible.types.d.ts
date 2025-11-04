/**
 * Collapsible Types
 *
 * State management types for collapsible component (single expandable section).
 *
 * @packageDocumentation
 */
/**
 * Collapsible state.
 */
export interface CollapsibleState {
    /**
     * Whether the collapsible is currently expanded.
     */
    isExpanded: boolean;
    /**
     * Whether the collapsible is disabled.
     */
    disabled: boolean;
}
/**
 * Collapsible actions.
 */
export type CollapsibleAction = {
    type: 'toggled';
} | {
    type: 'expanded';
} | {
    type: 'collapsed';
} | {
    type: 'disabledChanged';
    disabled: boolean;
};
/**
 * Collapsible dependencies.
 */
export interface CollapsibleDependencies {
    /**
     * Callback when the collapsible is expanded.
     */
    onExpand?: () => void;
    /**
     * Callback when the collapsible is collapsed.
     */
    onCollapse?: () => void;
}
/**
 * Create initial collapsible state.
 */
export declare function createInitialCollapsibleState(isExpanded?: boolean, disabled?: boolean): CollapsibleState;
//# sourceMappingURL=collapsible.types.d.ts.map
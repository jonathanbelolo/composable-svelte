/**
 * CollapsibleTrigger component - Clickable trigger for collapsible.
 *
 * Displays a button with a chevron icon that rotates based on expand state.
 * Dispatches 'toggled' action when clicked.
 *
 * @example
 * ```svelte
 * <CollapsibleTrigger>
 *   Click to expand
 * </CollapsibleTrigger>
 * ```
 */
interface CollapsibleTriggerProps {
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Children content.
     */
    children?: import('svelte').Snippet;
}
declare const CollapsibleTrigger: import("svelte").Component<CollapsibleTriggerProps, {}, "">;
type CollapsibleTrigger = ReturnType<typeof CollapsibleTrigger>;
export default CollapsibleTrigger;
//# sourceMappingURL=CollapsibleTrigger.svelte.d.ts.map
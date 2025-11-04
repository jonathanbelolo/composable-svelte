/**
 * CollapsibleContent component - Collapsible content section.
 *
 * Uses centralized animation system for smooth expand/collapse animations.
 * Only renders content when expanded for performance.
 *
 * @example
 * ```svelte
 * <CollapsibleContent>
 *   This is the content that will expand and collapse.
 * </CollapsibleContent>
 * ```
 */
interface CollapsibleContentProps {
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Children content.
     */
    children?: import('svelte').Snippet;
}
declare const CollapsibleContent: import("svelte").Component<CollapsibleContentProps, {}, "">;
type CollapsibleContent = ReturnType<typeof CollapsibleContent>;
export default CollapsibleContent;
//# sourceMappingURL=CollapsibleContent.svelte.d.ts.map
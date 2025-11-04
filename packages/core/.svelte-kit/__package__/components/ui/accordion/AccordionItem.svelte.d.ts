interface AccordionItemContext {
    id: string;
    disabled: boolean;
}
export declare function setAccordionItemContext(context: AccordionItemContext): void;
export declare function getAccordionItemContext(): AccordionItemContext;
/**
 * AccordionItem component - Individual accordion section.
 *
 * @example
 * ```svelte
 * <AccordionItem id="item-1" disabled={false}>
 *   <AccordionTrigger>Title</AccordionTrigger>
 *   <AccordionContent>Content</AccordionContent>
 * </AccordionItem>
 * ```
 */
interface AccordionItemProps {
    /**
     * Unique item ID.
     */
    id: string;
    /**
     * Whether the item is disabled.
     */
    disabled?: boolean;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const AccordionItem: import("svelte").Component<AccordionItemProps, {}, "">;
type AccordionItem = ReturnType<typeof AccordionItem>;
export default AccordionItem;
//# sourceMappingURL=AccordionItem.svelte.d.ts.map
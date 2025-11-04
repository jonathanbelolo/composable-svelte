/**
 * FormItem component - Wrapper for form field elements.
 * Provides consistent spacing and layout for form fields.
 *
 * @example
 * ```svelte
 * <FormItem>
 *   <FormLabel>Email</FormLabel>
 *   <FormControl>
 *     <Input type="email" />
 *   </FormControl>
 *   <FormDescription>Enter your email address</FormDescription>
 *   <FormMessage />
 * </FormItem>
 * ```
 */
interface Props {
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Children elements
     */
    children?: import('svelte').Snippet;
}
declare const FormItem: import("svelte").Component<Props, {}, "">;
type FormItem = ReturnType<typeof FormItem>;
export default FormItem;
//# sourceMappingURL=FormItem.svelte.d.ts.map
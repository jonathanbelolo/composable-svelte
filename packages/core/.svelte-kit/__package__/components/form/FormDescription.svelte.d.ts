/**
 * FormDescription component - Helper text for form fields.
 * Provides additional context or instructions for the field.
 *
 * @example
 * ```svelte
 * <FormDescription>
 *   We'll never share your email with anyone else.
 * </FormDescription>
 * ```
 */
interface Props {
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Description text
     */
    children?: import('svelte').Snippet;
}
declare const FormDescription: import("svelte").Component<Props, {}, "">;
type FormDescription = ReturnType<typeof FormDescription>;
export default FormDescription;
//# sourceMappingURL=FormDescription.svelte.d.ts.map
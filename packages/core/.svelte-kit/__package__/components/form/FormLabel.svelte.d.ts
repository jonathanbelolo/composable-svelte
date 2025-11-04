/**
 * FormLabel component - Label for form fields with error styling.
 * Automatically connects to the field via context.
 *
 * @example
 * ```svelte
 * <FormLabel>Email Address</FormLabel>
 * ```
 */
interface Props {
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Label text
     */
    children?: import('svelte').Snippet;
}
declare const FormLabel: import("svelte").Component<Props, {}, "">;
type FormLabel = ReturnType<typeof FormLabel>;
export default FormLabel;
//# sourceMappingURL=FormLabel.svelte.d.ts.map
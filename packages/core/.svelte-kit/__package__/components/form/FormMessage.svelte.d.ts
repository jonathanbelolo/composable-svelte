/**
 * FormMessage component - Displays validation errors and loading state.
 * Automatically shows field error from context.
 *
 * @example
 * ```svelte
 * <FormMessage />
 * ```
 *
 * @example With custom error message
 * ```svelte
 * <FormMessage>Custom error message</FormMessage>
 * ```
 */
interface Props {
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Optional custom message (overrides field error)
     */
    children?: import('svelte').Snippet;
}
declare const FormMessage: import("svelte").Component<Props, {}, "">;
type FormMessage = ReturnType<typeof FormMessage>;
export default FormMessage;
//# sourceMappingURL=FormMessage.svelte.d.ts.map
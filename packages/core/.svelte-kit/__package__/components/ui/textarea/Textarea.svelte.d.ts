/**
 * Textarea component - Multi-line text input.
 *
 * @example
 * ```svelte
 * <Textarea
 *   bind:value={message}
 *   placeholder="Enter your message..."
 *   rows={4}
 * />
 * ```
 */
interface Props {
    /**
     * The textarea value
     */
    value?: string;
    /**
     * Number of visible text rows
     */
    rows?: number;
    /**
     * Placeholder text
     */
    placeholder?: string;
    /**
     * Whether the textarea is disabled
     */
    disabled?: boolean;
    /**
     * Whether to allow resizing (vertical, horizontal, both, none)
     */
    resize?: 'none' | 'vertical' | 'horizontal' | 'both';
    /**
     * Optional class name
     */
    class?: string;
    /**
     * All other textarea attributes
     */
    [key: string]: any;
}
declare const Textarea: import("svelte").Component<Props, {}, "value">;
type Textarea = ReturnType<typeof Textarea>;
export default Textarea;
//# sourceMappingURL=Textarea.svelte.d.ts.map
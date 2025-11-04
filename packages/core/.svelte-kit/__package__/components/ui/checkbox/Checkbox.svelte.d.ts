/**
 * Checkbox component - Binary choice input.
 *
 * @example
 * ```svelte
 * <Checkbox bind:checked={acceptTerms} />
 * ```
 *
 * @example With indeterminate state
 * ```svelte
 * <Checkbox
 *   bind:checked={selectAll}
 *   indeterminate={someSelected && !allSelected}
 * />
 * ```
 */
interface Props {
    /**
     * Whether the checkbox is checked
     */
    checked?: boolean;
    /**
     * Whether the checkbox is in indeterminate state (dash instead of check)
     */
    indeterminate?: boolean;
    /**
     * Whether the checkbox is disabled
     */
    disabled?: boolean;
    /**
     * Optional class name
     */
    class?: string;
    /**
     * All other input attributes
     */
    [key: string]: any;
}
declare const Checkbox: import("svelte").Component<Props, {}, "checked">;
type Checkbox = ReturnType<typeof Checkbox>;
export default Checkbox;
//# sourceMappingURL=Checkbox.svelte.d.ts.map
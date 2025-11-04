/**
 * RadioGroup component - Container for radio buttons.
 * Manages selection state for a group of radio options.
 *
 * @example
 * ```svelte
 * <RadioGroup bind:value={selectedValue}>
 *   <Radio value="option1">Option 1</Radio>
 *   <Radio value="option2">Option 2</Radio>
 *   <Radio value="option3">Option 3</Radio>
 * </RadioGroup>
 * ```
 */
interface Props {
    /**
     * The currently selected value
     */
    value?: string | null;
    /**
     * The name attribute for the radio group
     */
    name?: string;
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Radio options (children)
     */
    children?: import('svelte').Snippet;
}
declare const RadioGroup: import("svelte").Component<Props, {}, "value">;
type RadioGroup = ReturnType<typeof RadioGroup>;
export default RadioGroup;
//# sourceMappingURL=RadioGroup.svelte.d.ts.map
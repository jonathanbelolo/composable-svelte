/**
 * Radio component - Single choice from a set of options.
 * Must be used within a RadioGroup.
 *
 * @example
 * ```svelte
 * <RadioGroup bind:value={selectedOption}>
 *   <Radio value="option1">Option 1</Radio>
 *   <Radio value="option2">Option 2</Radio>
 * </RadioGroup>
 * ```
 */
interface Props {
    /**
     * The value of this radio option
     */
    value: string;
    /**
     * Whether the radio is disabled
     */
    disabled?: boolean;
    /**
     * Optional class name
     */
    class?: string;
    /**
     * Label content
     */
    children?: import('svelte').Snippet;
    /**
     * All other input attributes
     */
    [key: string]: any;
}
declare const Radio: import("svelte").Component<Props, {}, "">;
type Radio = ReturnType<typeof Radio>;
export default Radio;
//# sourceMappingURL=Radio.svelte.d.ts.map
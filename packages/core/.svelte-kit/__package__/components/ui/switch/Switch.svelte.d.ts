/**
 * Switch component - Toggle between on/off states with smooth animation.
 *
 * @example
 * ```svelte
 * <Switch bind:checked={isEnabled} />
 * ```
 *
 * @example With label
 * ```svelte
 * <label class="flex items-center gap-2">
 *   <Switch bind:checked={notifications} />
 *   <span>Enable notifications</span>
 * </label>
 * ```
 */
interface Props {
    /**
     * Whether the switch is checked/on
     */
    checked?: boolean;
    /**
     * Whether the switch is disabled
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
declare const Switch: import("svelte").Component<Props, {}, "checked">;
type Switch = ReturnType<typeof Switch>;
export default Switch;
//# sourceMappingURL=Switch.svelte.d.ts.map
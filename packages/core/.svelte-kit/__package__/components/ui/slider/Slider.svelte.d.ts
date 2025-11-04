import type { HTMLInputAttributes } from 'svelte/elements';
/**
 * Slider component - Range input for selecting numeric values.
 *
 * @example
 * ```svelte
 * <Slider bind:value={volume} min={0} max={100} />
 * ```
 *
 * @example With step
 * ```svelte
 * <Slider bind:value={rating} min={0} max={5} step={0.5} />
 * ```
 */
interface SliderProps extends Omit<HTMLInputAttributes, 'type' | 'class'> {
    /**
     * Current value (supports two-way binding).
     */
    value?: number;
    /**
     * Minimum value.
     */
    min?: number;
    /**
     * Maximum value.
     */
    max?: number;
    /**
     * Step increment.
     */
    step?: number;
    /**
     * Whether the slider is disabled.
     */
    disabled?: boolean;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Slider: import("svelte").Component<SliderProps, {}, "value">;
type Slider = ReturnType<typeof Slider>;
export default Slider;
//# sourceMappingURL=Slider.svelte.d.ts.map
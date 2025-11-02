<script lang="ts">
	import { cn } from '../../../lib/utils.js';
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

	let {
		value = $bindable(50),
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		class: className,
		oninput,
		...restProps
	}: SliderProps = $props();

	// Calculate percentage for visual feedback
	const percentage = $derived(((value - min) / (max - min)) * 100);

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		value = Number(e.currentTarget.value);
		oninput?.(e);
	}
</script>

<div class={cn('relative flex w-full touch-none select-none items-center', className)}>
	<input
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		bind:value
		oninput={handleInput}
		class={cn(
			'relative h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary transition-opacity',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
			'disabled:cursor-not-allowed disabled:opacity-50',
			// Webkit (Chrome, Safari, Edge) thumb styling
			'[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
			'[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary',
			'[&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-lg',
			'[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110',
			'disabled:[&::-webkit-slider-thumb]:hover:scale-100',
			// Firefox thumb styling
			'[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none',
			'[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary',
			'[&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-lg',
			'[&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110',
			'disabled:[&::-moz-range-thumb]:hover:scale-100'
		)}
		{...restProps}
	/>
	<!-- Progress fill indicator -->
	<div
		class="pointer-events-none absolute left-0 h-2 rounded-full bg-primary transition-all"
		style="width: {percentage}%"
		aria-hidden="true"
	></div>
</div>

<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Progress component for displaying linear progress bars.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Basic progress bar -->
	 * <Progress value={60} />
	 *
	 * <!-- With custom max value -->
	 * <Progress value={75} max={100} />
	 *
	 * <!-- Indeterminate progress (no value) -->
	 * <Progress />
	 *
	 * <!-- Custom styling -->
	 * <Progress
	 *   value={progress}
	 *   class="h-2"
	 *   indicatorClass="bg-green-500"
	 * />
	 * ```
	 */

	interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Current progress value (0 to max).
		 * If undefined, shows indeterminate state.
		 */
		value?: number;

		/**
		 * Maximum value for progress (default: 100).
		 */
		max?: number;

		/**
		 * Additional CSS classes for the container.
		 */
		class?: string;

		/**
		 * Additional CSS classes for the indicator (filled portion).
		 */
		indicatorClass?: string;
	}

	let {
		value,
		max = 100,
		class: className,
		indicatorClass,
		...restProps
	}: ProgressProps = $props();

	// Clamp value between 0 and max
	const percentage = $derived(
		value !== undefined ? Math.min(Math.max((value / max) * 100, 0), 100) : 0
	);

	const containerClasses = $derived(
		cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)
	);

	const indicatorClasses = $derived(
		cn(
			'h-full bg-primary transition-all duration-300 ease-in-out',
			value === undefined && 'animate-pulse',
			indicatorClass
		)
	);
</script>

<div
	class={containerClasses}
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={max}
	aria-valuenow={value}
	{...restProps}
>
	<div class={indicatorClasses} style="width: {percentage}%"></div>
</div>

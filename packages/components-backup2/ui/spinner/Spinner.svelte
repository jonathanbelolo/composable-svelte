<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Spinner loading indicator.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <Spinner size="sm" />
	 * <Spinner size="md" />
	 * <Spinner size="lg" />
	 * ```
	 */

	interface SpinnerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Size of the spinner.
		 */
		size?: 'sm' | 'md' | 'lg';

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let { size = 'md', class: className, ...restProps }: SpinnerProps = $props();

	const sizeClasses = {
		sm: 'h-4 w-4',
		md: 'h-6 w-6',
		lg: 'h-8 w-8'
	};

	const spinnerClasses = $derived(cn('animate-spin', sizeClasses[size], className));
</script>

<svg
	class={spinnerClasses}
	xmlns="http://www.w3.org/2000/svg"
	fill="none"
	viewBox="0 0 24 24"
	role="status"
	aria-label="Loading"
	{...restProps}
>
	<circle
		class="opacity-25"
		cx="12"
		cy="12"
		r="10"
		stroke="currentColor"
		stroke-width="4"
	></circle>
	<path
		class="opacity-75"
		fill="currentColor"
		d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
	></path>
</svg>

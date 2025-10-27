<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Separator component for visual division.
	 *
	 * @packageDocumentation
	 */

	interface SeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Orientation of the separator.
		 * @default 'horizontal'
		 */
		orientation?: 'horizontal' | 'vertical';
		/**
		 * Whether the separator is decorative (hidden from screen readers).
		 * @default true
		 */
		decorative?: boolean;
		/**
		 * Additional CSS classes to apply.
		 */
		class?: string;
	}

	let {
		orientation = 'horizontal',
		decorative = true,
		class: className,
		...restProps
	}: SeparatorProps = $props();

	const baseClasses = 'shrink-0 bg-border';

	const orientationClasses = $derived(
		orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]'
	);

	const separatorClasses = $derived(cn(baseClasses, orientationClasses, className));
</script>

<div
	role={decorative ? 'none' : 'separator'}
	aria-orientation={decorative ? undefined : orientation}
	class={separatorClasses}
	{...restProps}
/>

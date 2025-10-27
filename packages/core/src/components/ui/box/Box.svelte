<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Box component - Primitive layout container with spacing utilities.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Basic box with padding -->
	 * <Box p="md">
	 *   <p>Content with medium padding</p>
	 * </Box>
	 *
	 * <!-- Box with margin and padding -->
	 * <Box p="lg" m="sm">
	 *   <p>Content with large padding and small margin</p>
	 * </Box>
	 *
	 * <!-- Custom element type -->
	 * <Box as="section" p="xl">
	 *   <h2>Section content</h2>
	 * </Box>
	 * ```
	 */

	interface BoxProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
		/**
		 * HTML element to render as (default: 'div').
		 */
		as?: keyof HTMLElementTagNameMap;

		/**
		 * Padding size.
		 * - none: No padding
		 * - xs: 0.25rem (4px)
		 * - sm: 0.5rem (8px)
		 * - md: 1rem (16px)
		 * - lg: 1.5rem (24px)
		 * - xl: 2rem (32px)
		 */
		p?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

		/**
		 * Margin size (same scale as padding).
		 */
		m?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Box content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		as = 'div',
		p = 'none',
		m = 'none',
		class: className,
		children,
		...restProps
	}: BoxProps = $props();

	const paddingClasses = {
		none: 'p-0',
		xs: 'p-1',
		sm: 'p-2',
		md: 'p-4',
		lg: 'p-6',
		xl: 'p-8'
	};

	const marginClasses = {
		none: 'm-0',
		xs: 'm-1',
		sm: 'm-2',
		md: 'm-4',
		lg: 'm-6',
		xl: 'm-8'
	};

	const boxClasses = $derived(cn(paddingClasses[p], marginClasses[m], className));
</script>

<svelte:element this={as} class={boxClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</svelte:element>

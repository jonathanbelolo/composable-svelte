<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Heading component - Semantic headings (H1-H6) with consistent styling.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Page title (H1) -->
	 * <Heading level={1}>Page Title</Heading>
	 *
	 * <!-- Section heading (H2) -->
	 * <Heading level={2}>Section Title</Heading>
	 *
	 * <!-- With custom styling -->
	 * <Heading level={3} class="text-primary">
	 *   Custom Heading
	 * </Heading>
	 * ```
	 */

	interface HeadingProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
		/**
		 * Heading level (1-6).
		 */
		level: 1 | 2 | 3 | 4 | 5 | 6;

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Heading content.
		 */
		children?: import('svelte').Snippet;
	}

	let { level, class: className, children, ...restProps }: HeadingProps = $props();

	const levelClasses = {
		1: 'text-4xl font-extrabold tracking-tight lg:text-5xl',
		2: 'text-3xl font-semibold tracking-tight',
		3: 'text-2xl font-semibold tracking-tight',
		4: 'text-xl font-semibold tracking-tight',
		5: 'text-lg font-semibold',
		6: 'text-base font-semibold'
	};

	const headingClasses = $derived(cn('text-foreground', levelClasses[level], className));

	const tag = $derived(`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6');
</script>

<svelte:element this={tag} class={headingClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</svelte:element>

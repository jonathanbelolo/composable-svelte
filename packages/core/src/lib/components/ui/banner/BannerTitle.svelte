<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface BannerTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class' | 'children'> {
		class?: string | undefined;
	/**
	 * Which heading element to render.
	 *
	 * The level belongs to the page, not to the component: put this under an
	 * `<h2>` and a fixed `<h5>` jumps the outline, which no consumer can fix
	 * from the outside. Defaults to the level it has always rendered, so nothing
	 * changes for anyone who does not pass it.
	 *
	 * `@composable-svelte/auth`'s `LoginForm` is the pattern.
	 */
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
		children?: import('svelte').Snippet | undefined;
	}

	let { class: className, headingLevel = 5, children, ...restProps }: BannerTitleProps = $props();

	const titleClasses = $derived(cn('mb-1 font-medium leading-none tracking-tight', className));
</script>

<svelte:element this={`h${headingLevel}`} class={titleClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</svelte:element>

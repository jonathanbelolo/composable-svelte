<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card title component.
	 *
	 * @packageDocumentation
	 */

	interface CardTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
		class?: string | undefined;
	/**
	 * Which heading element to render.
	 *
	 * The level belongs to the page, not to the component: put this under an
	 * `<h2>` and a fixed `<h3>` jumps the outline, which no consumer can fix
	 * from the outside. Defaults to the level it has always rendered, so nothing
	 * changes for anyone who does not pass it.
	 *
	 * `@composable-svelte/auth`'s `LoginForm` is the pattern.
	 */
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
		children: Snippet;
	}

	let { class: className, headingLevel = 3, children, ...restProps }: CardTitleProps = $props();
</script>

<svelte:element this={`h${headingLevel}`} class={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children()}
</svelte:element>

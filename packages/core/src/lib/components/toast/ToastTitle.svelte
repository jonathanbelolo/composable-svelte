<script lang="ts">
	import { cn } from '../../utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Toast title component.
	 *
	 * @packageDocumentation
	 */

	interface ToastTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
	/**
	 * Which heading element to render.
	 *
	 * The level belongs to the page, not to the component: put this under an
	 * `<h2>` and a fixed `<h3>` jumps the outline, which no consumer can fix from
	 * the outside. Defaults to the level it has always rendered, so nothing
	 * changes for anyone who does not pass it.
	 */
	headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
		class?: string | undefined;
		children: Snippet;
	}

	let { class: className, children, headingLevel = 3,
		...restProps }: ToastTitleProps = $props();
</script>

<svelte:element this={`h${headingLevel}`} class={cn('text-sm font-semibold', className)} {...restProps}>
	{@render children()}
</svelte:element>

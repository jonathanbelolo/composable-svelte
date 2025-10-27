<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card title component.
	 *
	 * @packageDocumentation
	 */

	interface CardTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardTitleProps = $props();
</script>

<h3 class={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children()}
</h3>

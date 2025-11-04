<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card footer component.
	 *
	 * @packageDocumentation
	 */

	interface CardFooterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardFooterProps = $props();
</script>

<div class={cn('flex items-center p-6 pt-0', className)} {...restProps}>
	{@render children()}
</div>

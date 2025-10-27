<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card header component.
	 *
	 * @packageDocumentation
	 */

	interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardHeaderProps = $props();
</script>

<div class={cn('flex flex-col space-y-1.5 p-6', className)} {...restProps}>
	{@render children()}
</div>

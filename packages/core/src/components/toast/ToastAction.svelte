<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Toast action button component.
	 *
	 * @packageDocumentation
	 */

	interface ToastActionProps extends Omit<HTMLButtonAttributes, 'class'> {
		class?: string;
		children: Snippet;
		onclick?: (e: MouseEvent) => void;
	}

	let { class: className, children, onclick, ...restProps }: ToastActionProps = $props();

	function handleClick(e: MouseEvent) {
		onclick?.(e);
	}
</script>

<button
	type="button"
	class={cn(
		'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	onclick={handleClick}
	{...restProps}
>
	{@render children()}
</button>

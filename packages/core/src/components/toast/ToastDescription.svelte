<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Toast description component.
	 *
	 * @packageDocumentation
	 */

	interface ToastDescriptionProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: ToastDescriptionProps = $props();
</script>

<p class={cn('text-sm opacity-90', className)} {...restProps}>
	{@render children()}
</p>

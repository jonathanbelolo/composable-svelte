<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card description component.
	 *
	 * @packageDocumentation
	 */

	interface CardDescriptionProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardDescriptionProps = $props();
</script>

<p class={cn('text-sm text-muted-foreground', className)} {...restProps}>
	{@render children()}
</p>

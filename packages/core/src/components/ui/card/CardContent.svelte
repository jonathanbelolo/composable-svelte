<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Card content component.
	 *
	 * @packageDocumentation
	 */

	interface CardContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: CardContentProps = $props();
</script>

<div class={cn('p-6 pt-0', className)} {...restProps}>
	{@render children()}
</div>

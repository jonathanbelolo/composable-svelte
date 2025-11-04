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
		class?: string;
		children: Snippet;
	}

	let { class: className, children, ...restProps }: ToastTitleProps = $props();
</script>

<h3 class={cn('text-sm font-semibold', className)} {...restProps}>
	{@render children()}
</h3>

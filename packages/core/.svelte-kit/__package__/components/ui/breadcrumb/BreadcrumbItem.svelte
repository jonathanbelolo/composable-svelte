<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLiAttributes } from 'svelte/elements';
	import { cn } from '../../../utils.js';

	interface BreadcrumbItemProps extends HTMLLiAttributes {
		children: Snippet;
		class?: string;
	}

	let { children, class: className, ...restProps }: BreadcrumbItemProps = $props();
</script>

<li class={cn('inline-flex items-center gap-1.5', className)} {...restProps}>
	{@render children()}
</li>

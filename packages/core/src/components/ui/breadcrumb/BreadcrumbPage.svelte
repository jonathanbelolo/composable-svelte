<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../../../lib/utils.js';

	interface BreadcrumbPageProps extends HTMLAttributes<HTMLSpanElement> {
		children: Snippet;
		class?: string;
	}

	let { children, class: className, ...restProps }: BreadcrumbPageProps = $props();
</script>

<span
	role="link"
	aria-disabled="true"
	aria-current="page"
	class={cn('font-normal text-foreground', className)}
	{...restProps}
>
	{@render children()}
</span>

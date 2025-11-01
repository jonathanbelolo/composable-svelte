<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLOlAttributes } from 'svelte/elements';
	import { cn } from '../../../lib/utils.js';

	interface BreadcrumbListProps extends HTMLOlAttributes {
		children: Snippet;
		class?: string;
	}

	let { children, class: className, ...restProps }: BreadcrumbListProps = $props();
</script>

<ol
	class={cn(
		'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
		className
	)}
	{...restProps}
>
	{@render children()}
</ol>

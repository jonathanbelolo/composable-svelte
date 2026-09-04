<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '../../../utils.js';

	interface BreadcrumbLinkProps extends HTMLAnchorAttributes {
		children: Snippet;
		class?: string | undefined;
		href?: string | undefined;
	}

	let { children, class: className, href = '#', ...restProps }: BreadcrumbLinkProps = $props();
</script>

<a {href} class={cn('hover:text-foreground', className)} {...restProps}>
	{@render children()}
</a>

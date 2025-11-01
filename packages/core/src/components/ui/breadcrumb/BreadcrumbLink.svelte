<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '../../../lib/utils.js';

	interface BreadcrumbLinkProps extends HTMLAnchorAttributes {
		children: Snippet;
		class?: string;
		href?: string;
	}

	let { children, class: className, href = '#', ...restProps }: BreadcrumbLinkProps = $props();
</script>

<a {href} class={cn('transition-colors hover:text-foreground', className)} {...restProps}>
	{@render children()}
</a>

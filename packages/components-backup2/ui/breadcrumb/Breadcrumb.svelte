<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
		children: Snippet;
	}

	let { children, ...restProps }: BreadcrumbProps = $props();
</script>

<nav aria-label="breadcrumb" {...restProps}>
	{@render children()}
</nav>

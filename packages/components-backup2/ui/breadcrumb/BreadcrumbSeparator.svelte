<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLiAttributes } from 'svelte/elements';

	interface BreadcrumbSeparatorProps extends HTMLLiAttributes {
		children?: Snippet;
	}

	let { children, ...restProps }: BreadcrumbSeparatorProps = $props();
</script>

<li role="presentation" aria-hidden="true" {...restProps}>
	{#if children}
		{@render children()}
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="15"
			height="15"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="m9 18 6-6-6-6" />
		</svg>
	{/if}
</li>

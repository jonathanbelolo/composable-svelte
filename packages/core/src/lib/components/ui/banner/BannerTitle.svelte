<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface BannerTitleProps extends Omit<HTMLAttributes<HTMLHeadingElement>, 'class'> {
		class?: string;
		children?: import('svelte').Snippet;
	}

	let { class: className, children, ...restProps }: BannerTitleProps = $props();

	const titleClasses = $derived(cn('mb-1 font-medium leading-none tracking-tight', className));
</script>

<h5 class={titleClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</h5>

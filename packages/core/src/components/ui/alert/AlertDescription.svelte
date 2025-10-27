<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	interface AlertDescriptionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		class?: string;
		children?: import('svelte').Snippet;
	}

	let { class: className, children, ...restProps }: AlertDescriptionProps = $props();

	const descClasses = $derived(cn('text-sm [&_p]:leading-relaxed', className));
</script>

<div class={descClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>

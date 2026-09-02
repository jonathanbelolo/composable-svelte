<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '../../utils.js';

	interface Props {
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let { class: className, children }: Props = $props();
</script>

<div class={cn('flex flex-col gap-2 text-center sm:text-left', className)}>
	{@render children?.()}
</div>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '../../utils.js';

	interface Props {
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let { class: className, children }: Props = $props();
</script>

<!--
	`flex-col-reverse` on small screens so the confirming action sits at the
	bottom, nearest the thumb, while still coming last in DOM order — which is
	the order the tab key and a screen reader follow.
-->
<div class={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>
	{@render children?.()}
</div>

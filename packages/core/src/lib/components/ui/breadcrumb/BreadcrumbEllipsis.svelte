<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '../../../utils.js';

	interface BreadcrumbEllipsisProps extends HTMLAttributes<HTMLSpanElement> {
		class?: string;
	}

	let { class: className, ...restProps }: BreadcrumbEllipsisProps = $props();
</script>

<span
	role="presentation"
	aria-hidden="true"
	aria-label="More"
	class={cn('flex h-9 w-9 items-center justify-center', className)}
	{...restProps}
>
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
		class="h-4 w-4"
	>
		<circle cx="12" cy="12" r="1" />
		<circle cx="19" cy="12" r="1" />
		<circle cx="5" cy="12" r="1" />
	</svg>
	<span class="sr-only">More</span>
</span>

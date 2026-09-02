<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '../../utils.js';

	interface Props {
		/**
		 * What pressing this does.
		 *
		 * **Required, and deliberately not defaulted to dismissing the dialog.**
		 * Presentation here is state-driven: the parent reducer owns the
		 * `dismissing` → `dismissalCompleted` transition, and a component that
		 * dismissed on its own would skip it.
		 */
		onclick: () => void;
		disabled?: boolean | undefined;
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let { onclick, disabled = false, class: className, children }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	{disabled}
	class={cn(
		'inline-flex h-10 items-center justify-center rounded-md border border-input px-4 py-2',
		'bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'disabled:pointer-events-none disabled:opacity-50',
		className
	)}
>
	{@render children?.()}
</button>

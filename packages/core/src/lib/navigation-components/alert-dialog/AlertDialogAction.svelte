<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '../../utils.js';

	interface Props {
		/**
		 * What pressing this does.
		 *
		 * **Required.** A confirmation button with no handler is a dead end, and
		 * this component cannot supply a sensible default: dismissing the dialog
		 * would bypass the parent reducer that owns the dismissal transition.
		 */
		onclick: () => void;
		/**
		 * `destructive` for an action that cannot be undone.
		 *
		 * A colour change with no transition — this is a Pattern A component and
		 * does not animate its own interaction states.
		 */
		variant?: 'default' | 'destructive' | undefined;
		disabled?: boolean | undefined;
		class?: string | undefined;
		children?: Snippet | undefined;
	}

	let {
		onclick,
		variant = 'default',
		disabled = false,
		class: className,
		children
	}: Props = $props();

	const variantClasses = $derived(
		variant === 'destructive'
			? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
			: 'bg-primary text-primary-foreground hover:bg-primary/90'
	);
</script>

<button
	type="button"
	{onclick}
	{disabled}
	class={cn(
		'inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
		'disabled:pointer-events-none disabled:opacity-50',
		variantClasses,
		className
	)}
>
	{@render children?.()}
</button>

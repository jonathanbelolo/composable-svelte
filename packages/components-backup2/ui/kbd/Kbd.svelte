<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Kbd component - Display keyboard keys or shortcuts.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Single key -->
	 * <Kbd>Ctrl</Kbd>
	 *
	 * <!-- Key combination -->
	 * <div class="flex gap-1">
	 *   <Kbd>Ctrl</Kbd>
	 *   <span>+</span>
	 *   <Kbd>C</Kbd>
	 * </div>
	 *
	 * <!-- Small size -->
	 * <Kbd size="sm">Esc</Kbd>
	 * ```
	 */

	interface KbdProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
		/**
		 * Size variant.
		 */
		size?: 'sm' | 'base' | 'lg';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Key content.
		 */
		children?: import('svelte').Snippet;
	}

	let { size = 'base', class: className, children, ...restProps }: KbdProps = $props();

	const sizeClasses = {
		sm: 'text-xs px-1.5 py-0.5',
		base: 'text-sm px-2 py-1',
		lg: 'text-base px-2.5 py-1.5'
	};

	const kbdClasses = $derived(
		cn(
			'inline-flex items-center justify-center rounded border border-border bg-muted font-mono font-semibold text-foreground shadow-sm',
			sizeClasses[size],
			className
		)
	);
</script>

<kbd class={kbdClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</kbd>

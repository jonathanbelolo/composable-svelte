<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Panel component - Generic content container with border and padding.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Basic panel -->
	 * <Panel>
	 *   <p>Panel content</p>
	 * </Panel>
	 *
	 * <!-- With variant -->
	 * <Panel variant="bordered">
	 *   <p>Bordered panel</p>
	 * </Panel>
	 *
	 * <!-- Elevated panel -->
	 * <Panel variant="elevated">
	 *   <p>Panel with shadow</p>
	 * </Panel>
	 * ```
	 */

	interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Visual variant of the panel.
		 * - default: Standard background with subtle border
		 * - bordered: Prominent border
		 * - elevated: Shadow elevation
		 * - flat: No border or shadow
		 */
		variant?: 'default' | 'bordered' | 'elevated' | 'flat';

		/**
		 * Additional CSS classes for the panel.
		 */
		class?: string;

		/**
		 * Panel content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		variant = 'default',
		class: className,
		children,
		...restProps
	}: PanelProps = $props();

	const variantClasses = {
		default: 'border border-border bg-card',
		bordered: 'border-2 border-border bg-card',
		elevated: 'border border-border bg-card shadow-md',
		flat: 'bg-card'
	};

	const panelClasses = $derived(
		cn('rounded-lg p-4', variantClasses[variant], className)
	);
</script>

<div class={panelClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>

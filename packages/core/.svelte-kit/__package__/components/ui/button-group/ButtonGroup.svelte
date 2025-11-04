<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * ButtonGroup component - Group multiple buttons together with connected styling.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <ButtonGroup>
	 *   <Button variant="outline">Left</Button>
	 *   <Button variant="outline">Middle</Button>
	 *   <Button variant="outline">Right</Button>
	 * </ButtonGroup>
	 *
	 * <!-- Vertical orientation -->
	 * <ButtonGroup orientation="vertical">
	 *   <Button variant="outline">Top</Button>
	 *   <Button variant="outline">Middle</Button>
	 *   <Button variant="outline">Bottom</Button>
	 * </ButtonGroup>
	 * ```
	 */

	interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Layout orientation.
		 */
		orientation?: 'horizontal' | 'vertical';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Button elements.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		orientation = 'horizontal',
		class: className,
		children,
		...restProps
	}: ButtonGroupProps = $props();

	const orientationClasses = {
		horizontal: 'flex-row [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button:not(:last-child)]:border-r-0',
		vertical: 'flex-col [&>button]:rounded-none [&>button:first-child]:rounded-t-md [&>button:last-child]:rounded-b-md [&>button:not(:last-child)]:border-b-0'
	};

	const groupClasses = $derived(
		cn('inline-flex', orientationClasses[orientation], className)
	);
</script>

<div class={groupClasses} role="group" {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>

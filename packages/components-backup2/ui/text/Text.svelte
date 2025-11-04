<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Text component - Paragraph text with size and color variants.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Default paragraph -->
	 * <Text>This is body text.</Text>
	 *
	 * <!-- Large text -->
	 * <Text size="lg">Larger paragraph text.</Text>
	 *
	 * <!-- Muted text -->
	 * <Text variant="muted">Less prominent text.</Text>
	 *
	 * <!-- Inline span -->
	 * <Text as="span" variant="accent">Highlighted text</Text>
	 * ```
	 */

	interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
		/**
		 * HTML element to render as (default: 'p').
		 */
		as?: 'p' | 'span' | 'div';

		/**
		 * Text size variant.
		 */
		size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl';

		/**
		 * Text color/style variant.
		 */
		variant?: 'default' | 'muted' | 'accent' | 'destructive';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Text content.
		 */
		children?: import('svelte').Snippet;
	}

	let {
		as = 'p',
		size = 'base',
		variant = 'default',
		class: className,
		children,
		...restProps
	}: TextProps = $props();

	const sizeClasses = {
		xs: 'text-xs',
		sm: 'text-sm',
		base: 'text-base',
		lg: 'text-lg',
		xl: 'text-xl'
	};

	const variantClasses = {
		default: 'text-foreground',
		muted: 'text-muted-foreground',
		accent: 'text-accent-foreground',
		destructive: 'text-destructive'
	};

	const textClasses = $derived(
		cn('leading-7', sizeClasses[size], variantClasses[variant], className)
	);
</script>

<svelte:element this={as} class={textClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</svelte:element>

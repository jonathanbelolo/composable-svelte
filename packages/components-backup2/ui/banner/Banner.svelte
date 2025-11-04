<script lang="ts">
	import { cn } from '../../../lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Banner component - Static informational message banner with variants.
	 *
	 * Note: This is different from the navigation Alert component which is used
	 * for modal alert dialogs. Use Banner for persistent informational messages.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Info banner -->
	 * <Banner>
	 *   <BannerTitle>Info</BannerTitle>
	 *   <BannerDescription>This is an informational message.</BannerDescription>
	 * </Banner>
	 *
	 * <!-- Success banner -->
	 * <Banner variant="success">
	 *   <BannerTitle>Success!</BannerTitle>
	 *   <BannerDescription>Your changes have been saved.</BannerDescription>
	 * </Banner>
	 *
	 * <!-- Error banner -->
	 * <Banner variant="destructive">
	 *   <BannerTitle>Error</BannerTitle>
	 *   <BannerDescription>Something went wrong.</BannerDescription>
	 * </Banner>
	 * ```
	 */

	interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Banner style variant.
		 */
		variant?: 'default' | 'success' | 'warning' | 'destructive';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Banner content.
		 */
		children?: import('svelte').Snippet;
	}

	let { variant = 'default', class: className, children, ...restProps }: BannerProps = $props();

	const variantClasses = {
		default: 'border-border bg-background text-foreground',
		success: 'border-green-500/50 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
		warning:
			'border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
		destructive:
			'border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/20'
	};

	const bannerClasses = $derived(
		cn('relative w-full rounded-lg border p-4', variantClasses[variant], className)
	);
</script>

<div role="alert" class={bannerClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>

<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * Alert component - Static informational message with variants.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- Info alert -->
	 * <Alert>
	 *   <AlertTitle>Info</AlertTitle>
	 *   <AlertDescription>This is an informational message.</AlertDescription>
	 * </Alert>
	 *
	 * <!-- Success alert -->
	 * <Alert variant="success">
	 *   <AlertTitle>Success!</AlertTitle>
	 *   <AlertDescription>Your changes have been saved.</AlertDescription>
	 * </Alert>
	 *
	 * <!-- Error alert -->
	 * <Alert variant="destructive">
	 *   <AlertTitle>Error</AlertTitle>
	 *   <AlertDescription>Something went wrong.</AlertDescription>
	 * </Alert>
	 * ```
	 */

	interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
		/**
		 * Alert style variant.
		 */
		variant?: 'default' | 'success' | 'warning' | 'destructive';

		/**
		 * Additional CSS classes.
		 */
		class?: string;

		/**
		 * Alert content.
		 */
		children?: import('svelte').Snippet;
	}

	let { variant = 'default', class: className, children, ...restProps }: AlertProps = $props();

	const variantClasses = {
		default: 'border-border bg-background text-foreground',
		success: 'border-green-500/50 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
		warning:
			'border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
		destructive:
			'border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/20'
	};

	const alertClasses = $derived(
		cn('relative w-full rounded-lg border p-4', variantClasses[variant], className)
	);
</script>

<div role="alert" class={alertClasses} {...restProps}>
	{#if children}
		{@render children()}
	{/if}
</div>

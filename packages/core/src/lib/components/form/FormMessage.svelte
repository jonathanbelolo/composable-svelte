<script lang="ts">
	import { getContext } from 'svelte';
	import { cn } from '../../utils.js';
	import type { FieldState } from './form.types.js';
	import Spinner from '../ui/spinner/Spinner.svelte';

	/**
	 * FormMessage component - Displays validation errors and loading state.
	 * Automatically shows field error from context.
	 *
	 * @example
	 * ```svelte
	 * <FormMessage />
	 * ```
	 *
	 * @example With custom error message
	 * ```svelte
	 * <FormMessage>Custom error message</FormMessage>
	 * ```
	 */

	interface Props {
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * Optional custom message (overrides field error)
		 */
		children?: import('svelte').Snippet;
	}

	let { class: className, children }: Props = $props();

	// Get field info from context
	const fieldName = getContext<string>('fieldName');
	const fieldState = getContext<FieldState>('fieldState');

	const errorId = $derived(fieldName ? `${fieldName}-error` : undefined);
	const hasError = $derived(!!fieldState?.error);
	const isValidating = $derived(!!fieldState?.validating);
</script>

{#if children || hasError || isValidating}
	<p
		id={errorId}
		class={cn(
			'text-sm font-medium',
			hasError && 'text-destructive',
			isValidating && 'text-muted-foreground',
			className
		)}
		role={hasError ? 'alert' : undefined}
		aria-live={hasError ? 'polite' : undefined}
	>
		{#if isValidating}
			<span class="flex items-center gap-2">
				<Spinner size="sm" />
				Validating...
			</span>
		{:else if children}
			{@render children()}
		{:else if hasError}
			{fieldState.error}
		{/if}
	</p>
{/if}

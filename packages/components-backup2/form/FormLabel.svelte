<script lang="ts">
	import { getContext } from 'svelte';
	import Label from '../ui/label/Label.svelte';
	import type { FieldState } from './form.types.js';

	/**
	 * FormLabel component - Label for form fields with error styling.
	 * Automatically connects to the field via context.
	 *
	 * @example
	 * ```svelte
	 * <FormLabel>Email Address</FormLabel>
	 * ```
	 */

	interface Props {
		/**
		 * Optional class name
		 */
		class?: string;
		/**
		 * Label text
		 */
		children?: import('svelte').Snippet;
	}

	let { class: className, children }: Props = $props();

	// Get field info from context
	const fieldName = getContext<string>('fieldName');
	const fieldState = getContext<FieldState>('fieldState');

	const hasError = $derived(!!fieldState?.error);
</script>

<Label for={fieldName} error={hasError} class={className}>
	{#if children}
		{@render children()}
	{/if}
</Label>

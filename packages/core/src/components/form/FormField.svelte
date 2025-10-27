<script lang="ts" generics="T extends Record<string, any>">
	import { getContext, setContext } from 'svelte';
	import type { Store } from '../../types.js';
	import type { FormState, FormAction, FieldState } from './form.types.js';

	/**
	 * FormField component - Connects a form field to the form store.
	 * Provides field-specific state and actions to child components.
	 *
	 * @example
	 * ```svelte
	 * <FormField name="email">
	 *   <FormLabel>Email</FormLabel>
	 *   <FormControl>
	 *     <Input type="email" />
	 *   </FormControl>
	 *   <FormMessage />
	 * </FormField>
	 * ```
	 */

	interface Props {
		/**
		 * The name of the field in the form data
		 */
		name: keyof T & string;
		/**
		 * Optional class name for the field wrapper
		 */
		class?: string;
		/**
		 * Children components (label, control, message, etc.)
		 */
		children?: import('svelte').Snippet<[FieldState]>;
	}

	let { name, class: className, children }: Props = $props();

	// Get form store from context
	const store = getContext<Store<FormState<T>, FormAction<T>>>('formStore');

	if (!store) {
		throw new Error('FormField must be used within a Form component');
	}

	// Derive field state from store
	const fieldState = $derived<FieldState>({
		value: store.state.data[name],
		error: store.state.fields[name]?.error ?? null,
		touched: store.state.fields[name]?.touched ?? false,
		dirty: store.state.fields[name]?.dirty ?? false,
		validating: store.state.fields[name]?.validating ?? false
	});

	// Provide field name and state to child components
	setContext('fieldName', name);
	setContext('fieldState', fieldState);
</script>

<div class={className} data-field={name}>
	{#if children}
		{@render children(fieldState)}
	{/if}
</div>

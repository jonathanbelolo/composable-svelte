<script lang="ts" generics="T extends Record<string, any>">
	import { getContext, setContext } from 'svelte';
	import type { FormAction, FieldState, FormFieldProps, FormStore } from './form.types.js';

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



	let { name, class: className, children }: FormFieldProps<T> = $props();

	// Get form store from context
	const store = getContext<FormStore<T>>('formStore');

	if (!store) {
		throw new Error('FormField must be used within a Form component');
	}

	// Derive field state from store
	const fieldState = $derived<FieldState>({
		value: $store.data[name],
		error: $store.fields[name]?.error ?? null,
		touched: $store.fields[name]?.touched ?? false,
		dirty: $store.fields[name]?.dirty ?? false,
		isValidating: $store.fields[name]?.isValidating ?? false,
		warnings: $store.fields[name]?.warnings ?? []
	});

	// Provide send function for dispatching actions
	const send = (action: FormAction<T>) => {
		store.dispatch(action);
	};

	// Provide field name and state to child components.
	// fieldState is wrapped in a holder with a getter so consumers reading
	// `ctx.current` re-evaluate the $derived on every access instead of
	// capturing a one-time snapshot (Svelte 5 context gotcha).
	setContext('fieldName', name);
	setContext('fieldState', {
		get current() {
			return fieldState;
		}
	});
</script>

<div class={className} data-field={name}>
	{#if children}
		{@render children({ field: fieldState, send })}
	{/if}
</div>

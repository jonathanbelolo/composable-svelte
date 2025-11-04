<script lang="ts" generics="T extends Record<string, any>">
	import { getContext } from 'svelte';
	import type { Store } from '../../types.js';
	import type { FormState, FormAction, FieldState } from './form.types.js';

	/**
	 * FormControl component - Wraps form input elements and handles events.
	 * Automatically dispatches field actions on change, blur, and focus.
	 *
	 * @example
	 * ```svelte
	 * <FormControl>
	 *   <Input type="email" />
	 * </FormControl>
	 * ```
	 *
	 * @example With custom input
	 * ```svelte
	 * <FormControl let:props>
	 *   <input {...props} type="email" />
	 * </FormControl>
	 * ```
	 */

	interface Props {
		/**
		 * Optional class name for the control wrapper
		 */
		class?: string;
		/**
		 * Children - input elements
		 */
		children?: import('svelte').Snippet<
			[{ props: Record<string, any>; field: FieldState }]
		>;
	}

	let { class: className, children }: Props = $props();

	// Get store and field info from context
	const store = getContext<Store<FormState<T>, FormAction<T>>>('formStore');
	const fieldName = getContext<keyof T & string>('fieldName');
	const fieldState = getContext<FieldState>('fieldState');

	if (!store || !fieldName) {
		throw new Error('FormControl must be used within a FormField component');
	}

	// Event handlers that dispatch to store
	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
		const value =
			target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;

		store.dispatch({
			type: 'fieldChanged',
			field: fieldName,
			value: value as any
		});
	}

	function handleBlur() {
		store.dispatch({
			type: 'fieldBlurred',
			field: fieldName
		});
	}

	function handleFocus() {
		store.dispatch({
			type: 'fieldFocused',
			field: fieldName
		});
	}

	// Props to spread on child input elements
	const controlProps = {
		id: fieldName,
		name: fieldName,
		value: fieldState.value,
		'aria-invalid': fieldState.error ? 'true' : undefined,
		'aria-describedby': fieldState.error ? `${fieldName}-error` : undefined,
		'data-touched': fieldState.touched || undefined,
		'data-dirty': fieldState.dirty || undefined,
		'data-validating': fieldState.validating || undefined,
		onchange: handleChange,
		onblur: handleBlur,
		onfocus: handleFocus
	};
</script>

<div class={className}>
	{#if children}
		{@render children({ props: controlProps, field: fieldState })}
	{/if}
</div>

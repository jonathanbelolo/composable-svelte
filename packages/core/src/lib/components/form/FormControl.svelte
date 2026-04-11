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

	// Get store and field info from context. fieldState is a holder with a
	// getter so reads of .current re-evaluate the parent's $derived reactively.
	const store = getContext<Store<FormState<T>, FormAction<T>>>('formStore');
	const fieldName = getContext<keyof T & string>('fieldName');
	const fieldStateCtx = getContext<{ current: FieldState }>('fieldState');

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

	// Props to spread on child input elements. Must be $derived so that
	// value/error/touched/etc. recompute whenever the field state updates.
	const controlProps = $derived({
		id: fieldName,
		name: fieldName,
		value: fieldStateCtx.current.value,
		'aria-invalid': fieldStateCtx.current.error ? 'true' : undefined,
		'aria-describedby': fieldStateCtx.current.error ? `${fieldName}-error` : undefined,
		'data-touched': fieldStateCtx.current.touched || undefined,
		'data-dirty': fieldStateCtx.current.dirty || undefined,
		'data-validating': fieldStateCtx.current.isValidating || undefined,
		onchange: handleChange,
		onblur: handleBlur,
		onfocus: handleFocus
	});
</script>

<div class={className}>
	{#if children}
		{@render children({ props: controlProps, field: fieldStateCtx.current })}
	{/if}
</div>

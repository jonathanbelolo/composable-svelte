<script lang="ts" generics="T extends Record<string, any>">
	import { setContext } from 'svelte';
	import { createStore } from '../../store.svelte.js';
	import { createFormReducer } from './form.reducer.js';
	import type { FormConfig, FormState, FormAction } from './form.types.js';
	import { createInitialFormState } from './form.reducer.js';
	import type { Store } from '../../types.js';

	// Form component - Creates and manages form state using the reducer pattern.
	//
	// Supports two modes:
	// 1. Standalone mode: Pass `config` to create internal store
	// 2. Integrated mode: Pass `store` to use external store from parent reducer

	interface Props {
		/**
		 * Form configuration (standalone mode)
		 * Mutually exclusive with `store`
		 */
		config?: FormConfig<T>;
		/**
		 * External store from parent reducer (integrated mode)
		 * Mutually exclusive with `config`
		 */
		store?: Store<FormState<T>, FormAction<T>>;
		/**
		 * Optional class name for the form element
		 */
		class?: string;
		/**
		 * Optional children (form fields and controls)
		 */
		children?: import('svelte').Snippet;
	}

	let { config, store: externalStore, class: className, children }: Props = $props();

	// Validate props
	if (!config && !externalStore) {
		throw new Error('Form: Must provide either `config` (standalone) or `store` (integrated)');
	}
	if (config && externalStore) {
		throw new Error('Form: Cannot provide both `config` and `store` - use one or the other');
	}

	// Determine which store to use
	let store: Store<FormState<T>, FormAction<T>>;

	if (externalStore) {
		// Integrated mode - use external store
		store = externalStore;
	} else if (config) {
		// Standalone mode - create internal store
		const reducer = createFormReducer(config);
		const initialState = createInitialFormState(config);
		store = createStore({
			initialState,
			reducer,
			dependencies: {}
		});
	} else {
		throw new Error('Form: Unreachable - props validation failed');
	}

	// Provide store to child components via context
	setContext('formStore', store);

	// Handle form submission
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		store.dispatch({ type: 'submitTriggered' });
	}
</script>

<form
	onsubmit={handleSubmit}
	class={className}
	novalidate
>
	{#if children}
		{@render children()}
	{/if}
</form>

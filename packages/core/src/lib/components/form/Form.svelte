<script lang="ts" generics="T extends Record<string, any>">
	import { setContext, onDestroy } from 'svelte';
	import { createStore } from '../../store.svelte.js';
	import { createFormReducer } from './form.reducer.js';
	import type { FormConfig, FormAction, FormProps, FormStore, FormState } from './form.types.js';
	import { createInitialFormState } from './form.reducer.js';

	// Form component - Creates and manages form state using the reducer pattern.
	//
	// Supports two modes:
	// 1. Standalone mode: Pass `config` to create internal store
	// 2. Integrated mode: Pass `store` to use external store from parent reducer


	let { config, store: externalStore, class: className, children }: FormProps<T> = $props();

	// Validate props
	if (!config && !externalStore) {
		throw new Error('Form: Must provide either `config` (standalone) or `store` (integrated)');
	}
	if (config && externalStore) {
		throw new Error('Form: Cannot provide both `config` and `store` - use one or the other');
	}

	// Determine which store to use
	let store: FormStore<T>;
	let internalStore: ReturnType<typeof createStore<FormState<T>, FormAction<T>>> | undefined;

	if (externalStore) {
		// Integrated mode - use external store
		store = externalStore;
	} else if (config) {
		// Standalone mode - create internal store
		const reducer = createFormReducer(config);
		const initialState = createInitialFormState(config);
		internalStore = createStore({
			initialState,
			reducer,
			dependencies: {}
		});
		store = internalStore;
	} else {
		throw new Error('Form: Unreachable - props validation failed');
	}

	onDestroy(() => internalStore?.destroy());

	// Provide store to child components via context
	setContext('formStore', store);

	let formElement: HTMLFormElement | undefined = $state();

	// Handle form submission
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		const form = (event.currentTarget ?? formElement) as HTMLFormElement | null;
		if (form) {
			const inputs = Array.from(form.elements).filter((element): element is HTMLInputElement => element instanceof HTMLInputElement);
			for (const input of inputs) {
				if (!input.willValidate) continue;
				if (input.validity.badInput) {
					input.reportValidity();
					return;
				}
			}
		}

		store.dispatch({ type: 'submitTriggered' });
	}
</script>

<form
	bind:this={formElement}
	onsubmit={handleSubmit}
	class={className}
	novalidate
>
	{#if children}
		{@render children()}
	{/if}
</form>

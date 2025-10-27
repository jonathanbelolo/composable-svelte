<script lang="ts" generics="T extends Record<string, any>">
	import { setContext } from 'svelte';
	import { createStore } from '../../store.svelte.js';
	import { createFormReducer } from './form.reducer.js';
	import type { FormConfig } from './form.types.js';
	import { createInitialFormState } from './form.reducer.js';

	/**
	 * Form component - Creates and manages form state using the reducer pattern.
	 *
	 * @example
	 * ```svelte
	 * <Form config={formConfig}>
	 *   <FormField name="email">
	 *     <FormLabel>Email</FormLabel>
	 *     <FormControl>
	 *       <Input type="email" />
	 *     </FormControl>
	 *     <FormMessage />
	 *   </FormField>
	 *   <Button type="submit">Submit</Button>
	 * </Form>
	 * ```
	 */

	interface Props {
		/**
		 * Form configuration including schema, validation mode, and handlers
		 */
		config: FormConfig<T>;
		/**
		 * Optional class name for the form element
		 */
		class?: string;
		/**
		 * Optional children (form fields and controls)
		 */
		children?: import('svelte').Snippet;
	}

	let { config, class: className, children }: Props = $props();

	// Create store with form reducer
	const reducer = createFormReducer(config);
	const initialState = createInitialFormState(config);
	const store = createStore({
		initialState,
		reducer,
		dependencies: {}
	});

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

/**
 * Form System Exports
 *
 * @packageDocumentation
 */

// Types
export type {
	FormState,
	FormConfig,
	FormAction,
	FormDependencies,
	FieldState,
	ValidationMode
} from './form.types.js';

// Reducer
export { createFormReducer, createInitialFormState } from './form.reducer.js';

// Components
export { default as Form } from './Form.svelte';
export { default as FormField } from './FormField.svelte';
export { default as FormControl } from './FormControl.svelte';
export { default as FormItem } from './FormItem.svelte';
export { default as FormLabel } from './FormLabel.svelte';
export { default as FormMessage } from './FormMessage.svelte';
export { default as FormDescription } from './FormDescription.svelte';

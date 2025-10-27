import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer } from '@composable-svelte/core/components/form';
import type { AppState, AppAction } from './app.types.js';
import { contactFormConfig } from '../features/contact-form/contact-form.config.js';

// ============================================================================
// Dependencies
// ============================================================================

export interface AppDependencies {
	// No external dependencies for this example
}

// ============================================================================
// Core Reducer (parent-level logic)
// ============================================================================

/**
 * Core app reducer handles parent-level concerns.
 *
 * Key pattern: Parent can observe child form actions!
 * When form succeeds, parent updates submission history.
 */
const coreReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
	switch (action.type) {
		case 'contactForm': {
			// Observe form submission success
			if (action.action.type === 'submissionSucceeded') {
				const formData = state.contactForm.data;
				return [
					{
						...state,
						submissionHistory: [
							...state.submissionHistory,
							{
								timestamp: new Date(),
								name: formData.name,
								email: formData.email
							}
						],
						successMessage: `Thank you, ${formData.name}! Your message has been sent.`
					},
					// Auto-dismiss success message after 5 seconds
					Effect.afterDelay(5000, (d) => d({ type: 'successMessageDismissed' }))
				];
			}

			// Let child reducer handle all other form actions
			return [state, Effect.none()];
		}

		case 'successMessageDismissed': {
			return [
				{
					...state,
					successMessage: null
				},
				Effect.none()
			];
		}

		default:
			return [state, Effect.none()];
	}
};

// ============================================================================
// Integrated Reducer (core + form child)
// ============================================================================

/**
 * Complete app reducer with integrated form.
 *
 * Uses scope() to compose form reducer into parent state at 'contactForm' field.
 *
 * This demonstrates the composable architecture pattern:
 * - Form has its own reducer (createFormReducer)
 * - Parent integrates it using scope()
 * - Parent can observe child actions (submissionSucceeded)
 * - Child form is fully testable in isolation
 * - Parent can test form integration
 */
const formReducer = createFormReducer(contactFormConfig);

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
	// Run core reducer first
	const [s1, e1] = coreReducer(state, action, deps);

	// Then run scoped form reducer
	const scopedFormReducer = scope<AppState, AppAction, any, any, AppDependencies>(
		(s) => s.contactForm,                           // Extract child state
		(s, child) => ({ ...s, contactForm: child }),   // Update parent with child
		(a) => (a.type === 'contactForm' ? a.action : null),  // Extract child action
		(childAction) => ({ type: 'contactForm', action: childAction }),  // Wrap child action
		formReducer
	);

	const [s2, e2] = scopedFormReducer(s1, action, deps);
	return [s2, Effect.batch(e1, e2)];
};

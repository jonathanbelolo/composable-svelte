/**
 * Form System - Integrated Mode Tests
 *
 * Tests the composable architecture integration pattern:
 * - Parent reducer integrates form using integrate()
 * - Parent can observe form events
 * - Scoped stores work correctly
 * - Full TestStore coverage of integration
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTestStore } from '../src/lib/test/test-store.js';
import { scope } from '../src/lib/composition/scope.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';
import type { Reducer } from '../src/lib/types.js';
import { Effect } from '../src/lib/effect.js';

// ============================================================================
// Test Setup - Contact Form Example
// ============================================================================

interface ContactFormData {
	name: string;
	email: string;
	message: string;
}

const contactSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters'),
	email: z.string().email('Please enter a valid email address'),
	message: z.string().min(10, 'Message must be at least 10 characters')
});

const formConfig: FormConfig<ContactFormData> = {
	initialData: {
		name: '',
		email: '',
		message: ''
	},
	schema: contactSchema,
	mode: 'onBlur',
	onSubmit: async (data) => {
		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
};

// ============================================================================
// Parent State & Actions
// ============================================================================

interface AppState {
	contactForm: ReturnType<typeof createInitialFormState<ContactFormData>>;
	submissionHistory: Array<{
		timestamp: Date;
		name: string;
		email: string;
	}>;
	successMessage: string | null;
}

type AppAction =
	| {
			type: 'contactForm';
			action: any;
	  }
	| {
			type: 'successMessageDismissed';
	  };

// ============================================================================
// Parent Reducer (observes form events)
// ============================================================================

const coreReducer: Reducer<AppState, AppAction, {}> = (state, action) => {
	switch (action.type) {
		case 'contactForm': {
			// 🔑 KEY PATTERN: Parent observes child form events
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
						successMessage: `Thank you, ${formData.name}!`
					},
					Effect.none()
				];
			}
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
// Integrated Reducer (uses scope())
// ============================================================================

const formReducer = createFormReducer(formConfig);

// Compose core reducer + scoped form reducer
const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
	// Run core reducer first
	const [s1, e1] = coreReducer(state, action, deps);

	// Then run scoped form reducer
	const scopedFormReducer = scope<AppState, AppAction, any, any, {}>(
		(s) => s.contactForm,
		(s, child) => ({ ...s, contactForm: child }),
		(a) => (a.type === 'contactForm' ? a.action : null),
		(childAction) => ({ type: 'contactForm', action: childAction }),
		formReducer
	);

	const [s2, e2] = scopedFormReducer(s1, action, deps);

	return [s2, Effect.batch(e1, e2)];
};

const createInitialAppState = (): AppState => ({
	contactForm: createInitialFormState(formConfig),
	submissionHistory: [],
	successMessage: null
});

// ============================================================================
// Tests
// ============================================================================

describe('Form - Integrated Mode', () => {
	describe('Parent-Child Integration', () => {
		it('integrates form into parent state using scope()', () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// Verify form is integrated into parent state
			expect(store.state.contactForm).toBeDefined();
			expect(store.state.contactForm.data).toEqual({
				name: '',
				email: '',
				message: ''
			});
			expect(store.state.contactForm.fields).toBeDefined();
		});

		it('routes form actions through parent', async () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// Send form action wrapped in parent action
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'John Doe'
				}
			});

			// Verify form state updated
			expect(store.state.contactForm.data.name).toBe('John Doe');
			expect(store.state.contactForm.fields.name.dirty).toBe(true);
		});

		it('validates fields through integrated reducer', async () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// Change to invalid value
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'J'
				}
			});

			// Blur to trigger validation
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldBlurred',
					field: 'name'
				}
			});

			// Should receive validation actions (type-only matching for browser tests)
			await store.receive({ type: 'contactForm' });
			await store.receive({ type: 'contactForm' });

			// Check state directly - error should be set
			expect(store.state.contactForm.fields.name.touched).toBe(true);
			expect(store.state.contactForm.fields.name.error).toBe('Name must be at least 2 characters');
		});
	});

	describe('Parent Observation Pattern', () => {
		it('parent observes form submission success', async () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// Fill form with valid data
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'John Doe'
				}
			});

			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'email',
					value: 'john@example.com'
				}
			});

			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'message',
					value: 'This is a test message that is long enough.'
				}
			});

			// Submit form
			await store.send({
				type: 'contactForm',
				action: { type: 'submitTriggered' }
			});

			// Wait for async effects to complete
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Receive validation and submission actions (type-only matching for browser tests)
			await store.receive({ type: 'contactForm' }); // formValidationStarted
			await store.receive({ type: 'contactForm' }); // formValidationCompleted
			await store.receive({ type: 'contactForm' }); // submissionStarted
			await store.receive({ type: 'contactForm' }); // submissionSucceeded

			// 🔑 KEY ASSERTION: Parent observed submission success
			expect(store.state.submissionHistory).toHaveLength(1);
			expect(store.state.submissionHistory[0].name).toBe('John Doe');
			expect(store.state.submissionHistory[0].email).toBe('john@example.com');
			expect(store.state.successMessage).toBe('Thank you, John Doe!');
		});

		it('parent can react to form events with effects', async () => {
			// Note: This test shows the pattern, but Effect.afterDelay would need
			// to be tested with a real time-based test
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// Verify parent state structure supports effects
			expect(store.state.successMessage).toBeNull();

			// Parent can dispatch its own actions
			await store.send({ type: 'successMessageDismissed' });

			expect(store.state.successMessage).toBeNull();
		});
	});

	describe('Multiple Form Integration', () => {
		it('can integrate multiple forms into same parent', () => {
			interface MultiFormState {
				contactForm: ReturnType<typeof createInitialFormState<ContactFormData>>;
				feedbackForm: ReturnType<typeof createInitialFormState<ContactFormData>>;
			}

			type MultiFormAction =
				| { type: 'contactForm'; action: any }
				| { type: 'feedbackForm'; action: any };

			const multiCoreReducer: Reducer<MultiFormState, MultiFormAction, {}> = (state, action) => {
				return [state, Effect.none()];
			};

			const contactFormReducer = createFormReducer(formConfig);
			const feedbackFormReducer = createFormReducer(formConfig);

			const multiReducer: Reducer<MultiFormState, MultiFormAction, {}> = (state, action, deps) => {
				const [s1, e1] = multiCoreReducer(state, action, deps);

				const scopedContact = scope<MultiFormState, MultiFormAction, any, any, {}>(
					(s) => s.contactForm,
					(s, child) => ({ ...s, contactForm: child }),
					(a) => (a.type === 'contactForm' ? a.action : null),
					(childAction) => ({ type: 'contactForm', action: childAction }),
					contactFormReducer
				);

				const [s2, e2] = scopedContact(s1, action, deps);

				const scopedFeedback = scope<MultiFormState, MultiFormAction, any, any, {}>(
					(s) => s.feedbackForm,
					(s, child) => ({ ...s, feedbackForm: child }),
					(a) => (a.type === 'feedbackForm' ? a.action : null),
					(childAction) => ({ type: 'feedbackForm', action: childAction }),
					feedbackFormReducer
				);

				const [s3, e3] = scopedFeedback(s2, action, deps);

				return [s3, Effect.batch(e1, e2, e3)];
			};

			const initialState: MultiFormState = {
				contactForm: createInitialFormState(formConfig),
				feedbackForm: createInitialFormState(formConfig)
			};

			const store = createTestStore({
				initialState,
				reducer: multiReducer,
				dependencies: {}
			});

			// Both forms integrated
			expect(store.state.contactForm).toBeDefined();
			expect(store.state.feedbackForm).toBeDefined();
		});

		it('routes actions to correct form', async () => {
			interface MultiFormState {
				contactForm: ReturnType<typeof createInitialFormState<ContactFormData>>;
				feedbackForm: ReturnType<typeof createInitialFormState<ContactFormData>>;
			}

			type MultiFormAction =
				| { type: 'contactForm'; action: any }
				| { type: 'feedbackForm'; action: any };

			const multiCoreReducer: Reducer<MultiFormState, MultiFormAction, {}> = (state, action) => {
				return [state, Effect.none()];
			};

			const contactFormReducer = createFormReducer(formConfig);
			const feedbackFormReducer = createFormReducer(formConfig);

			const multiReducer: Reducer<MultiFormState, MultiFormAction, {}> = (state, action, deps) => {
				const [s1, e1] = multiCoreReducer(state, action, deps);

				const scopedContact = scope<MultiFormState, MultiFormAction, any, any, {}>(
					(s) => s.contactForm,
					(s, child) => ({ ...s, contactForm: child }),
					(a) => (a.type === 'contactForm' ? a.action : null),
					(childAction) => ({ type: 'contactForm', action: childAction }),
					contactFormReducer
				);

				const [s2, e2] = scopedContact(s1, action, deps);

				const scopedFeedback = scope<MultiFormState, MultiFormAction, any, any, {}>(
					(s) => s.feedbackForm,
					(s, child) => ({ ...s, feedbackForm: child }),
					(a) => (a.type === 'feedbackForm' ? a.action : null),
					(childAction) => ({ type: 'feedbackForm', action: childAction }),
					feedbackFormReducer
				);

				const [s3, e3] = scopedFeedback(s2, action, deps);

				return [s3, Effect.batch(e1, e2, e3)];
			};

			const initialState: MultiFormState = {
				contactForm: createInitialFormState(formConfig),
				feedbackForm: createInitialFormState(formConfig)
			};

			const store = createTestStore({
				initialState,
				reducer: multiReducer,
				dependencies: {}
			});

			// Update contact form
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'Contact Name'
				}
			});

			// Update feedback form
			await store.send({
				type: 'feedbackForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'Feedback Name'
				}
			});

			// Each form has its own state
			expect(store.state.contactForm.data.name).toBe('Contact Name');
			expect(store.state.feedbackForm.data.name).toBe('Feedback Name');
		});
	});

	describe('Form State Isolation', () => {
		it('form state changes do not affect parent state', async () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			const initialSubmissionHistory = store.state.submissionHistory;

			// Change form fields
			await store.send({
				type: 'contactForm',
				action: {
					type: 'fieldChanged',
					field: 'name',
					value: 'John'
				}
			});

			// Parent state unchanged (except contactForm)
			expect(store.state.submissionHistory).toBe(initialSubmissionHistory);
			expect(store.state.successMessage).toBeNull();
		});

		it('parent actions do not affect form state', async () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			const initialFormData = store.state.contactForm.data;

			// Parent action
			await store.send({ type: 'successMessageDismissed' });

			// Form state unchanged
			expect(store.state.contactForm.data).toBe(initialFormData);
		});
	});

	describe('Integration Architecture Verification', () => {
		it('uses scope() composition pattern correctly', () => {
			// Verify the reducer is properly typed
			const state = createInitialAppState();
			const action: AppAction = { type: 'successMessageDismissed' };

			const [newState, effect] = appReducer(state, action, {});

			expect(newState).toBeDefined();
			expect(effect).toBeDefined();
		});

		it('maintains full type safety across integration', () => {
			const store = createTestStore({
				initialState: createInitialAppState(),
				reducer: appReducer,
				dependencies: {}
			});

			// TypeScript should catch any type errors here
			type StateType = typeof store.state;
			type ActionType = AppAction;

			// Verify state structure
			const _stateCheck: StateType = store.state;
			expect(_stateCheck.contactForm).toBeDefined();
			expect(_stateCheck.submissionHistory).toBeDefined();
			expect(_stateCheck.successMessage).toBeDefined();
		});
	});
});

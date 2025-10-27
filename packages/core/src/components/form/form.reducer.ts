/**
 * Form Reducer Implementation
 *
 * Reducer-first form state management with Zod validation integration.
 *
 * @packageDocumentation
 */

import { ZodError } from 'zod';
import { Effect } from '../../effect.js';
import type {
	FormState,
	FormConfig,
	FormAction,
	FormDependencies,
	FieldState
} from './form.types.js';
import type { Reducer } from '../../types.js';

/**
 * Create initial form state from configuration.
 *
 * @template T - The shape of the form data
 * @param config - Form configuration
 * @param data - Optional data to initialize with (overrides config.initialData)
 * @returns Initial form state
 *
 * @example
 * ```typescript
 * const state = createInitialFormState(config);
 * // All fields initialized with default FieldState
 * ```
 */
export function createInitialFormState<T extends Record<string, any>>(
	config: FormConfig<T>,
	data?: T
): FormState<T> {
	const formData = data ?? config.initialData;

	// Create FieldState for each field
	const fields: any = {};
	for (const key in formData) {
		fields[key] = {
			touched: false,
			dirty: false,
			error: null,
			isValidating: false,
			warnings: []
		} satisfies FieldState;
	}

	return {
		data: formData,
		fields,
		schema: config.schema,
		formErrors: [],
		isValidating: false,
		isSubmitting: false,
		submitCount: 0,
		submitError: null,
		lastSubmitted: null
	};
}

/**
 * Create form reducer with Zod validation integration.
 *
 * @template T - The shape of the form data
 * @param config - Form configuration
 * @returns Reducer function
 *
 * @example
 * ```typescript
 * const reducer = createFormReducer(config);
 * const store = createStore({
 *   initialState: createInitialFormState(config),
 *   reducer,
 *   dependencies: {}
 * });
 * ```
 */
export function createFormReducer<T extends Record<string, any>>(
	config: FormConfig<T>
): Reducer<FormState<T>, FormAction<T>, FormDependencies> {
	const { schema, mode = 'all', debounceMs = 300, asyncValidators, onSubmit } = config;

	return (state, action, deps) => {
		switch (action.type) {
			// ================================================================
			// FIELD CHANGED
			// ================================================================
			case 'fieldChanged': {
				const { field, value } = action;

				const newState: FormState<T> = {
					...state,
					data: { ...state.data, [field]: value },
					fields: {
						...state.fields,
						[field]: {
							...state.fields[field],
							dirty: true,
							error: null // Clear error on change for immediate feedback
						}
					}
				};

				// Trigger validation based on mode
				if (mode === 'onChange' || mode === 'all') {
					// CRITICAL FIX: Use Effect.debounced() instead of afterDelay()
					// This cancels previous timers, preventing validation spam
					return [
						newState,
						Effect.debounced(
							`validate-${String(field)}`, // Unique ID per field
							debounceMs,
							async (dispatch) => {
								dispatch({ type: 'fieldValidationStarted', field });
							}
						)
					];
				}

				return [newState, Effect.none()];
			}

			// ================================================================
			// FIELD BLURRED
			// ================================================================
			case 'fieldBlurred': {
				const { field } = action;

				const newState: FormState<T> = {
					...state,
					fields: {
						...state.fields,
						[field]: {
							...state.fields[field],
							touched: true
						}
					}
				};

				// Trigger validation based on mode
				if (mode === 'onBlur' || mode === 'all') {
					return [
						newState,
						Effect.run(async (dispatch) => {
							dispatch({ type: 'fieldValidationStarted', field });
						})
					];
				}

				return [newState, Effect.none()];
			}

			// ================================================================
			// FIELD FOCUSED
			// ================================================================
			case 'fieldFocused': {
				// Currently no-op, but can be extended for focus tracking
				return [state, Effect.none()];
			}

			// ================================================================
			// FIELD VALIDATION STARTED
			// ================================================================
			case 'fieldValidationStarted': {
				const { field } = action;

				const newState: FormState<T> = {
					...state,
					fields: {
						...state.fields,
						[field]: {
							...state.fields[field],
							isValidating: true
						}
					}
				};

				// Run Zod validation + async validators
				// CRITICAL: Use Effect.cancellable() to cancel in-flight validations
				return [
					newState,
					Effect.cancellable(
						`validate-${String(field)}`, // Cancel previous validation for this field
						async (dispatch) => {
							const fieldValue = state.data[field];
							let error: string | null = null;
							const warnings: string[] = [];

							// 1. Zod schema validation for this field
							// Validate just this specific field using schema.shape
							try {
								const fieldSchema = schema.shape[field];
								if (fieldSchema) {
									const result = fieldSchema.safeParse(fieldValue);

									if (!result.success) {
										// Extract first error message from Zod (use issues, not errors)
										const firstIssue = result.error?.issues?.[0];
										error = firstIssue?.message || 'Validation failed';
									}
								}
							} catch (e) {
								// Fallback for unexpected errors
								error = e instanceof Error ? e.message : 'Validation error';
							}

							// 2. Async validator (if provided and Zod validation passed)
							// CRITICAL FIX: Wrap in try/catch to handle network errors
							if (!error && asyncValidators?.[field]) {
								try {
									await asyncValidators[field]!(fieldValue as any);
									// No error thrown - validation passed
								} catch (e) {
									// Network error, timeout, or validation failure
									error = e instanceof Error ? e.message : 'Validation failed';
								}
							}

							dispatch({
								type: 'fieldValidationCompleted',
								field,
								error,
								warnings
							});
						}
					)
				];
			}

			// ================================================================
			// FIELD VALIDATION COMPLETED
			// ================================================================
			case 'fieldValidationCompleted': {
				const { field, error, warnings = [] } = action;

				return [
					{
						...state,
						fields: {
							...state.fields,
							[field]: {
								...state.fields[field],
								isValidating: false,
								error,
								warnings
							}
						}
					},
					Effect.none()
				];
			}

			// ================================================================
			// SUBMIT TRIGGERED
			// ================================================================
			case 'submitTriggered': {
				// Validate entire form first
				return [
					{ ...state, isValidating: true },
					Effect.run(async (dispatch) => {
						dispatch({ type: 'formValidationStarted' });
					})
				];
			}

			// ================================================================
			// FORM VALIDATION STARTED
			// ================================================================
			case 'formValidationStarted': {
				return [
					state,
					Effect.run(async (dispatch) => {
						try {
							// Validate entire form with Zod
							schema.parse(state.data);

							// No errors - proceed to submission
							dispatch({
								type: 'formValidationCompleted',
								fieldErrors: {},
								formErrors: []
							});
						} catch (e) {
							if (e instanceof ZodError) {
								// Map Zod errors to field errors
								const fieldErrors: Partial<Record<keyof T, string>> = {};
								const formErrors: string[] = [];

								for (const issue of e.issues || []) {
									const path = issue.path[0];
									if (path && typeof path === 'string') {
										// Field-level error
										fieldErrors[path as keyof T] = issue.message;
									} else {
										// Form-level error (refinements, etc.)
										formErrors.push(issue.message);
									}
								}

								dispatch({
									type: 'formValidationCompleted',
									fieldErrors,
									formErrors
								});
							} else {
								// Unexpected error
								dispatch({
									type: 'formValidationCompleted',
									fieldErrors: {},
									formErrors: [e instanceof Error ? e.message : 'Validation failed']
								});
							}
						}
					})
				];
			}

			// ================================================================
			// FORM VALIDATION COMPLETED
			// ================================================================
			case 'formValidationCompleted': {
				const { fieldErrors, formErrors } = action;

				const hasErrors = Object.keys(fieldErrors).length > 0 || formErrors.length > 0;

				if (hasErrors) {
					// Update field errors and stop (don't submit)
					const newFields = { ...state.fields };
					for (const field in fieldErrors) {
						newFields[field as keyof T] = {
							...newFields[field as keyof T],
							error: fieldErrors[field as keyof T] ?? null,
							touched: true // Mark as touched to show error
						};
					}

					return [
						{
							...state,
							fields: newFields,
							formErrors,
							isValidating: false,
							submitCount: state.submitCount + 1 // Increment even on validation failure
						},
						Effect.none()
					];
				}

				// No errors - proceed to submission
				return [
					{ ...state, isValidating: false },
					Effect.run(async (dispatch) => {
						dispatch({ type: 'submissionStarted' });
					})
				];
			}

			// ================================================================
			// SUBMISSION STARTED
			// ================================================================
			case 'submissionStarted': {
				return [
					{
						...state,
						isSubmitting: true,
						submitError: null
					},
					Effect.run(async (dispatch) => {
						try {
							await onSubmit(state.data);
							dispatch({ type: 'submissionSucceeded' });

							// Call success callback if provided
							if (config.onSubmitSuccess) {
								config.onSubmitSuccess(state.data);
							}
						} catch (e) {
							const errorMessage = e instanceof Error ? e.message : 'Submission failed';
							dispatch({
								type: 'submissionFailed',
								error: errorMessage
							});

							// Call error callback if provided
							if (config.onSubmitError) {
								config.onSubmitError(
									e instanceof Error ? e : new Error('Submission failed')
								);
							}
						}
					})
				];
			}

			// ================================================================
			// SUBMISSION SUCCEEDED
			// ================================================================
			case 'submissionSucceeded': {
				return [
					{
						...state,
						isSubmitting: false,
						lastSubmitted: new Date(),
						submitCount: state.submitCount + 1
					},
					Effect.none()
				];
			}

			// ================================================================
			// SUBMISSION FAILED
			// ================================================================
			case 'submissionFailed': {
				return [
					{
						...state,
						isSubmitting: false,
						submitError: action.error,
						submitCount: state.submitCount + 1
					},
					Effect.none()
				];
			}

			// ================================================================
			// FORM RESET
			// ================================================================
			case 'formReset': {
				const resetData = action.data ?? config.initialData;

				return [createInitialFormState(config, resetData), Effect.none()];
			}

			// ================================================================
			// SET FIELD VALUE (Programmatic)
			// ================================================================
			case 'setFieldValue': {
				return [
					{
						...state,
						data: { ...state.data, [action.field]: action.value },
						fields: {
							...state.fields,
							[action.field]: {
								...state.fields[action.field],
								dirty: true
							}
						}
					},
					Effect.none()
				];
			}

			// ================================================================
			// SET FIELD ERROR (Programmatic)
			// ================================================================
			case 'setFieldError': {
				return [
					{
						...state,
						fields: {
							...state.fields,
							[action.field]: {
								...state.fields[action.field],
								error: action.error
							}
						}
					},
					Effect.none()
				];
			}

			// ================================================================
			// CLEAR FIELD ERROR (Programmatic)
			// ================================================================
			case 'clearFieldError': {
				return [
					{
						...state,
						fields: {
							...state.fields,
							[action.field]: {
								...state.fields[action.field],
								error: null
							}
						}
					},
					Effect.none()
				];
			}

			default:
				return [state, Effect.none()];
		}
	};
}

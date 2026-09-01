/**
 * Form Reducer Implementation
 *
 * Reducer-first form state management with Zod validation integration.
 *
 * @packageDocumentation
 */

import { ZodError, type ZodIssue } from 'zod';
import { Effect } from '../../effect.js';
import type {
	FormState,
	FormConfig,
	FormAction,
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
		focusedField: null,
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
): Reducer<FormState<T>, FormAction<T>> {
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
					// Only if it is still the focused one. Focus can have moved on by
					// the time a stale blur is processed, and clearing unconditionally
					// would blank the attribute on the live field.
					focusedField: state.focusedField === field ? null : state.focusedField,
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
				if (state.focusedField === action.field) {
					return [state, Effect.none()];
				}

				// Note what is NOT here: `touched`. That gates error display, so
				// touching on focus shows "required" on every field the user tabs
				// through. `fieldBlurred` is the one that touches.
				return [{ ...state, focusedField: action.field }, Effect.none()];
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

							// 1. Zod validation.
							//
							// The WHOLE schema against the WHOLE data, then the issues for
							// this field. It used to be `schema.shape[field].safeParse(value)`
							// — one sub-schema, one value — which cannot see a rule that
							// spans two fields. A `.refine()` lives in the parent object's
							// checks, so `schema.shape.confirmPassword.safeParse('mismatch')`
							// returns success and "passwords must match" was invisible to
							// every mode except `onSubmit`.
							//
							// Parsing the whole object is also what deletes the `as any`
							// cast this used to need: `.shape` exists only on a ZodObject,
							// and when it was absent — a non-object schema, or Zod 3, where
							// `.refine()` returned a `ZodEffects` with no `.shape` — the
							// lookup yielded `undefined`, the `if` was skipped, and every
							// field silently validated as clean. A guard that cannot fail is
							// worse than none.
							let issues: readonly ZodIssue[] = [];
							try {
								const result = schema.safeParse(state.data);
								if (!result.success) issues = result.error.issues;
							} catch (e) {
								// Fallback for unexpected errors
								error = e instanceof Error ? e.message : 'Validation error';
							}

							const issueFor = (name: keyof T): string | null =>
								issues.find((issue) => issue.path[0] === name)?.message ?? null;

							if (error === null) error = issueFor(field);

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

							// 3. Refresh siblings that the full parse has just exonerated.
							//
							// Cross-field rules make one field's edit change another field's
							// verdict. Fix `password` to match and `confirmPassword` was
							// still showing "Passwords do not match" — true when it was
							// written, false by the time it was read, and it stayed until
							// the user touched that field or submitted again.
							//
							// The rule, and why this is safe: an error may DISAPPEAR from
							// any field, but may only APPEAR on the field being validated.
							// Nothing here flags a field the user has not touched.
							for (const name of Object.keys(state.fields) as (keyof T)[]) {
								if (name === field) continue;
								if (state.fields[name]?.error == null) continue;
								if (issueFor(name) !== null) continue;

								dispatch({
									type: 'fieldValidationCompleted',
									field: name,
									error: null,
									warnings: []
								});
							}
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
							// The parsed result, not just the verdict. Zod applies a
							// schema's transforms while validating, and until this
							// carried `data` the output was computed and thrown away —
							// so `state.data` held raw input while `FormState<T>`
							// declared `T`, the schema's *output* type.
							const parsed = schema.parse(state.data);

							// No errors - proceed to submission
							dispatch({
								type: 'formValidationCompleted',
								fieldErrors: {},
								formErrors: [],
								data: parsed
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

				// No errors - proceed to submission.
				//
				// `formErrors: []` is not cosmetic. Nothing else clears it but
				// `formReset`, so a form-level error survived the validation that
				// disproved it: fix the thing it complained about, submit again
				// successfully, and the message was still on screen.
				//
				// `data` is the schema's output, and writing it back here is what
				// makes a schema the single declaration of what a field is. A
				// `.trim()` used to decide only whether all-whitespace was rejected;
				// what got *sent* had to be trimmed again by whoever built the
				// request, and forgetting that second step failed silently — the
				// form accepted the value and the backend received the dirty one.
				//
				// **Here and not in per-field validation.** That path runs on every
				// keystroke in `onChange` mode, where writing back would trim the
				// space the user just typed and fight them mid-word. Whole-form
				// validation runs at submit, when typing has finished.
				return [
					{
						...state,
						...(action.data !== undefined && { data: action.data }),
						isValidating: false,
						formErrors: []
					},
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

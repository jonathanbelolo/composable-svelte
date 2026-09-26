/**
 * Form Reducer Implementation
 *
 * Reducer-first form state management with Zod validation integration.
 *
 * @packageDocumentation
 */

import { ZodError, ZodObject, ZodArray, ZodOptional, ZodNullable, type ZodType, type ZodIssue } from 'zod';
import { Effect } from '../../effect.js';
import type {
	FormState,
	FormConfig,
	FormAction,
	FieldState
} from './form.types.js';
import type { Reducer } from '../../types.js';
import {
	collectFieldPaths,
	defaultFieldState,
	readAtPath,
	setAtPath,
	toFieldPath,
	withField
} from './field-path.js';
import type { FieldPath, FormFields } from './field-path.js';

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

	// A record for every addressable path, not just the top level.
	//
	// `for (const key in formData)` walked one level, which is where a nested
	// form first lost its shape: `address.zip` had nowhere to put an error, so
	// the error went to `address` and named a field the user cannot see.
	//
	// Every node is keyed, not only the leaves — a whole-object `.refine()`
	// produces an issue at `['address']` and needs a home too.
	const fields: FormFields<T> = {};
	for (const path of collectFieldPaths(formData)) {
		fields[path as FieldPath<T>] = defaultFieldState();
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
 * Run an async validator and normalize any thrown error into a message string.
 */
async function runAsyncValidator(
	validator: (value: any, signal?: AbortSignal) => Promise<void>,
	value: any,
	signal?: AbortSignal
): Promise<string | null> {
	try {
		await validator(value, signal);
		return null;
	} catch (e) {
		return e instanceof Error ? e.message : 'Validation failed';
	}
}


/** Presence in normalized output matters: an absent field is not an own undefined value. */
function readNormalized(output: unknown, parts: readonly string[]): { available: boolean; value: unknown } {
	let target = output;
	for (const part of parts) {
		if (target === null || typeof target !== 'object' || !Object.prototype.hasOwnProperty.call(target, part)) {
			return { available: false, value: undefined };
		}
		target = (target as Record<string, unknown>)[part];
	}
	return { available: true, value: target };
}

/**
 * When an unrelated field prevents a full parse, parse a complete addressable
 * subtree before descending further. Wrappers/transforms are executed, never
 * stripped: a default/catch/transform can change the normalized nested value.
 * An unparseable opaque parent defers custom validation rather than passing raw data.
 */
function partialFieldOutput(schema: ZodType, data: unknown, path: string): { available: boolean; value: unknown } {
	let current: ZodType | undefined = schema;
	let input = data;
	const parts = path.split('.');
	for (let i = 0; i < parts.length; i++) {
		while (current instanceof ZodOptional || current instanceof ZodNullable) current = current.unwrap() as ZodType;
		const part = parts[i]!;
		if (current instanceof ZodObject) current = current.shape[part] as ZodType | undefined;
		else if (current instanceof ZodArray && /^\d+$/.test(part)) current = current.element as ZodType;
		else return { available: false, value: undefined };
		const inputPresent = input !== null && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, part);
		input = readAtPath(input, part);
		if (!current) return { available: false, value: undefined };
		const parsed = current.safeParse(input);
		if (parsed.success) {
			if (i === parts.length - 1) return { available: inputPresent || parsed.data !== undefined, value: parsed.data };
			return readNormalized(parsed.data, parts.slice(i + 1));
		}
	}
	return { available: false, value: undefined };
}
function currentFieldValidation(schema: ZodType, data: unknown, field: string): { error: string | null; available: boolean; value: unknown } {
	try {
		const result = schema.safeParse(data);
		if (result.success) return { error: null, ...readNormalized(result.data, field.split('.')) };
		const error = result.error.issues.find(issue => toFieldPath(issue.path) === field)?.message ?? null;
		return { error, ...partialFieldOutput(schema, data, field) };
	} catch (error) { return { error: error instanceof Error ? error.message : 'Validation error', available: false, value: undefined }; }
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
	const { schema, mode = 'all', debounceMs = 300, asyncValidators, onSubmit, now } = config;

	return (state, action, deps) => {
		switch (action.type) {
			// ================================================================
			// FIELD CHANGED
			// ================================================================
			case 'fieldChanged': {
				const { field, value } = action;

				const newState: FormState<T> = {
					...state,
					data: setAtPath(state.data, field, value),
					fieldValidationSequence: (state.fieldValidationSequence ?? 0) + 1,
					fields: withField(state.fields, field, {
						dirty: true,
						error: null, // Clear error on change for immediate feedback
						asyncError: null,
						isValidating: false,
						validationId: (state.fieldValidationSequence ?? 0) + 1
					}),
					isValidating: false,
					validationId: (state.validationId ?? 0) + 1,
					...((state.isValidating || state.submitOutcome === 'ready') && { submitOutcome: 'invalidated' as const })
				};

				const cancelValidation = Effect.batch<FormAction<T>>(
					Effect.cancel('validate-form'), Effect.cancel(`validate-${String(field)}`)
				);

				// Trigger validation based on mode
				if (mode === 'onChange' || mode === 'all') {
					// CRITICAL FIX: Use Effect.debounced() instead of afterDelay()
					// This cancels previous timers, preventing validation spam
					const debounceEffect = Effect.debounced<FormAction<T>>(
						`validate-${String(field)}`, // Unique ID per field
						debounceMs,
						async (dispatch) => {
							dispatch({ type: 'fieldValidationStarted', field });
						}
					);
					return [
						newState,
						Effect.batch(cancelValidation, debounceEffect)
					];
				}

				return [newState, cancelValidation];
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
					fields: withField(state.fields, field, { touched: true })
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
				const validationId = (state.fieldValidationSequence ?? 0) + 1;
				const snapshot = state.data;

				const newState: FormState<T> = {
					...state,
					fieldValidationSequence: validationId,
					fields: withField(state.fields, field, { isValidating: true, validationId })
				};

				// Run Zod validation + async validators
				// CRITICAL: Use Effect.cancellable() to cancel in-flight validations
				return [
					newState,
					Effect.cancellable(
						`validate-${String(field)}`, // Cancel previous validation for this field
						async (dispatch, signal) => {
							let fieldValue = readAtPath(snapshot, field);
							let hasParsedField = false;
							let asyncError: string | null = null;
							let ranAsyncValidator = false;
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
								const result = schema.safeParse(snapshot);
								if (!result.success) issues = result.error.issues;
								else { const normalized = readNormalized(result.data, field.split('.')); fieldValue = normalized.value; hasParsedField = normalized.available; }
								if (!hasParsedField) {
									const parsedField = partialFieldOutput(schema, snapshot, field);
									if (parsedField.available) { fieldValue = parsedField.value; hasParsedField = true; }
								}
							} catch (e) {
								// Fallback for unexpected errors
								error = e instanceof Error ? e.message : 'Validation error';
							}

							// The FIRST issue for this exact path.
							//
							// `find` takes the first, and Zod emits in schema-declaration
							// order — so `.min(1, 'Email is required').email(...)` reports
							// "required" for whitespace, which is the actionable one. The
							// whole-form path below assigns in a loop and used to keep the
							// LAST, so the same input said one thing while typing and
							// another on submit.
							//
							// Exact, not prefix: a prefix match would put the zip code's
							// error on `address` as well as `address.zip`.
							const issueFor = (name: string): string | null =>
								issues.find((issue) => toFieldPath(issue.path) === name)?.message ??
								null;

							if (error === null) error = issueFor(field);

							// 2. Async validator (if provided and Zod validation passed)
							// CRITICAL FIX: Wrap in try/catch to handle network errors
							if (!error && hasParsedField && asyncValidators?.[field]) {
								ranAsyncValidator = true;
								asyncError = await runAsyncValidator(asyncValidators[field]!, fieldValue, signal);
								error = asyncError;
							}

							if (signal?.aborted) return;
							dispatch({
								type: 'fieldValidationCompleted',
								validationId, snapshot, asyncError,
								...(ranAsyncValidator ? { validatedValue: fieldValue } : {}),
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
							for (const name of Object.keys(state.fields) as FieldPath<T>[]) {
								if (name === field) continue;
								if (state.fields[name]?.error == null || state.fields[name]?.isValidating) continue;
								if (issueFor(name) !== null) continue;

								dispatch({
									type: 'fieldValidationCompleted',
									field: name,
									validationId: state.fields[name]?.validationId ?? 0, snapshot, schemaOnly: true,
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
				const { field, warnings = [] } = action;
				let error = action.error;
				if (action.validationId !== undefined && action.validationId !== (state.fields[field]?.validationId ?? 0)) return [state, Effect.none()];
				if (action.snapshot !== undefined && action.snapshot !== state.data) {
					const current = currentFieldValidation(schema, state.data, field);
					if (action.schemaOnly) {
						if (current.error !== null) return [state, Effect.none()];
					} else if (!Object.is(readAtPath(action.snapshot, field), readAtPath(state.data, field)) ||
						('validatedValue' in action && current.available && !Object.is(current.value, action.validatedValue))) {
						// Own input or normalized output changed. Recheck against the current
						// snapshot; object-valued output conservatively revalidates too.
						return [state, Effect.run(async dispatch => { dispatch({ type: 'fieldValidationStarted', field }); })];
					} else {
						error = current.error ?? action.asyncError ?? null;
					}
				}
				// A schema-only pass cannot disprove a separate async rule's verdict.
				if (action.schemaOnly) error = state.fields[field]?.asyncError ?? error;

				return [
					{
						...state,
						fields: withField(state.fields, field, {
							isValidating: false,
							error,
							...(!action.schemaOnly ? { asyncError: action.asyncError ?? null } : {}),
							warnings
						})
					},
					Effect.none()
				];
			}

			// ================================================================
			// SUBMIT TRIGGERED
			// ================================================================
			case 'submitTriggered': {
				const validationId = (state.validationId ?? 0) + 1;
				// Validate entire form first
				return [
					{ ...state, isValidating: true, validationId, submitOutcome: 'validating' },
					Effect.run(async (dispatch) => {
						dispatch({ type: 'formValidationStarted', validationId });
					})
				];
			}

			// ================================================================
			// FORM VALIDATION STARTED
			// ================================================================
			case 'formValidationStarted': {
				if (action.validationId !== undefined && action.validationId !== state.validationId) return [state, Effect.none()];
				const validationId = action.validationId ?? (state.validationId ?? 0) + 1;
				const snapshot = state.data;

				return [
					{ ...state, isValidating: true, validationId, submitOutcome: 'validating' },
					Effect.cancellable('validate-form', async (dispatch, signal) => {
						try {
							// The parsed result, not just the verdict. Zod applies a
							// schema's transforms while validating, and until this
							// carried `data` the output was computed and thrown away —
							// so `state.data` held raw input while `FormState<T>`
							// declared `T`, the schema's *output* type.
							const parsed = schema.parse(snapshot);

							const fieldErrors: Partial<Record<FieldPath<T>, string>> = {};

							if (asyncValidators) {
								const entries = Object.entries(asyncValidators) as [
									FieldPath<T>,
									((value: any, signal?: AbortSignal) => Promise<void>) | undefined
								][];

								await Promise.all(
									entries.map(async ([field, validator]) => {
										if (!validator) return;
										const normalized = readNormalized(parsed, field.split('.'));
										if (!normalized.available) return;
										const err = await runAsyncValidator(validator, normalized.value, signal);
										if (err !== null) {
											fieldErrors[field] = err;
										}
									})
								);
							}

							if (signal?.aborted) return;

							if (Object.keys(fieldErrors).length > 0) {
								dispatch({
									type: 'formValidationCompleted',
									validationId,
									fieldErrors,
									asyncFieldErrors: fieldErrors,
									formErrors: [],
									snapshot
								});
								return;
							}

							// No errors - proceed to submission
							dispatch({
								type: 'formValidationCompleted',
								validationId,
								fieldErrors: {},
								formErrors: [],
								data: parsed,
								snapshot
							});
						} catch (e) {
							if (e instanceof ZodError) {
								// Map Zod errors to field errors
								// A Map, and the first issue per path wins.
								//
								// Two fixes in one loop. This used to read `issue.path[0]`,
								// so a nested issue at ['address','zip'] was filed under
								// `address`; and it assigned unconditionally, so the LAST
								// issue for a field overwrote every earlier one while the
								// per-field path above kept the FIRST. Same input, two
								// different messages depending on how validation was
								// triggered.
								//
								// `typeof path === 'string'` is gone with it: a numeric
								// segment is falsy at index 0 and not a string, so an array
								// element's issue fell into `formErrors`, which no component
								// renders.
								const seen = new Map<string, string>();
								const formErrors: string[] = [];

								for (const issue of e.issues || []) {
									const path = toFieldPath(issue.path);
									if (path === null) {
										// Form-level: a top-level refinement, or a path this
										// cannot address.
										formErrors.push(issue.message);
									} else if (!seen.has(path)) {
										seen.set(path, issue.message);
									}
								}

								const fieldErrors = Object.fromEntries(seen) as Partial<
									Record<FieldPath<T>, string>
								>;

								dispatch({
									type: 'formValidationCompleted',
									validationId,
									fieldErrors,
									formErrors,
									snapshot
								});
							} else {
								// Unexpected error
								dispatch({
									type: 'formValidationCompleted',
									validationId,
									fieldErrors: {},
									formErrors: [e instanceof Error ? e.message : 'Validation failed'],
									snapshot
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

				if (action.validationId !== undefined && (action.validationId !== state.validationId || !state.isValidating)) return [state, Effect.none()];
				// The parent may replace data directly while this validation is pending.
				// Finish that stale attempt without applying its verdict or resubmitting.
				if (action.snapshot !== undefined && state.data !== action.snapshot) return [{ ...state, isValidating: false, submitOutcome: 'invalidated' }, Effect.none()];

				const hasErrors = Object.keys(fieldErrors).length > 0 || formErrors.length > 0;

				if (hasErrors) {
					if (action.asyncFieldErrors !== undefined) {
						const fieldValidationSequence = (state.fieldValidationSequence ?? 0) + 1;
						let newFields = state.fields;
						for (const field of Object.keys(state.fields) as FieldPath<T>[]) {
							if (Object.prototype.hasOwnProperty.call(fieldErrors, field)) {
								newFields = withField(newFields, field, {
									error: fieldErrors[field] ?? null,
									asyncError: action.asyncFieldErrors[field] ?? null,
									touched: true,
									isValidating: false,
									validationId: fieldValidationSequence
								});
							} else {
								newFields = withField(newFields, field, {
									error: null,
									asyncError: null,
									isValidating: false,
									validationId: fieldValidationSequence
								});
							}
						}
						for (const field of Object.keys(fieldErrors) as FieldPath<T>[]) {
							if (!Object.prototype.hasOwnProperty.call(state.fields, field)) {
								newFields = withField(newFields, field, {
									error: fieldErrors[field] ?? null,
									asyncError: action.asyncFieldErrors[field] ?? null,
									touched: true,
									isValidating: false,
									validationId: fieldValidationSequence
								});
							}
						}
						return [
							{
								...state,
								fields: newFields,
								fieldValidationSequence,
								formErrors,
								isValidating: false,
								submitCount: state.submitCount + 1,
								submitOutcome: 'failed'
							},
							Effect.batch<FormAction<T>>(
								...Object.keys(state.fields).map(field => Effect.cancel<FormAction<T>>(`validate-${field}`))
							)
						];
					}

					// Update field errors and stop (don't submit)
					// `withField` bases each write on a complete default, so an error
					// for a path with no record yet — an array element that did not
					// exist at init — gets all five keys rather than a two-key object
					// spread from `undefined`.
					let newFields = state.fields;
					// The schema pass exonerates old schema errors, but did not run custom validators.
					for (const field of Object.keys(state.fields) as FieldPath<T>[]) {
						if (!Object.prototype.hasOwnProperty.call(fieldErrors, field)) {
							newFields = withField(newFields, field, { error: state.fields[field]?.asyncError ?? null });
						}
					}
					for (const field of Object.keys(fieldErrors) as FieldPath<T>[]) {
						newFields = withField(newFields, field, {
							error: fieldErrors[field] ?? null,
							asyncError: action.asyncFieldErrors?.[field] ?? null,
							touched: true // Mark as touched to show error
						});
					}

					return [
						{
							...state,
							fields: newFields,
							formErrors,
							isValidating: false,
							submitCount: state.submitCount + 1, // Increment even on validation failure
							submitOutcome: 'failed'
						},
						Effect.none()
					];
				}

				const fieldValidationSequence = (state.fieldValidationSequence ?? 0) + 1;
				let validatedFields = state.fields;
				for (const field of Object.keys(state.fields) as FieldPath<T>[]) {
					validatedFields = withField(validatedFields, field, { error: null, asyncError: null, isValidating: false, validationId: fieldValidationSequence });
				}
				const approvedData = action.data !== undefined ? { ...state.data, ...action.data } : state.data;
				const validationId = state.validationId ?? 0;
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
						// Merged over the existing data, not swapped for it. Zod
						// object schemas strip keys they do not declare, so replacing
						// would silently delete anything a consumer kept in `data`
						// beside the validated fields — and the form would lose it at
						// the moment of submitting, which is the worst possible time.
						// Merging still applies every transform and default, because
						// the parsed values win.
						data: approvedData,
						fields: validatedFields,
						fieldValidationSequence,
						validationId,
						submitOutcome: 'ready',
						isValidating: false,
						formErrors: []
					},
					Effect.batch<FormAction<T>>(
						...Object.keys(state.fields).map(field => Effect.cancel<FormAction<T>>(`validate-${field}`)),
						Effect.run(async (dispatch) => {
							dispatch({ type: 'submissionStarted', validationId, snapshot: approvedData });
						})
					)
				];
			}

			// ================================================================
			// SUBMISSION STARTED
			// ================================================================
			case 'submissionStarted': {
				if (action.validationId !== undefined && action.validationId !== state.validationId) return [state, Effect.none()];
				if (action.snapshot !== undefined && action.snapshot !== state.data) return [{ ...state, submitOutcome: 'invalidated' }, Effect.none()];
				const submissionId = (state.submissionId ?? 0) + 1;
				return [
					{
						...state,
						isSubmitting: true,
						submissionId,
						submitOutcome: 'submitting',
						submitError: null
					},
					Effect.cancellable('submit-form', async (dispatch, signal) => {
						try {
							await onSubmit(state.data);
							if (signal?.aborted) return;
							const clock = now ?? (() => new Date());
							const submittedAt = clock();
							dispatch({ type: 'submissionSucceeded', submissionId, submittedAt });

							// Call success callback if provided
							if (config.onSubmitSuccess) {
								config.onSubmitSuccess(state.data);
							}
						} catch (e) {
							if (signal?.aborted) return;
							const errorMessage = e instanceof Error ? e.message : 'Submission failed';
							dispatch({
								type: 'submissionFailed',
								submissionId,
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
				if (action.submissionId !== undefined && (action.submissionId !== state.submissionId || !state.isSubmitting)) return [state, Effect.none()];
				return [
					{
						...state,
						isSubmitting: false,
						lastSubmitted: action.submittedAt ?? null,
						submitOutcome: 'succeeded',
						submitCount: state.submitCount + 1
					},
					Effect.none()
				];
			}

			// ================================================================
			// SUBMISSION FAILED
			// ================================================================
			case 'submissionFailed': {
				if (action.submissionId !== undefined && (action.submissionId !== state.submissionId || !state.isSubmitting)) return [state, Effect.none()];
				return [
					{
						...state,
						isSubmitting: false,
						submitError: action.error,
						submitOutcome: 'failed',
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

				return [
					{ ...createInitialFormState(config, resetData), validationId: (state.validationId ?? 0) + 1, fieldValidationSequence: state.fieldValidationSequence ?? 0, submissionId: (state.submissionId ?? 0) + 1 },
					Effect.batch<FormAction<T>>(Effect.cancel('validate-form'), Effect.cancel('submit-form'), ...Object.keys(state.fields).map(field => Effect.cancel<FormAction<T>>(`validate-${field}`)))
				];
			}

			// ================================================================
			// SET FIELD VALUE (Programmatic)
			// ================================================================
			case 'setFieldValue': {
				return [
					{
						...state,
						data: setAtPath(state.data, action.field, action.value),
						fields: withField(state.fields, action.field, { dirty: true, asyncError: null, isValidating: false, validationId: (state.fieldValidationSequence ?? 0) + 1 }),
						fieldValidationSequence: (state.fieldValidationSequence ?? 0) + 1,
						validationId: (state.validationId ?? 0) + 1,
						isValidating: false,
						...((state.isValidating || state.submitOutcome === 'ready') && { submitOutcome: 'invalidated' as const })
					},
					Effect.batch<FormAction<T>>(Effect.cancel('validate-form'), Effect.cancel(`validate-${String(action.field)}`))
				];
			}

			// ================================================================
			// SET FIELD ERROR (Programmatic)
			// ================================================================
			case 'setFieldError': {
				return [
					{
						...state,
						fields: withField(state.fields, action.field, { error: action.error, asyncError: null })
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
						fields: withField(state.fields, action.field, { error: null, asyncError: null })
					},
					Effect.none()
				];
			}

			default:
				return [state, Effect.none()];
		}
	};
}

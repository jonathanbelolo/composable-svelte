/**
 * Form Reducer Implementation
 *
 * Reducer-first form state management with Zod validation integration.
 *
 * @packageDocumentation
 */
import type { FormState, FormConfig, FormAction, FormDependencies } from './form.types.js';
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
export declare function createInitialFormState<T extends Record<string, any>>(config: FormConfig<T>, data?: T): FormState<T>;
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
export declare function createFormReducer<T extends Record<string, any>>(config: FormConfig<T>): Reducer<FormState<T>, FormAction<T>, FormDependencies>;
//# sourceMappingURL=form.reducer.d.ts.map
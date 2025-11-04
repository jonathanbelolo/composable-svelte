/**
 * Fluent API for store scoping (Phase 3 DSL).
 *
 * The `scopeTo()` function provides a chainable builder API for creating scoped stores,
 * reducing boilerplate by 90% compared to manual scoping.
 *
 * Key benefits over Phase 2 functional API:
 * - Fluent chaining: .into('field').case('type')
 * - Type-safe path building
 * - Automatic action wrapping
 * - Cleaner component code
 *
 * **Function disambiguation:**
 * - `scope()` (core spec): Compose child reducer into parent **reducer** (business logic)
 * - `ifLet()` (navigation spec): Handle optional child state in **reducers**
 * - `scopeTo()` (this file): Create scoped store for **components** (view layer)
 *
 * @packageDocumentation
 */
import type { Store } from '../types.js';
/**
 * Scoped store interface.
 *
 * Provides state and dispatch for a child feature, with actions
 * automatically wrapped for the parent store.
 *
 * @template State - The child state type
 * @template Action - The child action type
 */
export interface ScopedStore<State, Action> {
    /**
     * The child state.
     *
     * This is the unwrapped state from the destination or optional field.
     */
    readonly state: State;
    /**
     * Dispatch function that wraps actions for parent.
     *
     * @param action - The child action to dispatch
     *
     * @example
     * ```typescript
     * scopedStore.dispatch({ type: 'saveButtonTapped' });
     * // Automatically wrapped as:
     * // { type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: childAction } } }
     * ```
     */
    dispatch(action: Action): void;
    /**
     * Dismiss the child feature.
     *
     * Convenience method that dispatches PresentationAction.dismiss().
     */
    dismiss(): void;
}
/**
 * Create a fluent store scoping builder.
 *
 * This is the entry point for the scopeTo() DSL. It creates a builder that can be
 * chained with .into() and .case() to scope into nested state.
 *
 * **Named `scopeTo()`** to avoid confusion with `scope()` from core spec, which is
 * for reducer composition at the business logic layer.
 *
 * **Usage patterns:**
 * - Destination enum: `scopeTo(store).into('destination').case('addItem')`
 * - Optional field: `scopeTo(store).into('modal').optional()`
 * - Nested: `scopeTo(store).into('features').into('settings').optional()`
 *
 * **Performance:**
 * - Zero overhead at runtime (just object creation)
 * - Should be used inside `$derived` in Svelte components for reactivity
 * - Creates new scoped store on every call (cheap, but use $derived)
 *
 * @template State - The parent state type
 * @template Action - The parent action type
 * @param store - The parent store to scope
 * @returns A ScopeBuilder for chaining
 *
 * @example
 * ```typescript
 * // In Svelte component
 * const store = createStore({ initialState, reducer });
 *
 * // Scope to destination case
 * const addItemStore = $derived(
 *   scopeTo(store).into('destination').case('addItem')
 * );
 *
 * // Use in template
 * <Modal store={addItemStore}>
 *   {#if addItemStore}
 *     <AddItemView store={addItemStore} />
 *   {/if}
 * </Modal>
 * ```
 *
 * @example
 * ```typescript
 * // Optional field (non-enum)
 * const settingsStore = $derived(
 *   scopeTo(store).into('settings').optional()
 * );
 *
 * // Nested scoping
 * const nestedStore = $derived(
 *   scopeTo(store).into('features').into('inventory').optional()
 * );
 * ```
 */
export declare function scopeTo<State, Action>(store: Store<State, Action>): ScopeBuilder<State, Action, State>;
/**
 * Fluent builder for store scoping.
 *
 * This class provides the chainable API for scoping into nested state.
 * Each method returns a new builder to allow chaining.
 *
 * **Implementation details:**
 * - Tracks path as array of keys (e.g., ['destination', 'nested'])
 * - Current type parameter tracks current position in state tree
 * - Type-safe key access via `keyof Current`
 *
 * @template State - The root state type
 * @template Action - The root action type
 * @template Current - The current position in the state tree
 */
declare class ScopeBuilder<State, Action, Current = State> {
    private store;
    private path;
    constructor(store: Store<State, Action>, path: Array<string | number>);
    /**
     * Scope into a nested field.
     *
     * This method navigates into a field of the current state. The field can be
     * required or optional. Use `.optional()` or `.case()` at the end of the chain
     * to handle nullable values.
     *
     * **Type safety:**
     * - Field must be a key of Current
     * - Return type is the type of Current[K]
     * - TypeScript infers the new Current type automatically
     *
     * @template K - The field key type (inferred)
     * @param key - The field name to scope into
     * @returns A new ScopeBuilder positioned at the field
     *
     * @example
     * ```typescript
     * interface State {
     *   destination: DestinationState | null;
     *   settings: SettingsState | null;
     * }
     *
     * // Type-safe field access
     * scopeTo(store).into('destination');  // ✓ Valid
     * scopeTo(store).into('settings');     // ✓ Valid
     * scopeTo(store).into('invalid');      // ✗ Compile error
     * ```
     */
    into<K extends keyof Current>(key: K): ScopeBuilder<State, Action, Current[K]>;
    /**
     * Scope to a specific enum case.
     *
     * This method checks if the current value is a discriminated union matching
     * the specified case type, and extracts the nested state.
     *
     * **Returns:**
     * - ScopedStore if current value matches the case type
     * - null if current value is null or different case type
     *
     * **Assumptions:**
     * - Current value is { type: string; state: ChildState }
     * - Actions are wrapped in destination case: { type: caseType; action: ChildAction }
     * - Actions are wrapped in PresentationAction: { type: 'presented', action: ... }
     *
     * @template T - The case type string (inferred)
     * @param caseType - The discriminated union case type to match
     * @returns A scoped store or null
     *
     * @example
     * ```typescript
     * type Destination =
     *   | { type: 'addItem'; state: AddItemState }
     *   | { type: 'editItem'; state: EditItemState };
     *
     * interface State {
     *   destination: Destination | null;
     * }
     *
     * // Scope to specific case
     * const addItemStore = scopeTo(store).into('destination').case('addItem');
     * // Result: ScopedStore<AddItemState, AddItemAction> | null
     *
     * // In Svelte template
     * {#if addItemStore}
     *   <AddItemView store={addItemStore} />
     * {/if}
     * ```
     */
    case<T extends string>(caseType: T): ScopedStore<any, any> | null;
    /**
     * Scope to an optional value (non-enum).
     *
     * This method handles optional fields that are not discriminated unions.
     * Use this for simple optional children without case discrimination.
     *
     * **Returns:**
     * - ScopedStore if current value is non-null
     * - null if current value is null
     *
     * **Difference from .case():**
     * - `.case()`: For discriminated unions ({ type, state })
     * - `.optional()`: For simple optional fields (T | null)
     *
     * @returns A scoped store or null
     *
     * @example
     * ```typescript
     * interface State {
     *   modal: ModalState | null;  // Simple optional, not enum
     * }
     *
     * // Scope to optional field
     * const modalStore = scopeTo(store).into('modal').optional();
     * // Result: ScopedStore<ModalState, ModalAction> | null
     *
     * {#if modalStore}
     *   <Modal store={modalStore} />
     * {/if}
     * ```
     */
    optional(): ScopedStore<any, any> | null;
    /**
     * Get the current value by traversing the path from root state.
     *
     * @returns The value at the current path, or null if any step is null
     */
    private getValue;
    /**
     * Create a scoped store with automatic action wrapping.
     *
     * This method builds the dispatch function that wraps child actions through
     * the path hierarchy and presentation wrapper.
     *
     * **Action wrapping logic:**
     * 1. Child action: { type: 'saveButtonTapped' }
     * 2. If caseType: { type: 'addItem', action: childAction }
     * 3. Presentation: { type: 'presented', action: step2 }
     * 4. Path wrapping: { type: 'destination', action: step3 } (for each path segment)
     *
     * @param state - The child state
     * @param caseType - The case type for discriminated unions (optional)
     * @returns A scoped store with dispatch and dismiss
     */
    private createScopedStore;
}
export {};
//# sourceMappingURL=scope.d.ts.map
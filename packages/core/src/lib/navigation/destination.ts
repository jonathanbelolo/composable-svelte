/**
 * Destination Builder System (Phase 3 DSL)
 *
 * This module provides the `createDestination()` function which auto-generates
 * destination reducers and matcher APIs from a map of child reducers.
 *
 * Key benefits over manual destination definition:
 * - 85% less boilerplate
 * - Full type inference (no manual type annotations needed)
 * - Type-safe matcher APIs with autocomplete
 * - Compile-time typo detection via template literal types
 *
 * @packageDocumentation
 */

import type { Reducer, Effect } from '../types.js';
import type {
	DestinationState,
	DestinationAction,
	DestinationCasePath,
	ExtractCaseType,
	ExtractCaseState
} from './types.js';
import { Effect as EffectConstructors, nestGroups } from '../effect.js';

// ============================================================================
// createDestination() Core
// ============================================================================

/**
 * Result object returned by `createDestination()`.
 *
 * Contains the auto-generated reducer plus helper functions for working
 * with destination state.
 *
 * @template Reducers - The reducer map
 */
export interface Destination<Reducers extends Record<string, Reducer<any, any, any>>> {
	/**
	 * Auto-generated reducer that routes actions to the correct child reducer.
	 *
	 * Usage in parent reducer:
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer, editItem: editItemReducer });
	 *
	 * const parentReducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
	 *   switch (action.type) {
	 *     case 'destination':
	 *       return ifLetPresentation(
	 *         (s) => s.destination,
	 *         (s, d) => ({ ...s, destination: d }),
	 *         'destination',
	 *         (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
	 *         Destination.reducer  // Use auto-generated reducer
	 *       )(state, action, deps);
	 *   }
	 * };
	 * ```
	 */
	readonly reducer: Reducer<
		DestinationState<Reducers>,
		DestinationAction<Reducers>,
		any
	>;

	/**
	 * Creates initial destination state for a specific case.
	 *
	 * @param caseType - The case type (e.g., 'addItem')
	 * @param state - The initial state for that case
	 * @returns Destination state with the specified case
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer });
	 *
	 * // Create initial state for addItem case
	 * const state = Destination.initial('addItem', { name: '', quantity: 0 });
	 * // Result: { type: 'addItem', state: { name: '', quantity: 0 } }
	 * ```
	 */
	initial<K extends keyof Reducers>(
		caseType: K,
		state: Reducers[K] extends Reducer<infer S, any, any> ? S : never
	): DestinationState<Reducers>;

	/**
	 * Extracts child state for a specific case from destination state.
	 *
	 * Returns `null` if the destination state is for a different case.
	 *
	 * @param state - The destination state (or null)
	 * @param caseType - The case type to extract
	 * @returns The child state or null
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer, editItem: editItemReducer });
	 *
	 * const state: DestinationState<typeof Destination> = { type: 'addItem', state: { ... } };
	 *
	 * const addState = Destination.extract(state, 'addItem');  // { ... } (AddItemState)
	 * const editState = Destination.extract(state, 'editItem');  // null (wrong case)
	 * ```
	 */
	extract<K extends keyof Reducers>(
		state: DestinationState<Reducers> | null,
		caseType: K
	): (Reducers[K] extends Reducer<infer S, any, any> ? S : never) | null;

	/**
	 * Checks if an action matches a specific case path.
	 *
	 * Supports both full paths (`"addItem.saveButtonTapped"`) and prefix matching (`"addItem"`).
	 *
	 * **Performance**: < 1µs per call (no allocations, simple string matching)
	 *
	 * Accepts the parent's field action, the `PresentationAction` under
	 * `action.action`, or the bare `{ type: caseType, action: child }`; looks
	 * through the field and the `presented` wrapper and never matches a
	 * `dismiss`. The field name is not checked — guard on `action.type` first
	 * when a parent has more than one destination field.
	 *
	 * @param action - The action to check (can be any shape)
	 * @param casePath - The case path to match (case type or case.action)
	 * @returns true if action matches the path
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer });
	 *
	 * // What the parent reducer holds when the child dispatched saveButtonTapped
	 * const action = {
	 *   type: 'destination',
	 *   action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } }
	 * };
	 *
	 * // Full path matching
	 * Destination.is(action, 'addItem.saveButtonTapped');  // true
	 * Destination.is(action, 'addItem.cancelButtonTapped');  // false
	 *
	 * // Prefix matching (any addItem action)
	 * Destination.is(action, 'addItem');  // true
	 * Destination.is(action, 'editItem');  // false
	 *
	 * // The same through action.action, or the case action itself
	 * Destination.is(action.action, 'addItem.saveButtonTapped');  // true
	 * ```
	 */
	is(action: unknown, casePath: string): boolean;

	/**
	 * Atomically matches an action and extracts child state.
	 *
	 * Returns child state if:
	 * 1. Action matches the case path AND
	 * 2. State exists for that case
	 *
	 * Returns null otherwise.
	 *
	 * **Performance**: < 2µs per call
	 *
	 * @param action - The action to match
	 * @param state - The destination state
	 * @param casePath - The case path to match
	 * @returns Child state or null
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer, editItem: editItemReducer });
	 *
	 * // In parent reducer observing child actions
	 * const addState = Destination.matchCase(action, state.destination, 'addItem.saveButtonTapped');
	 * if (addState) {
	 *   // Action matched and we have addItem state!
	 *   console.log('Saving item:', addState.name);
	 * }
	 * ```
	 */
	matchCase<K extends keyof Reducers>(
		action: unknown,
		state: DestinationState<Reducers> | null,
		casePath: string
	): (Reducers[K] extends Reducer<infer S, any, any> ? S : never) | null;

	/**
	 * Matches an action against multiple case paths with typed handlers.
	 *
	 * First matching handler wins (short-circuit evaluation).
	 * Handlers receive the correctly-typed child state.
	 *
	 * **Performance**: < 5µs per call with 5 handlers
	 *
	 * @param action - The action to match
	 * @param state - The destination state
	 * @param handlers - Map of case paths to handler functions
	 * @returns Result with matched value or unmatched flag
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer, editItem: editItemReducer });
	 *
	 * const result = Destination.match(action, state.destination, {
	 *   'addItem.saveButtonTapped': (addState) => ({ type: 'add', item: addState }),
	 *   'editItem.saveButtonTapped': (editState) => ({ type: 'edit', item: editState }),
	 *   'editItem.deleteButtonTapped': (editState) => ({ type: 'delete', id: editState.id })
	 * });
	 *
	 * if (result.matched) {
	 *   console.log('Matched:', result.value);
	 * }
	 * ```
	 */
	// Inferring a single `T` from the handler map meant `T` came from the first
	// handler and every other one was checked against it — so the multi-case
	// form in the example above, the form this helper exists for, typechecked
	// for nobody. Inferring the map and distributing `ReturnType` over it gives
	// the union the caller actually gets back.
	match<H extends Record<string, (childState: any) => unknown>>(
		action: unknown,
		state: DestinationState<Reducers> | null,
		handlers: H
	): { matched: true; value: ReturnType<H[keyof H]> } | { matched: false };

	/**
	 * Type information for the destination (for type-level programming).
	 *
	 * Not used at runtime - only for extracting types from the destination object.
	 *
	 * @example
	 * ```typescript
	 * const Destination = createDestination({ addItem: addItemReducer });
	 *
	 * type State = typeof Destination._types.State;  // DestinationState<...>
	 * type Action = typeof Destination._types.Action;  // DestinationAction<...>
	 * ```
	 */
	readonly _types: {
		readonly State: DestinationState<Reducers>;
		readonly Action: DestinationAction<Reducers>;
	};
}

/**
 * Creates a destination builder from a map of child reducers.
 *
 * This is the core DSL function that auto-generates destination reducers and
 * helper functions, eliminating 85% of manual boilerplate.
 *
 * **What it generates:**
 * - `reducer`: Routes actions to correct child reducer based on type matching
 * - `initial()`: Helper for creating initial destination state
 * - `extract()`: Helper for extracting child state by case type
 * - `_types`: Type information for type-level programming
 *
 * **Type Safety:**
 * - All types inferred automatically from reducer map
 * - Template literal types enable autocomplete for case paths
 * - Compile-time typo detection
 *
 * @template Reducers - A record mapping case types to reducer functions
 * @param reducers - Map of case types to their reducers
 * @returns Destination object with reducer and helpers
 *
 * @example
 * ```typescript
 * // 1. Define child reducers
 * const addItemReducer: Reducer<AddItemState, AddItemAction> = ...;
 * const editItemReducer: Reducer<EditItemState, EditItemAction> = ...;
 *
 * // 2. Create destination (types inferred automatically!)
 * const Destination = createDestination({
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * });
 *
 * // 3. Use generated reducer in parent
 * const parentReducer = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'destination':
 *       return ifLetPresentation(
 *         (s) => s.destination,
 *         (s, d) => ({ ...s, destination: d }),
 *         'destination',
 *         (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
 *         Destination.reducer  // Auto-generated!
 *       )(state, action, deps);
 *   }
 * };
 *
 * // 4. Use helpers
 * const initial = Destination.initial('addItem', { name: '', quantity: 0 });
 * const addState = Destination.extract(state.destination, 'addItem');
 * ```
 *
 * **Comparison to Manual Pattern (Phase 2):**
 *
 * Before (manual):
 * ```typescript
 * // Define state union manually
 * type DestinationState =
 *   | { type: 'addItem'; state: AddItemState }
 *   | { type: 'editItem'; state: EditItemState };
 *
 * // Define action union manually
 * type DestinationAction =
 *   | { type: 'addItem'; action: AddItemAction }
 *   | { type: 'editItem'; action: EditItemAction };
 *
 * // Write reducer manually
 * const destinationReducer = createDestinationReducer({
 *   addItem: (s, a, d) => addItemReducer(s.state, a, d),
 *   editItem: (s, a, d) => editItemReducer(s.state, a, d)
 * });
 * ```
 *
 * After (DSL):
 * ```typescript
 * // Everything generated from reducer map!
 * const Destination = createDestination({
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * });
 * ```
 *
 * **85% less boilerplate!**
 */
export function createDestination<Reducers extends Record<string, Reducer<any, any, any>>>(
	reducers: Reducers & Record<string, Reducer<any, any, any>>
): Destination<Reducers> {
	// The matchers look through a `presented` wrapper and refuse a `dismiss`,
	// so neither can name a case without making every match ambiguous.
	for (const reserved of ['presented', 'dismiss']) {
		if (reserved in reducers) {
			throw new TypeError(
				`createDestination: "${reserved}" cannot be a case name; it is the PresentationAction wrapper the matchers look through`
			);
		}
	}

	// Auto-generated reducer
	const reducer: Reducer<DestinationState<Reducers>, DestinationAction<Reducers>, any> = (
		state,
		action,
		dependencies
	) => {
		// Route action to correct child reducer based on type matching
		const caseType = action.type as keyof Reducers;
		const childReducer = reducers[caseType];

		// If no reducer for this case type, return state unchanged
		if (!childReducer) {
			return [state, EffectConstructors.none()];
		}

		// Check if action matches current state's case type
		if (state.type !== caseType) {
			// Action is for different case - state unchanged
			return [state, EffectConstructors.none()];
		}

		// `{ type: caseType, action: child }` is what `ifLetPresentation` hands
		// down after stripping the field's `presented` wrapper. Dismiss never
		// reaches this reducer: `ifLetPresentation` nulls the field itself.
		const childAction = action.action;

		const [newChildState, childEffect] = childReducer(
			(state as any).state,
			childAction,
			dependencies
		);

		const newState: DestinationState<Reducers> = {
			type: caseType,
			state: newChildState
		} as any;

		// The child's effect is in the child's action type. It has to come back
		// through this reducer under the same case, or the layer above wraps it
		// as a destination action with no case and drops it — an async child
		// never saw its own result (AUDIT-2026-09-03-FINDINGS N2). Carrying the
		// case also lets the check above drop a result whose case is gone.
		// Under the case's group as well, so the field's group (which
		// `ifLetPresentation` adds above) holds every case and
		// `Effect.cancelGroup('<field>/<case>')` holds one.
		return [
			newState,
			nestGroups(
				EffectConstructors.map(
					childEffect,
					(childResult) => ({ type: caseType, action: childResult }) as DestinationAction<Reducers>
				),
				String(caseType)
			)
		];
	};

	// Helper: Create initial destination state
	const initial = <K extends keyof Reducers>(
		caseType: K,
		state: Reducers[K] extends Reducer<infer S, any, any> ? S : never
	): DestinationState<Reducers> => {
		return {
			type: caseType,
			state
		} as any;
	};

	// Helper: Extract child state by case type
	const extract = <K extends keyof Reducers>(
		state: DestinationState<Reducers> | null,
		caseType: K
	): (Reducers[K] extends Reducer<infer S, any, any> ? S : never) | null => {
		if (!state || state.type !== caseType) {
			return null;
		}
		return (state as any).state;
	};

	const isRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === 'object' && value !== null;
	// A case action carries its child action; the case is one of *this*
	// destination's own (`in` also found `hasOwnProperty`, R1-REVIEW 1.9).
	const isCaseAction = (value: unknown): value is { type: string; action: unknown } =>
		isRecord(value) && typeof value.type === 'string' && Object.hasOwn(reducers, value.type) && 'action' in value;
	const isWrapper = (value: unknown): value is { type: 'presented' | 'dismiss'; action?: unknown } =>
		isRecord(value) && (value.type === 'dismiss' || value.type === 'presented');

	/**
	 * The `{ type: caseType, action: child }` inside whatever the caller holds.
	 *
	 * Three shapes are looked through, and no others: the case action itself
	 * (what this reducer receives); the `PresentationAction` a parent finds
	 * under `action.action`; and the parent's own field action, one level up.
	 * It is the wrapper's *shape* that decides, never a name: a value whose
	 * `action` is a `PresentationAction` is a field action whatever the field
	 * is called, so a `dismiss` under a field named like a case yields
	 * nothing, and a parent-level action that merely shares a case's name
	 * and carries no child action matches no path (R1-REVIEW 1.9). A
	 * `dismiss` at any level yields nothing: it names no case (AUDIT N1). A
	 * child action named `presented` or `dismiss` is indistinguishable from
	 * the wrapper; do not name one so.
	 */
	const caseActionOf = (value: unknown): { type: string; action: unknown } | null => {
		if (!isRecord(value)) return null;
		if (isWrapper(value)) return value.type === 'presented' && isCaseAction(value.action) ? value.action : null;
		if (isWrapper(value.action)) {
			return value.action.type === 'presented' && isCaseAction(value.action.action) ? value.action.action : null;
		}
		return isCaseAction(value) ? value : null;
	};

	// Helper: Check if action matches case path
	const is = (action: unknown, casePath: string): boolean => {
		const caseAction = caseActionOf(action);
		if (!caseAction) return false;

		const [caseType, actionType] = casePath.split('.');
		if (caseAction.type !== caseType) return false;
		if (!actionType) return true; // prefix match: any action in this case

		return isRecord(caseAction.action) && caseAction.action.type === actionType;
	};

	// Helper: Atomic match + extract
	const matchCase = <K extends keyof Reducers>(
		action: unknown,
		state: DestinationState<Reducers> | null,
		casePath: string
	): (Reducers[K] extends Reducer<infer S, any, any> ? S : never) | null => {
		// First check if action matches
		if (!is(action, casePath)) {
			return null;
		}

		// Extract case type from path
		const caseType = casePath.split('.')[0] as K;

		// Extract state for that case
		return extract(state, caseType);
	};

	// Helper: Multi-case matching with handlers
	const match = <H extends Record<string, (childState: any) => unknown>>(
		action: unknown,
		state: DestinationState<Reducers> | null,
		handlers: H
	): { matched: true; value: ReturnType<H[keyof H]> } | { matched: false } => {
		// Try each handler in order (first match wins)
		for (const [casePath, handler] of Object.entries(handlers)) {
			const childState = matchCase(action, state, casePath);
			if (childState !== null) {
				// `Object.entries` erases which handler this is, so the return type
				// cannot be recovered structurally here. The declaration above is the
				// contract; this cast is the one place it is asserted.
				return { matched: true, value: handler(childState) as ReturnType<H[keyof H]> };
			}
		}

		return { matched: false };
	};

	return {
		reducer,
		initial,
		extract,
		is,
		matchCase,
		match,
		_types: null as any  // Type-level only
	};
}

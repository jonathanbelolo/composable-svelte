/**
 * ifLet operator for optional child state composition.
 *
 * The ifLet() function is similar to scope() but designed specifically for navigation
 * scenarios where child state may or may not exist (optional/nullable).
 *
 * Key differences from scope():
 * - Handles null child state gracefully
 * - Used for navigation (modal, drawer, sheets, etc.)
 * - Child can dismiss itself by setting state to null
 *
 * @packageDocumentation
 */
import type { Reducer } from '../types.js';
import type { StateLens, StateUpdater, ActionPrism, ActionEmbedder } from '../composition/index.js';
/**
 * Compose a child reducer that operates on optional state.
 *
 * This is the core operator for state-driven navigation. The pattern:
 * - Non-null child state → child feature is presented
 * - Null child state → child feature is dismissed
 *
 * The child reducer receives non-null state and can return null to dismiss itself.
 *
 * @param toChildState - Extract optional child state from parent state
 * @param fromChildState - Update parent with new child state (or null to dismiss)
 * @param toChildAction - Extract child action from parent action (returns null if not applicable)
 * @param fromChildAction - Wrap child action into parent action
 * @param childReducer - The child reducer to compose
 * @returns A parent reducer
 *
 * @example
 * ```typescript
 * interface ParentState {
 *   destination: AddItemState | null;
 * }
 *
 * type ParentAction =
 *   | { type: 'addButtonTapped' }
 *   | { type: 'destination'; action: PresentationAction<AddItemAction> };
 *
 * const reducer: Reducer<ParentState, ParentAction, ParentDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'addButtonTapped':
 *       return [{ ...state, destination: { item: '', quantity: 0 } }, Effect.none()];
 *
 *     case 'destination':
 *       // Handle dismiss action
 *       if (action.action.type === 'dismiss') {
 *         return [{ ...state, destination: null }, Effect.none()];
 *       }
 *
 *       // Handle child actions via ifLet
 *       return ifLet(
 *         (s) => s.destination,
 *         (s, d) => ({ ...s, destination: d }),
 *         (a) => a.type === 'destination' && a.action.type === 'presented' ? a.action.action : null,
 *         (ca) => ({ type: 'destination', action: PresentationAction.presented(ca) }),
 *         addItemReducer
 *       )(state, action, deps);
 *
 *     default:
 *       return [state, Effect.none()];
 *   }
 * };
 * ```
 */
export declare function ifLet<ParentState, ParentAction, ChildState, ChildAction, Dependencies = any>(toChildState: StateLens<ParentState, ChildState | null>, fromChildState: StateUpdater<ParentState, ChildState | null>, toChildAction: ActionPrism<ParentAction, ChildAction>, fromChildAction: ActionEmbedder<ParentAction, ChildAction>, childReducer: Reducer<ChildState, ChildAction, Dependencies>): Reducer<ParentState, ParentAction, Dependencies>;
/**
 * Helper for common case where child actions are wrapped in PresentationAction.
 *
 * This is a convenience wrapper that:
 * 1. Unwraps PresentationAction.presented to extract child action
 * 2. Wraps child effects back in PresentationAction.presented via fromChildAction
 * 3. Handles PresentationAction.dismiss by setting state to null
 *
 * @param toChildState - Extract optional child state from parent state
 * @param fromChildState - Update parent with new child state (or null to dismiss)
 * @param actionType - The parent action type string to match
 * @param fromChildAction - Wrap child action into parent action
 * @param childReducer - The child reducer to compose
 * @returns A parent reducer
 *
 * @example
 * ```typescript
 * // Instead of manually handling PresentationAction unwrapping:
 * const reducer = ifLetPresentation(
 *   (s) => s.destination,
 *   (s, d) => ({ ...s, destination: d }),
 *   'destination',
 *   (ca) => ({ type: 'destination', action: { type: 'presented', action: ca } }),
 *   addItemReducer
 * );
 *
 * // Equivalent to:
 * ifLet(
 *   (s) => s.destination,
 *   (s, d) => ({ ...s, destination: d }),
 *   (a) => a.type === 'destination' && a.action.type === 'presented' ? a.action.action : null,
 *   (ca) => ({ type: 'destination', action: PresentationAction.presented(ca) }),
 *   addItemReducer
 * )
 * ```
 */
export declare function ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, ActionType extends string, Dependencies = any>(toChildState: StateLens<ParentState, ChildState | null>, fromChildState: StateUpdater<ParentState, ChildState | null>, actionType: ActionType, fromChildAction: (action: ChildAction) => ParentAction, childReducer: Reducer<ChildState, ChildAction, Dependencies>): Reducer<ParentState, ParentAction, Dependencies>;
//# sourceMappingURL=if-let.d.ts.map
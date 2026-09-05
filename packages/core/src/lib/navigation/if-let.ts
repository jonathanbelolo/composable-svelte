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

import { Effect, nestGroups } from '../effect.js';
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
export function ifLet<ParentState, ParentAction, ChildState, ChildAction, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState | null>,
  fromChildState: StateUpdater<ParentState, ChildState | null>,
  toChildAction: ActionPrism<ParentAction, ChildAction>,
  fromChildAction: ActionEmbedder<ParentAction, ChildAction>,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies> {
  return (parentState, parentAction, dependencies) => {
    // Try to extract child action from parent action
    const childAction = toChildAction(parentAction);

    // Parent action doesn't apply to child
    if (childAction === null) {
      return [parentState, Effect.none()];
    }

    // Extract child state from parent state
    const childState = toChildState(parentState);

    // Child state is null → feature not presented → no-op
    if (childState === null) {
      return [parentState, Effect.none()];
    }

    // Run child reducer with non-null state
    const [newChildState, childEffect] = childReducer(childState, childAction, dependencies);

    // Update parent state with new child state (may be null for dismissal)
    const newParentState = fromChildState(parentState, newChildState);

    // Map child effects to parent actions
    const parentEffect = Effect.map(childEffect, fromChildAction);

    return [newParentState, parentEffect];
  };
}

/**
 * Helper for common case where child actions are wrapped in PresentationAction.
 *
 * This is a convenience wrapper that:
 * 1. Unwraps PresentationAction.presented to extract child action
 * 2. Wraps child effects back in PresentationAction.presented via fromChildAction
 * 3. Handles PresentationAction.dismiss by setting state to null
 * 4. Owns the presentation's cancellation group, named `actionType`: every
 *    effect the child produces belongs to it (the child's own groups nested
 *    beneath it), and a dismiss — or a child that returns null — cancels it,
 *    so an in-flight effect cannot land after the child is gone and a
 *    reopened child does not receive the previous one's result. A parent
 *    that nulls the field or changes its case itself goes through
 *    `integrate().with()`, which cancels the group for it, or returns
 *    `Effect.cancelGroup(actionType)` alongside (AUDIT N8; R1-REVIEW 1.8).
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
export function ifLetPresentation<
  ParentState,
  ParentAction,
  ChildState,
  ChildAction,
  ActionType extends string,
  Dependencies = any
>(
  toChildState: StateLens<ParentState, ChildState | null>,
  fromChildState: StateUpdater<ParentState, ChildState | null>,
  actionType: ActionType,
  fromChildAction: (action: ChildAction) => ParentAction,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies> {
  return (parentState, parentAction: ParentAction, dependencies) => {
    const action = parentAction as any;

    // Check if action matches our type and has the presentation wrapper
    if (
      action.type !== actionType ||
      !('action' in action) ||
      typeof action.action !== 'object' ||
      action.action === null ||
      !('type' in action.action)
    ) {
      return [parentState, Effect.none()];
    }

    const presentationAction = action.action as { type: string; action?: unknown };

    // Handle dismiss action: the field is nulled and the presentation's
    // effects cancelled.
    if (presentationAction.type === 'dismiss') {
      return [fromChildState(parentState, null), Effect.cancelGroup(actionType)];
    }

    // Handle presented action
    if (presentationAction.type === 'presented' && 'action' in presentationAction) {
      const childAction = presentationAction.action as ChildAction;
      const childState = toChildState(parentState);

      // Child state is null → feature not presented → no-op
      if (childState === null) {
        return [parentState, Effect.none()];
      }

      // Run child reducer
      const [newChildState, childEffect] = childReducer(childState, childAction, dependencies);

      // Update parent state
      const newParentState = fromChildState(parentState, newChildState);

      // Map child effects to parent actions, under the presentation's group.
      const parentEffect = nestGroups(Effect.map(childEffect, fromChildAction), actionType);

      // A child that dismissed itself: its effects — this action's included,
      // as TCA's ifLet does — are cancelled after they are registered.
      if (newChildState === null) {
        return [newParentState, Effect.batch(parentEffect, Effect.cancelGroup(actionType))];
      }

      return [newParentState, parentEffect];
    }

    // Unknown presentation action type
    return [parentState, Effect.none()];
  };
}

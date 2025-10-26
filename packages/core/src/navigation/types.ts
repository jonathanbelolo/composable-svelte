/**
 * Navigation Types
 *
 * This module defines the core types for state-driven navigation in composable-svelte.
 *
 * Key concepts:
 * - PresentationAction: Wraps child actions with present/dismiss lifecycle
 * - StackAction: Manages navigation stack operations (push/pop/setPath)
 *
 * @packageDocumentation
 */

// ============================================================================
// PresentationAction
// ============================================================================

/**
 * Action type for managing the presentation lifecycle of child features.
 *
 * Parent features observe their child's presentation state through this action wrapper:
 * - `{ type: 'presented', action: ChildAction }` - Child feature dispatched an action
 * - `{ type: 'dismiss' }` - Child requested dismissal (via deps.dismiss())
 *
 * Usage in parent reducer:
 * ```typescript
 * type ParentAction =
 *   | { type: 'addButtonTapped' }
 *   | { type: 'destination'; action: PresentationAction<AddItemAction> };
 *
 * const reducer: Reducer<ParentState, ParentAction, ParentDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'addButtonTapped':
 *       return [{ ...state, destination: { type: 'addItem', state: initialAddItemState } }, Effect.none()];
 *
 *     case 'destination':
 *       if (action.action.type === 'dismiss') {
 *         return [{ ...state, destination: null }, Effect.none()];
 *       }
 *       // Handle child's 'presented' actions via ifLet() operator
 *       return ifLet(...)(state, action, deps);
 *   }
 * };
 * ```
 *
 * @template T - The child action type
 */
export type PresentationAction<T> =
  | { readonly type: 'presented'; readonly action: T }
  | { readonly type: 'dismiss' };

/**
 * Helper namespace for creating PresentationAction instances.
 *
 * @example
 * ```typescript
 * // Child action wrapped for parent
 * const action = PresentationAction.presented({ type: 'saveButtonTapped' });
 *
 * // Child requests dismissal
 * const dismissAction = PresentationAction.dismiss();
 * ```
 */
export const PresentationAction = {
  /**
   * Wraps a child action for presentation to the parent.
   *
   * @template T - The child action type
   * @param action - The child action to wrap
   * @returns A presented action
   */
  presented: <T>(action: T): PresentationAction<T> => ({
    type: 'presented' as const,
    action
  }),

  /**
   * Creates a dismiss action for the child to request dismissal.
   *
   * @template T - The child action type
   * @returns A dismiss action
   */
  dismiss: <T>(): PresentationAction<T> => ({
    type: 'dismiss' as const
  })
} as const;

// ============================================================================
// StackAction
// ============================================================================

/**
 * Action type for managing navigation stacks.
 *
 * Navigation stacks support multi-screen flows (e.g., wizard, drill-down).
 * The stack contains an array of states representing the screen hierarchy.
 *
 * Stack operations:
 * - `push`: Add a new screen to the stack
 * - `pop`: Remove the top screen (go back)
 * - `popToRoot`: Clear all screens except the root
 * - `setPath`: Replace the entire stack path
 *
 * Usage in reducer:
 * ```typescript
 * type WizardAction =
 *   | { type: 'nextButtonTapped' }
 *   | { type: 'backButtonTapped' }
 *   | { type: 'stack'; action: StackAction<ScreenAction> };
 *
 * const reducer: Reducer<WizardState, WizardAction, WizardDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'nextButtonTapped':
 *       return push(state.stack, nextScreen);  // Uses stack helper
 *
 *     case 'backButtonTapped':
 *       return pop(state.stack);  // Uses stack helper
 *
 *     case 'stack':
 *       return handleStackAction(state, action, deps, screenReducer);
 *   }
 * };
 * ```
 *
 * @template T - The screen action type
 */
export type StackAction<T> =
  | { readonly type: 'push'; readonly state: unknown }
  | { readonly type: 'pop' }
  | { readonly type: 'popToRoot' }
  | { readonly type: 'setPath'; readonly path: readonly unknown[] }
  | { readonly type: 'screen'; readonly index: number; readonly action: PresentationAction<T> };

/**
 * Helper namespace for creating StackAction instances.
 *
 * @example
 * ```typescript
 * // Push a new screen
 * const pushAction = StackAction.push(newScreenState);
 *
 * // Go back one screen
 * const popAction = StackAction.pop();
 *
 * // Reset to root screen
 * const popToRootAction = StackAction.popToRoot();
 *
 * // Replace entire path
 * const setPathAction = StackAction.setPath([screen1, screen2, screen3]);
 *
 * // Screen at index dispatched action
 * const screenAction = StackAction.screen(0, PresentationAction.presented(childAction));
 * ```
 */
export const StackAction = {
  /**
   * Pushes a new screen onto the stack.
   *
   * @template T - The screen action type
   * @param state - The initial state for the new screen
   * @returns A push action
   */
  push: <T>(state: unknown): StackAction<T> => ({
    type: 'push' as const,
    state
  }),

  /**
   * Pops the top screen from the stack (go back).
   *
   * @template T - The screen action type
   * @returns A pop action
   */
  pop: <T>(): StackAction<T> => ({
    type: 'pop' as const
  }),

  /**
   * Pops all screens except the root.
   *
   * @template T - The screen action type
   * @returns A popToRoot action
   */
  popToRoot: <T>(): StackAction<T> => ({
    type: 'popToRoot' as const
  }),

  /**
   * Replaces the entire stack with a new path.
   *
   * @template T - The screen action type
   * @param path - The new stack path (array of screen states)
   * @returns A setPath action
   */
  setPath: <T>(path: readonly unknown[]): StackAction<T> => ({
    type: 'setPath' as const,
    path
  }),

  /**
   * Action from a specific screen in the stack.
   *
   * @template T - The screen action type
   * @param index - The index of the screen in the stack
   * @param action - The presentation action from the screen
   * @returns A screen action
   */
  screen: <T>(index: number, action: PresentationAction<T>): StackAction<T> => ({
    type: 'screen' as const,
    index,
    action
  })
} as const;

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export for convenience
 */
export type { PresentationAction as Presentation, StackAction as Stack };

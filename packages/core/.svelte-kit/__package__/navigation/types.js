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
    presented: (action) => ({
        type: 'presented',
        action
    }),
    /**
     * Creates a dismiss action for the child to request dismissal.
     *
     * @template T - The child action type
     * @returns A dismiss action
     */
    dismiss: () => ({
        type: 'dismiss'
    })
};
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
    push: (state) => ({
        type: 'push',
        state
    }),
    /**
     * Pops the top screen from the stack (go back).
     *
     * @template T - The screen action type
     * @returns A pop action
     */
    pop: () => ({
        type: 'pop'
    }),
    /**
     * Pops all screens except the root.
     *
     * @template T - The screen action type
     * @returns A popToRoot action
     */
    popToRoot: () => ({
        type: 'popToRoot'
    }),
    /**
     * Replaces the entire stack with a new path.
     *
     * @template T - The screen action type
     * @param path - The new stack path (array of screen states)
     * @returns A setPath action
     */
    setPath: (path) => ({
        type: 'setPath',
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
    screen: (index, action) => ({
        type: 'screen',
        index,
        action
    })
};

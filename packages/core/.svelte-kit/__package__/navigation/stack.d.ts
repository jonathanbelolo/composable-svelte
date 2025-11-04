/**
 * Stack Navigation Utilities
 *
 * Helpers for managing navigation stacks (multi-screen linear flows).
 *
 * Key concepts:
 * - Stack: Array of screen states representing the navigation hierarchy
 * - Push/Pop: Add or remove screens
 * - handleStackAction: Reducer helper for processing stack actions
 *
 * Use cases: Wizard flows, drill-down navigation, multi-step forms
 *
 * @packageDocumentation
 */
import type { Reducer, Effect as EffectType } from '../types.js';
import type { StackAction } from './types.js';
/**
 * Result of a stack operation.
 *
 * @template ScreenState - The type of state for each screen in the stack
 * @template Action - The action type
 */
export type StackResult<ScreenState, Action> = readonly [
    readonly ScreenState[],
    EffectType<Action>
];
/**
 * Push a new screen onto the stack.
 *
 * @param stack - The current stack
 * @param screenState - The initial state for the new screen
 * @returns Updated stack and effect
 *
 * @example
 * ```typescript
 * case 'nextButtonTapped': {
 *   const nextScreen = { step: state.stack.length + 1, data: {} };
 *   return push(state.stack, nextScreen);
 * }
 * ```
 */
export declare function push<ScreenState, Action>(stack: readonly ScreenState[], screenState: ScreenState): StackResult<ScreenState, Action>;
/**
 * Pop the top screen from the stack (go back one screen).
 *
 * If the stack only has one screen (root), returns unchanged stack.
 *
 * @param stack - The current stack
 * @returns Updated stack and effect
 *
 * @example
 * ```typescript
 * case 'backButtonTapped': {
 *   return pop(state.stack);
 * }
 * ```
 */
export declare function pop<ScreenState, Action>(stack: readonly ScreenState[]): StackResult<ScreenState, Action>;
/**
 * Pop all screens except the root (return to start).
 *
 * @param stack - The current stack
 * @returns Updated stack and effect
 *
 * @example
 * ```typescript
 * case 'cancelButtonTapped': {
 *   return popToRoot(state.stack);
 * }
 * ```
 */
export declare function popToRoot<ScreenState, Action>(stack: readonly ScreenState[]): StackResult<ScreenState, Action>;
/**
 * Replace the entire stack with a new path.
 *
 * @param path - The new stack path
 * @returns Updated stack and effect
 *
 * @example
 * ```typescript
 * case 'resetToStepTwo': {
 *   return setPath([step1State, step2State]);
 * }
 * ```
 */
export declare function setPath<ScreenState, Action>(path: readonly ScreenState[]): StackResult<ScreenState, Action>;
/**
 * Handle StackAction in a reducer.
 *
 * This helper processes StackAction operations (push, pop, setPath, screen actions)
 * and delegates screen-specific actions to a screen reducer.
 *
 * @param state - The parent state containing the stack
 * @param action - The stack action to handle
 * @param deps - Dependencies for the screen reducer
 * @param screenReducer - Reducer for individual screens
 * @param getStack - Extract stack from parent state
 * @param setStack - Update parent state with new stack
 * @returns Updated parent state and effect
 *
 * @example
 * ```typescript
 * interface WizardState {
 *   stack: readonly StepState[];
 * }
 *
 * type WizardAction =
 *   | { type: 'nextButtonTapped' }
 *   | { type: 'stack'; action: StackAction<StepAction> };
 *
 * const reducer: Reducer<WizardState, WizardAction, WizardDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'nextButtonTapped':
 *       const [newStack] = push(state.stack, initialStepState);
 *       return [{ ...state, stack: newStack }, Effect.none()];
 *
 *     case 'stack':
 *       return handleStackAction(
 *         state,
 *         action.action,
 *         deps,
 *         stepReducer,
 *         (s) => s.stack,
 *         (s, stack) => ({ ...s, stack })
 *       );
 *
 *     default:
 *       return [state, Effect.none()];
 *   }
 * };
 * ```
 */
export declare function handleStackAction<ParentState, ParentAction, ScreenState, ScreenAction, Dependencies>(state: ParentState, action: StackAction<ScreenAction>, deps: Dependencies, screenReducer: Reducer<ScreenState, ScreenAction, Dependencies>, getStack: (state: ParentState) => readonly ScreenState[], setStack: (state: ParentState, stack: readonly ScreenState[]) => ParentState): readonly [ParentState, EffectType<ParentAction>];
/**
 * Get the top (current) screen state from the stack.
 *
 * @param stack - The stack
 * @returns The top screen state, or null if stack is empty
 *
 * @example
 * ```typescript
 * const currentScreen = topScreen(state.stack);
 * if (currentScreen) {
 *   console.log('Current step:', currentScreen.step);
 * }
 * ```
 */
export declare function topScreen<ScreenState>(stack: readonly ScreenState[]): ScreenState | null;
/**
 * Get the root (first) screen state from the stack.
 *
 * @param stack - The stack
 * @returns The root screen state, or null if stack is empty
 */
export declare function rootScreen<ScreenState>(stack: readonly ScreenState[]): ScreenState | null;
/**
 * Check if the stack can go back (has more than one screen).
 *
 * @param stack - The stack
 * @returns True if pop() would remove a screen
 */
export declare function canGoBack(stack: readonly unknown[]): boolean;
/**
 * Get the stack depth (number of screens).
 *
 * @param stack - The stack
 * @returns The number of screens in the stack
 */
export declare function stackDepth(stack: readonly unknown[]): number;
//# sourceMappingURL=stack.d.ts.map
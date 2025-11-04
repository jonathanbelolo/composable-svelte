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

import { Effect } from '../effect.js';
import type { Reducer, Effect as EffectType } from '../types.js';
import type { StackAction, PresentationAction } from './types.js';

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
export function push<ScreenState, Action>(
  stack: readonly ScreenState[],
  screenState: ScreenState
): StackResult<ScreenState, Action> {
  return [[...stack, screenState], Effect.none()];
}

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
export function pop<ScreenState, Action>(
  stack: readonly ScreenState[]
): StackResult<ScreenState, Action> {
  if (stack.length <= 1) {
    // At root, can't pop further
    return [stack, Effect.none()];
  }

  return [stack.slice(0, -1), Effect.none()];
}

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
export function popToRoot<ScreenState, Action>(
  stack: readonly ScreenState[]
): StackResult<ScreenState, Action> {
  if (stack.length === 0) {
    return [stack, Effect.none()];
  }

  return [[stack[0]!], Effect.none()];
}

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
export function setPath<ScreenState, Action>(
  path: readonly ScreenState[]
): StackResult<ScreenState, Action> {
  return [path, Effect.none()];
}

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
export function handleStackAction<
  ParentState,
  ParentAction,
  ScreenState,
  ScreenAction,
  Dependencies
>(
  state: ParentState,
  action: StackAction<ScreenAction>,
  deps: Dependencies,
  screenReducer: Reducer<ScreenState, ScreenAction, Dependencies>,
  getStack: (state: ParentState) => readonly ScreenState[],
  setStack: (state: ParentState, stack: readonly ScreenState[]) => ParentState
): readonly [ParentState, EffectType<ParentAction>] {
  const stack = getStack(state);

  switch (action.type) {
    case 'push': {
      const [newStack, effect] = push<ScreenState, ParentAction>(
        stack,
        action.state as ScreenState
      );
      return [setStack(state, newStack), effect];
    }

    case 'pop': {
      const [newStack, effect] = pop<ScreenState, ParentAction>(stack);
      return [setStack(state, newStack), effect];
    }

    case 'popToRoot': {
      const [newStack, effect] = popToRoot<ScreenState, ParentAction>(stack);
      return [setStack(state, newStack), effect];
    }

    case 'setPath': {
      const [newStack, effect] = setPath<ScreenState, ParentAction>(
        action.path as readonly ScreenState[]
      );
      return [setStack(state, newStack), effect];
    }

    case 'screen': {
      const { index, action: presentationAction } = action;

      // Validate index
      if (index < 0 || index >= stack.length) {
        console.warn(
          `[Composable Svelte] Invalid stack index: ${index} (stack length: ${stack.length})`
        );
        return [state, Effect.none()];
      }

      // Handle dismiss action
      if (presentationAction.type === 'dismiss') {
        // Dismissing a screen pops it and all screens above it
        const [newStack, effect] = setPath<ScreenState, ParentAction>(
          stack.slice(0, index)
        );
        return [setStack(state, newStack), effect];
      }

      // Handle presented action
      if (presentationAction.type === 'presented') {
        const screenState = stack[index]!;
        const screenAction = presentationAction.action;

        // Run screen reducer
        const [newScreenState, screenEffect] = screenReducer(
          screenState,
          screenAction,
          deps
        );

        // Update stack with new screen state
        const newStack = [
          ...stack.slice(0, index),
          newScreenState,
          ...stack.slice(index + 1)
        ];

        // Map screen effects to parent actions
        const parentEffect = Effect.map(screenEffect, (sa) => ({
          type: 'stack',
          action: {
            type: 'screen' as const,
            index,
            action: { type: 'presented' as const, action: sa }
          }
        } as ParentAction));

        return [setStack(state, newStack), parentEffect];
      }

      // Unknown presentation action type
      return [state, Effect.none()];
    }

    default: {
      const _exhaustive: never = action;
      console.warn(
        `[Composable Svelte] Unhandled stack action: ${(_exhaustive as any).type}`
      );
      return [state, Effect.none()];
    }
  }
}

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
export function topScreen<ScreenState>(
  stack: readonly ScreenState[]
): ScreenState | null {
  return stack.length > 0 ? stack[stack.length - 1]! : null;
}

/**
 * Get the root (first) screen state from the stack.
 *
 * @param stack - The stack
 * @returns The root screen state, or null if stack is empty
 */
export function rootScreen<ScreenState>(
  stack: readonly ScreenState[]
): ScreenState | null {
  return stack.length > 0 ? stack[0]! : null;
}

/**
 * Check if the stack can go back (has more than one screen).
 *
 * @param stack - The stack
 * @returns True if pop() would remove a screen
 */
export function canGoBack(stack: readonly unknown[]): boolean {
  return stack.length > 1;
}

/**
 * Get the stack depth (number of screens).
 *
 * @param stack - The stack
 * @returns The number of screens in the stack
 */
export function stackDepth(stack: readonly unknown[]): number {
  return stack.length;
}

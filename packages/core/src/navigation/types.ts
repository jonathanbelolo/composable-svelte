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
// Destination Types (Phase 3 DSL)
// ============================================================================

/**
 * Extract state union from a map of reducers.
 *
 * Given a reducer map like `{ addItem: addItemReducer, editItem: editItemReducer }`,
 * this type generates a discriminated union:
 * ```typescript
 * | { type: 'addItem'; state: AddItemState }
 * | { type: 'editItem'; state: EditItemState }
 * ```
 *
 * This enables type-safe destination state handling with full inference.
 *
 * @template Reducers - A record mapping case types to reducer functions
 *
 * @example
 * ```typescript
 * const reducers = {
 *   addItem: addItemReducer,  // Reducer<AddItemState, AddItemAction>
 *   editItem: editItemReducer  // Reducer<EditItemState, EditItemAction>
 * };
 *
 * type State = DestinationState<typeof reducers>;
 * // Result: { type: 'addItem'; state: AddItemState } | { type: 'editItem'; state: EditItemState }
 * ```
 */
export type DestinationState<Reducers extends Record<string, (s: any, a: any, d: any) => any>> = {
  [K in keyof Reducers]: {
    readonly type: K;
    readonly state: Reducers[K] extends (s: infer S, a: any, d: any) => any ? S : never;
  };
}[keyof Reducers];

/**
 * Extract action union from a map of reducers.
 *
 * Given a reducer map like `{ addItem: addItemReducer, editItem: editItemReducer }`,
 * this type generates a discriminated union:
 * ```typescript
 * | { type: 'addItem'; action: PresentationAction<AddItemAction> }
 * | { type: 'editItem'; action: PresentationAction<EditItemAction> }
 * ```
 *
 * Actions are wrapped in PresentationAction to enable parent observation.
 *
 * @template Reducers - A record mapping case types to reducer functions
 *
 * @example
 * ```typescript
 * const reducers = {
 *   addItem: addItemReducer,
 *   editItem: editItemReducer
 * };
 *
 * type Action = DestinationAction<typeof reducers>;
 * // Result: { type: 'addItem'; action: PresentationAction<AddItemAction> } | ...
 * ```
 */
export type DestinationAction<Reducers extends Record<string, (s: any, a: any, d: any) => any>> = {
  [K in keyof Reducers]: {
    readonly type: K;
    readonly action: PresentationAction<Reducers[K] extends (s: any, a: infer A, d: any) => any ? A : never>;
  };
}[keyof Reducers];

/**
 * Extract all valid case paths from a destination state union.
 *
 * Case paths are template literal strings in the format `"caseType.actionType"`.
 * These enable type-safe action matching with autocomplete and compile-time validation.
 *
 * Given destination state with cases `addItem` and `editItem`, where:
 * - AddItemAction = `{ type: 'saveButtonTapped' } | { type: 'cancelButtonTapped' }`
 * - EditItemAction = `{ type: 'saveButtonTapped' } | { type: 'deleteButtonTapped' }`
 *
 * This generates the union:
 * ```typescript
 * | "addItem.saveButtonTapped"
 * | "addItem.cancelButtonTapped"
 * | "editItem.saveButtonTapped"
 * | "editItem.deleteButtonTapped"
 * | "addItem"   // Prefix matching (any addItem action)
 * | "editItem"  // Prefix matching (any editItem action)
 * ```
 *
 * @template State - The destination state union
 *
 * @example
 * ```typescript
 * type State = { type: 'addItem'; state: AddItemState } | { type: 'editItem'; state: EditItemState };
 * type Paths = DestinationCasePath<State>;
 *
 * // IDE provides autocomplete:
 * const path: Paths = 'addItem.saveButtonTapped';  // ✓ Valid
 * const invalid: Paths = 'addItem.saveButonTapped';  // ✗ Type error (typo detected!)
 * ```
 */
export type DestinationCasePath<State extends { type: string }> =
  | Extract<State, { type: string }>['type']  // Prefix matching: just the case type
  | (State extends { type: infer CaseType extends string }
      ? CaseType extends any
        ? Extract<State, { type: CaseType }> extends { state: infer S }
          ? S extends { _actions: infer Actions }
            ? Actions extends { type: infer ActionType extends string }
              ? `${CaseType}.${ActionType}`
              : never
            : never
          : never
        : never
      : never);

/**
 * Extract the case type from a case path string.
 *
 * Given a path like `"addItem.saveButtonTapped"`, extracts `"addItem"`.
 * Given a prefix path like `"addItem"`, returns `"addItem"`.
 *
 * @template Path - The case path string
 *
 * @example
 * ```typescript
 * type Case1 = ExtractCaseType<"addItem.saveButtonTapped">;  // "addItem"
 * type Case2 = ExtractCaseType<"editItem">;  // "editItem"
 * ```
 */
export type ExtractCaseType<Path extends string> = Path extends `${infer Case}.${string}`
  ? Case
  : Path;

/**
 * Extract the action type from a case path string.
 *
 * Given a path like `"addItem.saveButtonTapped"`, extracts `"saveButtonTapped"`.
 * Given a prefix path like `"addItem"`, returns `never` (no specific action).
 *
 * @template Path - The case path string
 *
 * @example
 * ```typescript
 * type Action1 = ExtractActionType<"addItem.saveButtonTapped">;  // "saveButtonTapped"
 * type Action2 = ExtractActionType<"addItem">;  // never (prefix matching)
 * ```
 */
export type ExtractActionType<Path extends string> = Path extends `${string}.${infer Action}`
  ? Action
  : never;

/**
 * Extract the child state type for a specific case from a destination union.
 *
 * @template State - The destination state union
 * @template CaseType - The case type to extract
 *
 * @example
 * ```typescript
 * type State = { type: 'addItem'; state: AddItemState } | { type: 'editItem'; state: EditItemState };
 * type AddState = ExtractCaseState<State, 'addItem'>;  // AddItemState
 * ```
 */
export type ExtractCaseState<State extends { type: string; state: any }, CaseType extends string> = Extract<
  State,
  { type: CaseType }
> extends { state: infer S }
  ? S
  : never;

// ============================================================================
// Animation Types (Phase 4)
// ============================================================================

/**
 * Presentation lifecycle state for animated presentations.
 *
 * Tracks the animation lifecycle of a destination through four states:
 * - `idle`: Nothing is being presented
 * - `presenting`: Animation in progress (animating IN)
 * - `presented`: Animation complete, content fully visible
 * - `dismissing`: Animation in progress (animating OUT)
 *
 * **Key Design Decision**: Separate `destination` and `presentation` fields.
 * - `destination`: The WHAT (logical destination data)
 * - `presentation`: The HOW (animation lifecycle)
 * - During dismissal, `destination` remains non-null (so UI can animate out)
 * - Both are cleared atomically when dismissal completes
 *
 * @template T - The content type being presented (usually DestinationState)
 *
 * @example
 * ```typescript
 * interface FeatureState {
 *   destination: DestinationState | null;  // From navigation-spec.md
 *   presentation: PresentationState<DestinationState>;  // Animation lifecycle
 * }
 *
 * // Lifecycle:
 * // 1. User taps button → destination set, presentation: { status: 'presenting', content }
 * // 2. Animation completes → presentation: { status: 'presented', content }
 * // 3. User dismisses → destination still set, presentation: { status: 'dismissing', content }
 * // 4. Dismissal completes → destination: null, presentation: { status: 'idle' }
 * ```
 */
export type PresentationState<T> =
	| { readonly status: 'idle' }
	| { readonly status: 'presenting'; readonly content: T; readonly duration?: number }
	| { readonly status: 'presented'; readonly content: T }
	| { readonly status: 'dismissing'; readonly content: T; readonly duration?: number };

/**
 * Events for presentation lifecycle transitions.
 *
 * These events are dispatched by animation components to signal lifecycle changes:
 * - `presentationStarted`: Animation-in started (optional, for coordination)
 * - `presentationCompleted`: Animation-in finished → transition from 'presenting' to 'presented'
 * - `dismissalStarted`: Animation-out started (optional, for coordination)
 * - `dismissalCompleted`: Animation-out finished → transition from 'dismissing' to 'idle'
 * - `presentationTimeout`: Animation-in exceeded timeout → force completion
 * - `dismissalTimeout`: Animation-out exceeded timeout → force cleanup
 *
 * Components dispatch these events via Motion One animation completion handlers.
 * Timeout events are dispatched by Effect.animated() fallbacks to prevent stuck states.
 *
 * @example
 * ```typescript
 * // In reducer
 * type FeatureAction =
 *   | { type: 'addButtonTapped' }
 *   | { type: 'closeButtonTapped' }
 *   | { type: 'presentation'; event: PresentationEvent };
 *
 * case 'presentation': {
 *   if (action.event.type === 'presentationCompleted' ||
 *       action.event.type === 'presentationTimeout') {
 *     // Transition from 'presenting' → 'presented'
 *     if (state.presentation.status !== 'presenting') {
 *       return [state, Effect.none()];
 *     }
 *
 *     if (action.event.type === 'presentationTimeout') {
 *       console.warn('[Animation] Presentation timeout - forcing completion');
 *     }
 *
 *     return [
 *       { ...state, presentation: { status: 'presented', content: state.presentation.content } },
 *       Effect.none()
 *     ];
 *   }
 *
 *   if (action.event.type === 'dismissalCompleted' ||
 *       action.event.type === 'dismissalTimeout') {
 *     // Transition from 'dismissing' → 'idle' (clear destination too)
 *     if (state.presentation.status !== 'dismissing') {
 *       return [state, Effect.none()];
 *     }
 *
 *     if (action.event.type === 'dismissalTimeout') {
 *       console.warn('[Animation] Dismissal timeout - forcing cleanup');
 *     }
 *
 *     return [
 *       { ...state, destination: null, presentation: { status: 'idle' } },
 *       Effect.none()
 *     ];
 *   }
 * }
 * ```
 */
export type PresentationEvent =
	| { readonly type: 'presentationStarted' }
	| { readonly type: 'presentationCompleted' }
	| { readonly type: 'dismissalStarted' }
	| { readonly type: 'dismissalCompleted' }
	| { readonly type: 'presentationTimeout' }
	| { readonly type: 'dismissalTimeout' };

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Re-export for convenience
 */
export type { PresentationAction as Presentation, StackAction as Stack };

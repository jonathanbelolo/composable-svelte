/**
 * Dismiss Dependency
 *
 * Allows child features to dismiss themselves without knowing about their parent.
 *
 * The dismiss dependency is injected into child reducers, enabling them to request
 * dismissal by calling deps.dismiss(). The parent receives a PresentationAction.dismiss
 * and can handle it (typically by setting child state to null).
 *
 * This inverts the control: children don't know they're being presented,
 * they just know they can request dismissal.
 *
 * @packageDocumentation
 */
import type { Dispatch, Effect as EffectType } from '../types.js';
import type { PresentationAction } from './types.js';
/**
 * Dependency interface for child features that can be dismissed.
 *
 * @example
 * ```typescript
 * interface AddItemDeps {
 *   dismiss: DismissDependency;
 *   api: ApiClient;
 * }
 *
 * const addItemReducer: Reducer<AddItemState, AddItemAction, AddItemDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'cancelButtonTapped':
 *       // Request dismissal
 *       return [state, deps.dismiss()];
 *
 *     case 'saveButtonTapped':
 *       // Save and dismiss
 *       return [
 *         state,
 *         Effect.batch(
 *           Effect.run((d) => deps.api.saveItem(state.item)),
 *           deps.dismiss()
 *         )
 *       ];
 *   }
 * };
 * ```
 */
export type DismissDependency = {
    /**
     * Request dismissal of the current feature.
     *
     * Returns an Effect that, when executed, dispatches PresentationAction.dismiss
     * to the parent.
     *
     * @returns Effect that dismisses the feature
     */
    (): EffectType<any>;
};
/**
 * Create a dismiss dependency for a child feature.
 *
 * This factory creates a dismiss function that dispatches PresentationAction.dismiss
 * wrapped in the parent's action structure.
 *
 * @param dispatch - The parent's dispatch function
 * @param actionWrapper - Function to wrap PresentationAction in parent action
 * @returns A dismiss dependency
 *
 * @example
 * ```typescript
 * // In parent reducer, when presenting child:
 * case 'addButtonTapped': {
 *   const childDeps: AddItemDeps = {
 *     ...deps,
 *     dismiss: createDismissDependency(
 *       dispatch,
 *       (pa) => ({ type: 'destination', action: pa })
 *     )
 *   };
 *
 *   // Present child with dismiss capability
 *   return [
 *     { ...state, destination: { type: 'addItem', state: initialState } },
 *     Effect.none()
 *   ];
 * }
 * ```
 */
export declare function createDismissDependency<ParentAction>(dispatch: Dispatch<ParentAction>, actionWrapper: (action: PresentationAction<any>) => ParentAction): DismissDependency;
/**
 * Create a dismiss dependency that also executes cleanup effects before dismissing.
 *
 * Use this when the child needs to perform cleanup (save state, analytics, etc.)
 * before dismissal.
 *
 * @param dispatch - The parent's dispatch function
 * @param actionWrapper - Function to wrap PresentationAction in parent action
 * @param cleanup - Optional cleanup function to run before dismissing
 * @returns A dismiss dependency with cleanup
 *
 * @example
 * ```typescript
 * const dismiss = createDismissDependencyWithCleanup(
 *   dispatch,
 *   (pa) => ({ type: 'destination', action: pa }),
 *   async () => {
 *     // Track analytics
 *     await analytics.track('modal_dismissed');
 *   }
 * );
 * ```
 */
export declare function createDismissDependencyWithCleanup<ParentAction>(dispatch: Dispatch<ParentAction>, actionWrapper: (action: PresentationAction<any>) => ParentAction, cleanup?: () => void | Promise<void>): DismissDependency;
/**
 * Convenience helper for creating dismiss dependency with common action patterns.
 *
 * This assumes the parent action has a structure like:
 * `{ type: actionField, action: PresentationAction<ChildAction> }`
 *
 * @param dispatch - The parent's dispatch function
 * @param actionField - The parent action field name (e.g., 'destination')
 * @returns A dismiss dependency
 *
 * @example
 * ```typescript
 * // Simpler API for common case:
 * const childDeps = {
 *   ...deps,
 *   dismiss: dismissDependency(dispatch, 'destination')
 * };
 *
 * // Equivalent to:
 * createDismissDependency(
 *   dispatch,
 *   (pa) => ({ type: 'destination', action: pa })
 * )
 * ```
 */
export declare function dismissDependency<ParentAction>(dispatch: Dispatch<ParentAction>, actionField: string): DismissDependency;
//# sourceMappingURL=dismiss-dependency.d.ts.map
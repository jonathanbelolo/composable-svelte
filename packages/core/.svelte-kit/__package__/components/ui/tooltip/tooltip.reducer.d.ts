/**
 * Tooltip Reducer
 *
 * State management for tooltip with animation lifecycle.
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { TooltipState, TooltipAction, TooltipDependencies } from './tooltip.types.js';
/**
 * Tooltip reducer with animation lifecycle management.
 *
 * Handles:
 * - Hover delay before showing tooltip
 * - PresentationState lifecycle (presenting → presented → dismissing → idle)
 * - Animation coordination via presentation events
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: initialTooltipState,
 *   reducer: tooltipReducer,
 *   dependencies: { hoverDelay: 300 }
 * });
 *
 * // User hovers
 * store.dispatch({ type: 'hoverStarted', content: 'Save file' });
 * // After delay → delayCompleted → tooltip animates in
 * // After animation → presentationCompleted → tooltip fully shown
 * ```
 */
export declare const tooltipReducer: Reducer<TooltipState, TooltipAction, TooltipDependencies>;
//# sourceMappingURL=tooltip.reducer.d.ts.map
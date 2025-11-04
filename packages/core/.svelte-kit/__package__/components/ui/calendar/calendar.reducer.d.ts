/**
 * Calendar Reducer
 *
 * Handles date selection (single/range), month navigation, and bounds validation.
 *
 * @packageDocumentation
 */
import type { Reducer } from '../../../types.js';
import type { CalendarState, CalendarAction, CalendarDependencies } from './calendar.types.js';
/**
 * Calendar reducer.
 *
 * Handles:
 * - Single date selection with min/max validation
 * - Range selection (start → end flow)
 * - Month navigation (prev/next)
 * - Direct month setting
 * - Clearing selection
 */
export declare const calendarReducer: Reducer<CalendarState, CalendarAction, CalendarDependencies>;
//# sourceMappingURL=calendar.reducer.d.ts.map
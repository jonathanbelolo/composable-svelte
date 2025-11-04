/**
 * Calendar Reducer
 *
 * Handles date selection (single/range), month navigation, and bounds validation.
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	CalendarState,
	CalendarAction,
	CalendarDependencies
} from './calendar.types.js';
import { isDateInBounds, isSameDay } from './calendar.types.js';

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
export const calendarReducer: Reducer<CalendarState, CalendarAction, CalendarDependencies> = (
	state,
	action,
	deps
) => {
	switch (action.type) {
		case 'dateSelected': {
			const { date } = action;

			// Validate bounds
			if (!isDateInBounds(date, state.minDate, state.maxDate)) {
				return [state, Effect.none()];
			}

			// Single mode: Select date
			if (state.mode === 'single') {
				// Ignore if same date
				if (state.selectedDate && isSameDay(date, state.selectedDate)) {
					return [state, Effect.none()];
				}

				const newState: CalendarState = {
					...state,
					selectedDate: date,
					currentMonth: date
				};

				if (deps.onDateSelect) {
					return [
						newState,
						Effect.run(async () => {
							deps.onDateSelect!(date);
						})
					];
				}

				return [newState, Effect.none()];
			}

			// Range mode: Start new range
			const newState: CalendarState = {
				...state,
				selectedRange: { from: date, to: null }
			};

			return [newState, Effect.none()];
		}

		case 'rangeStarted': {
			const { date } = action;

			// Only valid in range mode
			if (state.mode !== 'range') {
				return [state, Effect.none()];
			}

			// Validate bounds
			if (!isDateInBounds(date, state.minDate, state.maxDate)) {
				return [state, Effect.none()];
			}

			// Ignore if same as current from
			if (state.selectedRange.from && isSameDay(date, state.selectedRange.from)) {
				return [state, Effect.none()];
			}

			const newState: CalendarState = {
				...state,
				selectedRange: { from: date, to: null }
			};

			return [newState, Effect.none()];
		}

		case 'rangeCompleted': {
			const { date } = action;

			// Only valid in range mode
			if (state.mode !== 'range') {
				return [state, Effect.none()];
			}

			// Must have a start date
			if (!state.selectedRange.from) {
				return [state, Effect.none()];
			}

			// Validate bounds
			if (!isDateInBounds(date, state.minDate, state.maxDate)) {
				return [state, Effect.none()];
			}

			// Ensure from <= to (swap if needed)
			const from = state.selectedRange.from;
			const to = date;
			const [rangeFrom, rangeTo] = from <= to ? [from, to] : [to, from];

			const newState: CalendarState = {
				...state,
				selectedRange: { from: rangeFrom, to: rangeTo }
			};

			if (deps.onRangeSelect) {
				return [
					newState,
					Effect.run(async () => {
						deps.onRangeSelect!({ from: rangeFrom, to: rangeTo });
					})
				];
			}

			return [newState, Effect.none()];
		}

		case 'monthChanged': {
			const { direction } = action;

			const currentMonth = new Date(state.currentMonth);
			const newMonth =
				direction === 'next'
					? new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
					: new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);

			const newState: CalendarState = {
				...state,
				currentMonth: newMonth
			};

			return [newState, Effect.none()];
		}

		case 'monthSet': {
			const { date } = action;

			// Set to first day of the month
			const newMonth = new Date(date.getFullYear(), date.getMonth(), 1);

			const newState: CalendarState = {
				...state,
				currentMonth: newMonth
			};

			return [newState, Effect.none()];
		}

		case 'cleared': {
			const newState: CalendarState = {
				...state,
				selectedDate: null,
				selectedRange: { from: null, to: null }
			};

			return [newState, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none()];
		}
	}
};

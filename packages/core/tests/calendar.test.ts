/**
 * Tests for Calendar component
 *
 * Tests single/range date selection, month navigation, and bounds validation.
 */

import { describe, it, expect } from 'vitest';
import { createTestStore } from '../src/test/test-store.js';
import { calendarReducer } from '../src/components/ui/calendar/calendar.reducer.js';
import { createInitialCalendarState } from '../src/components/ui/calendar/calendar.types.js';

describe('Calendar', () => {
	describe('Single Mode - Date Selection', () => {
		it('selects a date', async () => {
			const dateSelections: Date[] = [];
			const testDate = new Date(2024, 5, 15); // June 15, 2024

			const store = createTestStore({
				initialState: createInitialCalendarState('single'),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: testDate }, (state) => {
				expect(state.selectedDate).toEqual(testDate);
				expect(state.currentMonth.getMonth()).toBe(5); // June
				expect(state.currentMonth.getFullYear()).toBe(2024);
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([testDate]);
		});

		it('ignores selecting the same date', async () => {
			const testDate = new Date(2024, 5, 15);
			const dateSelections: Date[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('single', testDate),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: testDate }, (state) => {
				expect(state.selectedDate).toEqual(testDate);
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([]); // No callback
		});

		it('changes to a different date', async () => {
			const date1 = new Date(2024, 5, 15);
			const date2 = new Date(2024, 5, 20);
			const dateSelections: Date[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('single', date1),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: date2 }, (state) => {
				expect(state.selectedDate).toEqual(date2);
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([date2]);
		});

		it('respects min date constraint', async () => {
			const minDate = new Date(2024, 5, 10);
			const invalidDate = new Date(2024, 5, 5); // Before min
			const dateSelections: Date[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('single', null, minDate, null),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: invalidDate }, (state) => {
				expect(state.selectedDate).toBeNull();
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([]); // No callback
		});

		it('respects max date constraint', async () => {
			const maxDate = new Date(2024, 5, 20);
			const invalidDate = new Date(2024, 5, 25); // After max
			const dateSelections: Date[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('single', null, null, maxDate),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: invalidDate }, (state) => {
				expect(state.selectedDate).toBeNull();
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([]); // No callback
		});

		it('allows date within min/max range', async () => {
			const minDate = new Date(2024, 5, 10);
			const maxDate = new Date(2024, 5, 20);
			const validDate = new Date(2024, 5, 15);
			const dateSelections: Date[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('single', null, minDate, maxDate),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			await store.send({ type: 'dateSelected', date: validDate }, (state) => {
				expect(state.selectedDate).toEqual(validDate);
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([validDate]);
		});
	});

	describe('Range Mode - Date Selection', () => {
		it('starts a range', async () => {
			const startDate = new Date(2024, 5, 10);

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer
			});

			await store.send({ type: 'rangeStarted', date: startDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
		});

		it('completes a range (forward)', async () => {
			const startDate = new Date(2024, 5, 10);
			const endDate = new Date(2024, 5, 20);
			const rangeSelections: any[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer,
				dependencies: {
					onRangeSelect: (range) => rangeSelections.push(range)
				}
			});

			// Start range
			await store.send({ type: 'rangeStarted', date: startDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
				expect(state.selectedRange.to).toBeNull();
			});

			// Complete range
			await store.send({ type: 'rangeCompleted', date: endDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
				expect(state.selectedRange.to).toEqual(endDate);
			});

			store.assertNoPendingActions();
			expect(rangeSelections).toEqual([{ from: startDate, to: endDate }]);
		});

		it('completes a range (backward - swaps dates)', async () => {
			const startDate = new Date(2024, 5, 20);
			const endDate = new Date(2024, 5, 10);
			const rangeSelections: any[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer,
				dependencies: {
					onRangeSelect: (range) => rangeSelections.push(range)
				}
			});

			await store.send({ type: 'rangeStarted', date: startDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
			});

			// End date is before start date - should swap
			await store.send({ type: 'rangeCompleted', date: endDate }, (state) => {
				expect(state.selectedRange.from).toEqual(endDate); // Swapped
				expect(state.selectedRange.to).toEqual(startDate); // Swapped
			});

			store.assertNoPendingActions();
			expect(rangeSelections).toEqual([{ from: endDate, to: startDate }]);
		});

		it('uses dateSelected action in range mode', async () => {
			const date1 = new Date(2024, 5, 10);
			const date2 = new Date(2024, 5, 20);
			const rangeSelections: any[] = [];

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer,
				dependencies: {
					onRangeSelect: (range) => rangeSelections.push(range)
				}
			});

			// First click starts range
			await store.send({ type: 'dateSelected', date: date1 }, (state) => {
				expect(state.selectedRange.from).toEqual(date1);
				expect(state.selectedRange.to).toBeNull();
			});

			// Second click would complete via rangeCompleted
			await store.send({ type: 'rangeCompleted', date: date2 }, (state) => {
				expect(state.selectedRange.from).toEqual(date1);
				expect(state.selectedRange.to).toEqual(date2);
			});

			store.assertNoPendingActions();
			expect(rangeSelections).toEqual([{ from: date1, to: date2 }]);
		});

		it('starts new range when clicking after complete range', async () => {
			const date1 = new Date(2024, 5, 10);
			const date2 = new Date(2024, 5, 20);
			const date3 = new Date(2024, 5, 25);

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer
			});

			// Complete first range
			await store.send({ type: 'rangeStarted', date: date1 }, (state) => {
				expect(state.selectedRange.from).toEqual(date1);
			});

			await store.send({ type: 'rangeCompleted', date: date2 }, (state) => {
				expect(state.selectedRange.from).toEqual(date1);
				expect(state.selectedRange.to).toEqual(date2);
			});

			// Start new range
			await store.send({ type: 'rangeStarted', date: date3 }, (state) => {
				expect(state.selectedRange.from).toEqual(date3);
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
		});

		it('ignores same start date', async () => {
			const startDate = new Date(2024, 5, 10);

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer
			});

			await store.send({ type: 'rangeStarted', date: startDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
			});

			// Try to start with same date
			await store.send({ type: 'rangeStarted', date: startDate }, (state) => {
				expect(state.selectedRange.from).toEqual(startDate);
			});

			store.assertNoPendingActions();
		});

		it('respects bounds in range mode', async () => {
			const minDate = new Date(2024, 5, 10);
			const maxDate = new Date(2024, 5, 20);
			const invalidDate = new Date(2024, 5, 25); // After max

			const store = createTestStore({
				initialState: createInitialCalendarState('range', null, minDate, maxDate),
				reducer: calendarReducer
			});

			await store.send({ type: 'rangeStarted', date: invalidDate }, (state) => {
				expect(state.selectedRange.from).toBeNull();
			});

			store.assertNoPendingActions();
		});

		it('requires start date before completing range', async () => {
			const endDate = new Date(2024, 5, 20);

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer
			});

			// Try to complete without start
			await store.send({ type: 'rangeCompleted', date: endDate }, (state) => {
				expect(state.selectedRange.from).toBeNull();
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
		});
	});

	describe('Month Navigation', () => {
		it('goes to next month', async () => {
			const initialMonth = new Date(2024, 5, 1); // June 2024

			const store = createTestStore({
				initialState: createInitialCalendarState('single', initialMonth),
				reducer: calendarReducer
			});

			await store.send({ type: 'monthChanged', direction: 'next' }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(6); // July
				expect(state.currentMonth.getFullYear()).toBe(2024);
			});

			store.assertNoPendingActions();
		});

		it('goes to previous month', async () => {
			const initialMonth = new Date(2024, 5, 1); // June 2024

			const store = createTestStore({
				initialState: createInitialCalendarState('single', initialMonth),
				reducer: calendarReducer
			});

			await store.send({ type: 'monthChanged', direction: 'prev' }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(4); // May
				expect(state.currentMonth.getFullYear()).toBe(2024);
			});

			store.assertNoPendingActions();
		});

		it('handles year boundary (next)', async () => {
			const initialMonth = new Date(2024, 11, 1); // December 2024

			const store = createTestStore({
				initialState: createInitialCalendarState('single', initialMonth),
				reducer: calendarReducer
			});

			await store.send({ type: 'monthChanged', direction: 'next' }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(0); // January
				expect(state.currentMonth.getFullYear()).toBe(2025);
			});

			store.assertNoPendingActions();
		});

		it('handles year boundary (previous)', async () => {
			const initialMonth = new Date(2024, 0, 1); // January 2024

			const store = createTestStore({
				initialState: createInitialCalendarState('single', initialMonth),
				reducer: calendarReducer
			});

			await store.send({ type: 'monthChanged', direction: 'prev' }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(11); // December
				expect(state.currentMonth.getFullYear()).toBe(2023);
			});

			store.assertNoPendingActions();
		});

		it('sets month directly', async () => {
			const targetMonth = new Date(2025, 8, 15); // September 15, 2025

			const store = createTestStore({
				initialState: createInitialCalendarState('single'),
				reducer: calendarReducer
			});

			await store.send({ type: 'monthSet', date: targetMonth }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(8); // September
				expect(state.currentMonth.getFullYear()).toBe(2025);
				expect(state.currentMonth.getDate()).toBe(1); // Always first day
			});

			store.assertNoPendingActions();
		});
	});

	describe('Clear Selection', () => {
		it('clears single selection', async () => {
			const testDate = new Date(2024, 5, 15);

			const store = createTestStore({
				initialState: createInitialCalendarState('single', testDate),
				reducer: calendarReducer
			});

			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selectedDate).toBeNull();
			});

			store.assertNoPendingActions();
		});

		it('clears range selection', async () => {
			const initialState = createInitialCalendarState('range');
			initialState.selectedRange = {
				from: new Date(2024, 5, 10),
				to: new Date(2024, 5, 20)
			};

			const store = createTestStore({
				initialState,
				reducer: calendarReducer
			});

			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selectedRange.from).toBeNull();
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
		});
	});

	describe('Mode Constraints', () => {
		it('ignores rangeStarted in single mode', async () => {
			const testDate = new Date(2024, 5, 15);

			const store = createTestStore({
				initialState: createInitialCalendarState('single'),
				reducer: calendarReducer
			});

			await store.send({ type: 'rangeStarted', date: testDate }, (state) => {
				expect(state.selectedRange.from).toBeNull();
			});

			store.assertNoPendingActions();
		});

		it('ignores rangeCompleted in single mode', async () => {
			const testDate = new Date(2024, 5, 15);

			const store = createTestStore({
				initialState: createInitialCalendarState('single'),
				reducer: calendarReducer
			});

			await store.send({ type: 'rangeCompleted', date: testDate }, (state) => {
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
		});
	});

	describe('Full User Flow', () => {
		it('complete single mode flow', async () => {
			const dateSelections: Date[] = [];
			const date1 = new Date(2024, 5, 10);
			const date2 = new Date(2024, 5, 20);

			const store = createTestStore({
				initialState: createInitialCalendarState('single'),
				reducer: calendarReducer,
				dependencies: {
					onDateSelect: (date) => dateSelections.push(date)
				}
			});

			// Select first date
			await store.send({ type: 'dateSelected', date: date1 }, (state) => {
				expect(state.selectedDate).toEqual(date1);
			});

			// Navigate month
			await store.send({ type: 'monthChanged', direction: 'next' }, (state) => {
				expect(state.currentMonth.getMonth()).toBe(6); // July
			});

			// Select second date
			await store.send({ type: 'dateSelected', date: date2 }, (state) => {
				expect(state.selectedDate).toEqual(date2);
			});

			// Clear
			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selectedDate).toBeNull();
			});

			store.assertNoPendingActions();
			expect(dateSelections).toEqual([date1, date2]);
		});

		it('complete range mode flow', async () => {
			const rangeSelections: any[] = [];
			const date1 = new Date(2024, 5, 10);
			const date2 = new Date(2024, 5, 20);
			const date3 = new Date(2024, 6, 5);
			const date4 = new Date(2024, 6, 15);

			const store = createTestStore({
				initialState: createInitialCalendarState('range'),
				reducer: calendarReducer,
				dependencies: {
					onRangeSelect: (range) => rangeSelections.push(range)
				}
			});

			// First range
			await store.send({ type: 'rangeStarted', date: date1 }, (state) => {
				expect(state.selectedRange.from).toEqual(date1);
			});

			await store.send({ type: 'rangeCompleted', date: date2 }, (state) => {
				expect(state.selectedRange.to).toEqual(date2);
			});

			// Second range
			await store.send({ type: 'rangeStarted', date: date3 }, (state) => {
				expect(state.selectedRange.from).toEqual(date3);
				expect(state.selectedRange.to).toBeNull();
			});

			await store.send({ type: 'rangeCompleted', date: date4 }, (state) => {
				expect(state.selectedRange.to).toEqual(date4);
			});

			// Clear
			await store.send({ type: 'cleared' }, (state) => {
				expect(state.selectedRange.from).toBeNull();
				expect(state.selectedRange.to).toBeNull();
			});

			store.assertNoPendingActions();
			expect(rangeSelections).toEqual([
				{ from: date1, to: date2 },
				{ from: date3, to: date4 }
			]);
		});
	});
});

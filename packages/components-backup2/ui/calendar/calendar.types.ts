/**
 * Calendar Types
 *
 * State management types for calendar component with single/range selection.
 *
 * @packageDocumentation
 */

/**
 * Calendar selection mode.
 */
export type CalendarMode = 'single' | 'range';

/**
 * Date range selection.
 */
export interface DateRange {
	from: Date | null;
	to: Date | null;
}

/**
 * Calendar state.
 */
export interface CalendarState {
	/**
	 * Selection mode.
	 */
	mode: CalendarMode;

	/**
	 * Selected date (single mode).
	 */
	selectedDate: Date | null;

	/**
	 * Selected date range (range mode).
	 */
	selectedRange: DateRange;

	/**
	 * Currently displayed month (year-month).
	 */
	currentMonth: Date;

	/**
	 * Minimum selectable date.
	 */
	minDate: Date | null;

	/**
	 * Maximum selectable date.
	 */
	maxDate: Date | null;
}

/**
 * Calendar actions.
 */
export type CalendarAction =
	| { type: 'dateSelected'; date: Date }
	| { type: 'monthChanged'; direction: 'prev' | 'next' }
	| { type: 'monthSet'; date: Date }
	| { type: 'rangeStarted'; date: Date }
	| { type: 'rangeCompleted'; date: Date }
	| { type: 'cleared' };

/**
 * Calendar dependencies.
 */
export interface CalendarDependencies {
	/**
	 * Callback when date is selected (single mode).
	 */
	onDateSelect?: (date: Date) => void;

	/**
	 * Callback when range is selected (range mode).
	 */
	onRangeSelect?: (range: DateRange) => void;
}

/**
 * Check if date is within min/max bounds.
 */
export function isDateInBounds(
	date: Date,
	minDate: Date | null,
	maxDate: Date | null
): boolean {
	if (minDate && date < minDate) return false;
	if (maxDate && date > maxDate) return false;
	return true;
}

/**
 * Check if two dates are the same day.
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Check if date is in range.
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
	if (!range.from || !range.to) return false;
	return date >= range.from && date <= range.to;
}

/**
 * Get the first day of the month.
 */
export function getFirstDayOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the last day of the month.
 */
export function getLastDayOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Get calendar grid days (includes previous/next month padding).
 */
export function getCalendarDays(currentMonth: Date): Date[] {
	const firstDay = getFirstDayOfMonth(currentMonth);
	const lastDay = getLastDayOfMonth(currentMonth);

	const startPadding = firstDay.getDay(); // Days from previous month
	const endPadding = 6 - lastDay.getDay(); // Days from next month

	const days: Date[] = [];

	// Add previous month days
	for (let i = startPadding - 1; i >= 0; i--) {
		const date = new Date(firstDay);
		date.setDate(date.getDate() - i - 1);
		days.push(date);
	}

	// Add current month days
	for (let d = 1; d <= lastDay.getDate(); d++) {
		days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
	}

	// Add next month days
	for (let i = 1; i <= endPadding; i++) {
		const date = new Date(lastDay);
		date.setDate(date.getDate() + i);
		days.push(date);
	}

	return days;
}

/**
 * Create initial calendar state.
 */
export function createInitialCalendarState(
	mode: CalendarMode = 'single',
	selectedDate: Date | null = null,
	minDate: Date | null = null,
	maxDate: Date | null = null
): CalendarState {
	return {
		mode,
		selectedDate,
		selectedRange: { from: null, to: null },
		currentMonth: selectedDate || new Date(),
		minDate,
		maxDate
	};
}

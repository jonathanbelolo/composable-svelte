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
export type CalendarAction = {
    type: 'dateSelected';
    date: Date;
} | {
    type: 'monthChanged';
    direction: 'prev' | 'next';
} | {
    type: 'monthSet';
    date: Date;
} | {
    type: 'rangeStarted';
    date: Date;
} | {
    type: 'rangeCompleted';
    date: Date;
} | {
    type: 'cleared';
};
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
export declare function isDateInBounds(date: Date, minDate: Date | null, maxDate: Date | null): boolean;
/**
 * Check if two dates are the same day.
 */
export declare function isSameDay(date1: Date, date2: Date): boolean;
/**
 * Check if date is in range.
 */
export declare function isDateInRange(date: Date, range: DateRange): boolean;
/**
 * Get the first day of the month.
 */
export declare function getFirstDayOfMonth(date: Date): Date;
/**
 * Get the last day of the month.
 */
export declare function getLastDayOfMonth(date: Date): Date;
/**
 * Get calendar grid days (includes previous/next month padding).
 */
export declare function getCalendarDays(currentMonth: Date): Date[];
/**
 * Create initial calendar state.
 */
export declare function createInitialCalendarState(mode?: CalendarMode, selectedDate?: Date | null, minDate?: Date | null, maxDate?: Date | null): CalendarState;
//# sourceMappingURL=calendar.types.d.ts.map
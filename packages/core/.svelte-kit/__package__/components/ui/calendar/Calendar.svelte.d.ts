import type { Snippet } from 'svelte';
import type { CalendarMode, DateRange } from './calendar.types.js';
interface CalendarProps {
    /**
     * Selection mode.
     */
    mode?: CalendarMode;
    /**
     * Selected date (single mode).
     * $bindable for two-way binding.
     */
    selectedDate?: Date | null;
    /**
     * Selected date range (range mode).
     * $bindable for two-way binding.
     */
    selectedRange?: DateRange;
    /**
     * Minimum selectable date.
     */
    minDate?: Date | null;
    /**
     * Maximum selectable date.
     */
    maxDate?: Date | null;
    /**
     * Callback when date is selected (single mode).
     */
    onDateSelect?: (date: Date) => void;
    /**
     * Callback when range is selected (range mode).
     */
    onRangeSelect?: (range: DateRange) => void;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Custom header snippet (month/year display).
     */
    header?: Snippet<[{
        month: Date;
        prevMonth: () => void;
        nextMonth: () => void;
    }]>;
    /**
     * Custom day cell snippet.
     */
    day?: Snippet<[
        {
            date: Date;
            isCurrentMonth: boolean;
            isSelected: boolean;
            isInRange: boolean;
            isDisabled: boolean;
            select: () => void;
        }
    ]>;
}
/**
 * Calendar Component
 *
 * Date picker with single/range selection and month navigation.
 *
 * Features:
 * - Single date or range selection
 * - Month navigation
 * - Min/max date constraints
 * - Keyboard navigation
 * - $bindable for selected date/range
 */
declare const Calendar: import("svelte").Component<CalendarProps, {}, "mode" | "selectedDate" | "selectedRange">;
type Calendar = ReturnType<typeof Calendar>;
export default Calendar;
//# sourceMappingURL=Calendar.svelte.d.ts.map
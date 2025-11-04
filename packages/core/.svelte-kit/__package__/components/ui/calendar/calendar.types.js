/**
 * Calendar Types
 *
 * State management types for calendar component with single/range selection.
 *
 * @packageDocumentation
 */
/**
 * Check if date is within min/max bounds.
 */
export function isDateInBounds(date, minDate, maxDate) {
    if (minDate && date < minDate)
        return false;
    if (maxDate && date > maxDate)
        return false;
    return true;
}
/**
 * Check if two dates are the same day.
 */
export function isSameDay(date1, date2) {
    return (date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate());
}
/**
 * Check if date is in range.
 */
export function isDateInRange(date, range) {
    if (!range.from || !range.to)
        return false;
    return date >= range.from && date <= range.to;
}
/**
 * Get the first day of the month.
 */
export function getFirstDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}
/**
 * Get the last day of the month.
 */
export function getLastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
/**
 * Get calendar grid days (includes previous/next month padding).
 */
export function getCalendarDays(currentMonth) {
    const firstDay = getFirstDayOfMonth(currentMonth);
    const lastDay = getLastDayOfMonth(currentMonth);
    const startPadding = firstDay.getDay(); // Days from previous month
    const endPadding = 6 - lastDay.getDay(); // Days from next month
    const days = [];
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
export function createInitialCalendarState(mode = 'single', selectedDate = null, minDate = null, maxDate = null) {
    return {
        mode,
        selectedDate,
        selectedRange: { from: null, to: null },
        currentMonth: selectedDate || new Date(),
        minDate,
        maxDate
    };
}

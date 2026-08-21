/**
 * Range mode could not select anything.
 *
 * The prop-sync effects compare `store.state.X` against the `X` prop and
 * dispatch `propsChanged` when they differ. That comparison cannot tell which
 * side moved — and the effect re-runs on *both*, because it reads both. Single
 * mode survives it only by accident: `dateSelected` calls `deps.onDateSelect`,
 * which writes the `selectedDate` prop, so the two are equal again before the
 * effect re-runs.
 *
 * `rangeStarted` calls nothing. So the first click set `selectedRange.from` in
 * the store, the effect saw state ≠ prop, dispatched `propsChanged` with the
 * stale prop, and `{ ...state, ...action.props }` wiped it. `rangeCompleted` —
 * the only action that notifies — is unreachable, because it requires a `from`
 * that can never persist. Measured before the fix: zero selected cells after a
 * click.
 *
 * `CalendarDemo` has three live range calendars.
 *
 * The fix keys each sync effect on the prop's own previous value, held in a
 * plain `let`, so an internal change is no longer mistaken for a prop to
 * restore. Assertions are on the rendered grid.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CalendarRangeTest from './test-components/CalendarRangeTest.svelte';

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(CalendarRangeTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		days: () => [...root.querySelectorAll('.calendar-day:not(.calendar-day--other-month)')],
		selected: () => root.querySelectorAll('.calendar-day--selected').length,
		inRange: () => root.querySelectorAll('.calendar-day--in-range').length,
		prop: () => root.querySelector('[data-testid="range"]')!.textContent!.trim()
	};
}

describe('range selection through the UI', () => {
	it('the first click sets the range start and it sticks', async () => {
		const cal = mount();
		(cal.days()[9] as HTMLButtonElement).click();
		await settle();

		expect(cal.selected(), 'the first click was reverted by the prop-sync effect').toBe(1);
	});

	it('the bound prop sees the partial range', async () => {
		// `bind:selectedRange` must reflect an in-progress range, or a consumer
		// cannot render "pick an end date" state.
		const cal = mount();
		(cal.days()[9] as HTMLButtonElement).click();
		await settle();

		expect(cal.prop()).toBe('from-set');
	});

	it('a second click completes the range', async () => {
		const cal = mount();
		(cal.days()[9] as HTMLButtonElement).click();
		await settle();
		(cal.days()[14] as HTMLButtonElement).click();
		await settle();

		expect(cal.selected(), 'both endpoints').toBe(2);
		// Inclusive of both endpoints — `isDateInRange` is `>= from && <= to` — so a
		// 9→14 span is six days, and the two endpoints carry both classes.
		expect(cal.inRange()).toBe(6);
		expect(cal.prop()).toBe('complete');
	});

	it('a third click starts a new range', async () => {
		const cal = mount();
		(cal.days()[9] as HTMLButtonElement).click();
		await settle();
		(cal.days()[14] as HTMLButtonElement).click();
		await settle();
		(cal.days()[2] as HTMLButtonElement).click();
		await settle();

		expect(cal.selected()).toBe(1);
		expect(cal.inRange()).toBe(0);
	});
});

/**
 * The month the grid shows must follow `selectedDate`, and `monthSet` must be
 * reachable.
 *
 * `propsChanged` merges `{ mode, selectedDate, selectedRange, minDate, maxDate }`
 * and never touches `currentMonth`. So a date picker that sets `selectedDate` to
 * a date in another month leaves the grid on the old month — with the selection
 * off-screen, the calendar looks like nothing was selected at all. That is the
 * primary way a Calendar is driven, so it is a default-path defect, not an edge
 * case.
 *
 * `monthSet` was the action for exactly this and had zero dispatchers anywhere
 * in the repo: no component, no example, only a TestStore unit test. The default
 * header renders month and year as plain text, so a user could only reach a
 * distant month by clicking the chevron once per month.
 *
 * The guard has to compare **months**, not dates: `monthSet` normalises to the
 * first of the month, so `currentMonth !== selectedDate` is true forever and
 * would livelock the effect.
 *
 * Assertions are on the rendered grid. The store was never the problem — the
 * reducer's `monthSet` case has always been correct.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CalendarPropsTest from './test-components/CalendarPropsTest.svelte';

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(CalendarPropsTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		click: (testid: string) =>
			root.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click(),
		/**
		 * The displayed month, read off the *grid* rather than the header — the
		 * header is about to gain selects, and a test that read its text would then
		 * be asserting on the control instead of on what the control did. Day cells
		 * carry `aria-label={date.toLocaleDateString()}`.
		 */
		displayed: () => {
			const first = root.querySelector('.calendar-day:not(.calendar-day--other-month)')!;
			const [month, , year] = first.getAttribute('aria-label')!.split('/');
			return `${MONTHS[Number(month) - 1]} ${year}`;
		},
		/** The day cells belonging to the displayed month. */
		ownDays: () =>
			[...root.querySelectorAll('.calendar-day:not(.calendar-day--other-month)')].map(
				(el) => el.textContent!.trim()
			),
		selected: () =>
			[...root.querySelectorAll('.calendar-day--selected')].map((el) => el.textContent!.trim())
	};
}

describe('the grid follows selectedDate', () => {
	it('jumps to the month of an externally set date', async () => {
		const cal = mount();
		expect(cal.displayed(), 'precondition').toBe('March 2024');

		cal.click('jump-to-july');
		await settle();

		expect(cal.displayed()).toBe('July 2024');
		// The selection has to be *visible*, which is the whole point — a selected
		// date on a month the grid is not showing is indistinguishable from none.
		expect(cal.selected()).toEqual(['4']);
	});

	it('does not disturb the month for a date in the same month', async () => {
		// The guard compares months. A date-level comparison would still pass this,
		// but `monthSet` normalises to the 1st, so it would then re-fire forever.
		const cal = mount();
		cal.click('same-month');
		await settle();

		expect(cal.displayed()).toBe('March 2024');
		expect(cal.selected()).toEqual(['28']);
	});

	it('stays put when the date is cleared', async () => {
		const cal = mount();
		cal.click('jump-to-july');
		await settle();
		cal.click('clear');
		await settle();

		expect(cal.displayed(), 'clearing is not a navigation instruction').toBe('July 2024');
		expect(cal.selected()).toEqual([]);
	});
});

describe('the default header can reach a distant month', () => {
	it('offers month and year selects', async () => {
		const cal = mount();
		const month = cal.root.querySelector<HTMLSelectElement>('select[data-calendar-month]');
		const year = cal.root.querySelector<HTMLSelectElement>('select[data-calendar-year]');

		expect(month, 'no month select — the header is display-only text').not.toBeNull();
		expect(year, 'no year select').not.toBeNull();
		expect(month!.value).toBe('2');
		expect(year!.value).toBe('2024');
	});

	it('dispatches monthSet when a month is chosen', async () => {
		const cal = mount();
		const month = cal.root.querySelector<HTMLSelectElement>('select[data-calendar-month]')!;

		month.value = '10';
		month.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(cal.displayed()).toBe('November 2024');
		expect(cal.ownDays().length, 'November has 30 days').toBe(30);
	});

	it('dispatches monthSet when a year is chosen', async () => {
		const cal = mount();
		const year = cal.root.querySelector<HTMLSelectElement>('select[data-calendar-year]')!;

		year.value = '2027';
		year.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(cal.displayed()).toBe('March 2027');
	});

	it('keeps the day grid consistent with the chosen month', async () => {
		// February 2024 is a leap month. Picking it and getting 28 days would mean
		// the header moved and the grid did not.
		const cal = mount();
		const month = cal.root.querySelector<HTMLSelectElement>('select[data-calendar-month]')!;

		month.value = '1';
		month.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(cal.displayed()).toBe('February 2024');
		expect(cal.ownDays().length).toBe(29);
	});
});

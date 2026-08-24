<!--
	Calendar Component

	Date picker with single/range selection and month navigation.

	Features:
	- Single date or range selection
	- Month navigation
	- Min/max date constraints
	- Keyboard navigation
	- $bindable for selected date/range

	@component
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createStore } from '../../../store.svelte.js';
	import { calendarReducer } from './calendar.reducer.js';
	import type {
		CalendarMode,
		CalendarState,
		DateRange,
		CalendarDependencies
	} from './calendar.types.js';
	import {
		createInitialCalendarState,
		getCalendarDays,
		isSameDay,
		isDateInRange,
		isDateInBounds
	} from './calendar.types.js';

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
		minDate?: Date | null | undefined;

		/**
		 * Maximum selectable date.
		 */
		maxDate?: Date | null | undefined;

		/**
		 * Callback when date is selected (single mode).
		 */
		onDateSelect?: ((date: Date) => void) | undefined;

		/**
		 * Callback when range is selected (range mode).
		 */
		onRangeSelect?: ((range: DateRange) => void) | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: string | undefined;

		/**
		 * Custom header snippet (month/year display).
		 */
		header?: Snippet<
			[{ month: Date; prevMonth: () => void; nextMonth: () => void; setMonth: (date: Date) => void }]
		>;

		/**
		 * Custom day cell snippet.
		 */
		day?: Snippet<
			[
				{
					date: Date;
					isCurrentMonth: boolean;
					isSelected: boolean;
					isInRange: boolean;
					isDisabled: boolean;
					select: () => void;
				}
			]
		>;
	}

	let {
		mode = $bindable('single'),
		selectedDate = $bindable(null),
		selectedRange = $bindable({ from: null, to: null }),
		minDate = null,
		maxDate = null,
		onDateSelect,
		onRangeSelect,
		class: className = '',
		header,
		day
	}: CalendarProps = $props();

	// Create dependencies
	const dependencies: CalendarDependencies = {
		onDateSelect: (date) => {
			selectedDate = date;
			onDateSelect?.(date);
		},
		onRangeSelect: (range) => {
			selectedRange = range;
			onRangeSelect?.(range);
		}
	};

	// Create store
	const store = createStore({
		initialState: createInitialCalendarState(mode, selectedDate, minDate, maxDate),
		reducer: calendarReducer,
		dependencies
	});

	// Sync external props to the store.
	//
	// Keyed on each prop's own previous value, held in plain `let`s — never on a
	// comparison against store state. An effect that compares the two reads both,
	// so it re-runs when *either* moves and cannot tell which did: an internal
	// change looks exactly like a prop that must be restored.
	//
	// That is not hypothetical. It made range mode unusable. `dateSelected` calls
	// `deps.onDateSelect`, which writes the `selectedDate` prop, so single mode
	// converged by accident; `rangeStarted` notifies nobody, so the first click
	// set `selectedRange.from` in the store, the effect saw a difference, and
	// `propsChanged` put the stale prop back. `rangeCompleted` was unreachable
	// because it needs a `from` that could never survive.
	//
	// Not `$state`: these are read and written by the effects that depend on
	// them, and a reactive guard re-triggers the effect it lives in
	// (`effect_update_depth_exceeded`).
	let lastMode = mode;
	let lastSelectedDate = selectedDate;
	let lastRange = selectedRange;
	let lastMinDate = minDate;
	let lastMaxDate = maxDate;

	$effect(() => {
		if (mode === lastMode) return;
		lastMode = mode;
		store.dispatch({ type: 'propsChanged', props: { mode } });
	});

	$effect(() => {
		if (selectedDate === lastSelectedDate) return;
		lastSelectedDate = selectedDate;
		store.dispatch({ type: 'propsChanged', props: { selectedDate } });
	});

	$effect(() => {
		// By endpoint, not by object identity: `bind:` hands back a fresh object
		// every time the range advances, and re-dispatching an unchanged range
		// would restart the cycle this guard exists to end.
		if (selectedRange.from === lastRange.from && selectedRange.to === lastRange.to) return;
		lastRange = selectedRange;
		store.dispatch({ type: 'propsChanged', props: { selectedRange } });
	});

	$effect(() => {
		if (minDate === lastMinDate) return;
		lastMinDate = minDate;
		store.dispatch({ type: 'propsChanged', props: { minDate } });
	});

	$effect(() => {
		if (maxDate === lastMaxDate) return;
		lastMaxDate = maxDate;
		store.dispatch({ type: 'propsChanged', props: { maxDate } });
	});

	// Derived values
	const calendarDays = $derived(getCalendarDays($store.currentMonth));
	const currentMonthDate = $derived($store.currentMonth);

	const monthNames = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const year = $derived(currentMonthDate.getFullYear());

	// A decade either side of the displayed year, clamped to the bounds the
	// consumer set. Not because the reducer would refuse anything — `monthSet`
	// performs no bounds check, and the chevrons navigate freely — but because
	// there is nothing selectable once you arrive.
	const selectableYears = $derived.by(() => {
		const first = $store.minDate ? $store.minDate.getFullYear() : year - 10;
		const last = $store.maxDate ? $store.maxDate.getFullYear() : year + 10;
		// The displayed year is always offered, even if props moved out from under
		// it, so the select can never show a blank value.
		const lo = Math.min(first, year);
		const hi = Math.max(last, year);
		return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
	});

	// Months are offered on the same basis as years: a month whose every day
	// falls outside `minDate`/`maxDate` has nothing to select, so it is disabled
	// rather than silently useless. Without this the two controls disagreed —
	// the year select was clamped while the month select offered all twelve.
	const selectableMonths = $derived.by(() =>
		monthNames.map((name, index) => {
			const lastDay = new Date(year, index + 1, 0);
			const firstDay = new Date(year, index, 1);
			const beforeMin = $store.minDate ? lastDay < $store.minDate : false;
			const afterMax = $store.maxDate ? firstDay > $store.maxDate : false;
			return { name, index, disabled: beforeMin || afterMax };
		})
	);

	// Actions
	const prevMonth = () => {
		store.dispatch({ type: 'monthChanged', direction: 'prev' });
	};

	const nextMonth = () => {
		store.dispatch({ type: 'monthChanged', direction: 'next' });
	};

	/**
	 * Jump straight to a month. The `monthSet` action existed with no dispatcher
	 * anywhere in the repo, so reaching a distant month meant clicking a chevron
	 * once per month.
	 */
	const setMonth = (date: Date) => {
		store.dispatch({ type: 'monthSet', date });
	};

	const selectDate = (date: Date) => {
		if (mode === 'single') {
			store.dispatch({ type: 'dateSelected', date });
		} else {
			// Range mode
			if (!$store.selectedRange.from || $store.selectedRange.to) {
				// Start new range
				store.dispatch({ type: 'rangeStarted', date });
				// `rangeStarted` has no dependency callback, so the component is what
				// keeps the bound prop in step — `onRangeSelect` only fires on
				// completion, and a half-built range is still worth reporting.
				lastRange = $store.selectedRange;
				selectedRange = lastRange;
			} else {
				// Complete range
				store.dispatch({ type: 'rangeCompleted', date });
			}
		}
	};

	const clear = () => {
		store.dispatch({ type: 'cleared' });
	};

	// Helper functions
	const isCurrentMonth = (date: Date): boolean => {
		return date.getMonth() === currentMonthDate.getMonth();
	};

	const isSelected = (date: Date): boolean => {
		if (mode === 'single') {
			return $store.selectedDate !== null && isSameDay(date, $store.selectedDate);
		} else {
			// Range mode: Check if date is start or end
			const { from, to } = $store.selectedRange;
			if (from && isSameDay(date, from)) return true;
			if (to && isSameDay(date, to)) return true;
			return false;
		}
	};

	const isInRange = (date: Date): boolean => {
		if (mode !== 'range') return false;
		return isDateInRange(date, $store.selectedRange);
	};

	const isDisabled = (date: Date): boolean => {
		return !isDateInBounds(date, $store.minDate, $store.maxDate);
	};
</script>

<div class="calendar {className}">
	{#if header}
		{@render header({ month: currentMonthDate, prevMonth, nextMonth, setMonth })}
	{:else}
		<!-- Default header -->
		<div class="calendar-header">
			<button type="button" class="calendar-nav-button" onclick={prevMonth} aria-label="Previous month">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
			</button>

			<div class="calendar-month-year">
				<select
					data-calendar-month
					class="calendar-month-select"
					aria-label="Month"
					value={currentMonthDate.getMonth()}
					onchange={(event) =>
						setMonth(new Date(year, Number(event.currentTarget.value), 1))}
				>
					{#each selectableMonths as month}
						<option value={month.index} disabled={month.disabled}>{month.name}</option>
					{/each}
				</select>

				<select
					data-calendar-year
					class="calendar-year-select"
					aria-label="Year"
					value={year}
					onchange={(event) =>
						setMonth(new Date(Number(event.currentTarget.value), currentMonthDate.getMonth(), 1))}
				>
					{#each selectableYears as selectableYear}
						<option value={selectableYear}>{selectableYear}</option>
					{/each}
				</select>
			</div>

			<button type="button" class="calendar-nav-button" onclick={nextMonth} aria-label="Next month">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</button>
		</div>
	{/if}

	<!-- Day names -->
	<div class="calendar-day-names">
		{#each dayNames as dayName}
			<div class="calendar-day-name">{dayName}</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="calendar-grid">
		{#each calendarDays as date (date.getTime())}
			{@const isCurrent = isCurrentMonth(date)}
			{@const selected = isSelected(date)}
			{@const inRange = isInRange(date)}
			{@const disabled = isDisabled(date)}

			{#if day}
				{@render day({
					date,
					isCurrentMonth: isCurrent,
					isSelected: selected,
					isInRange: inRange,
					isDisabled: disabled,
					select: () => selectDate(date)
				})}
			{:else}
				<!-- Default day cell -->
				<button
					type="button"
					class="calendar-day"
					class:calendar-day--other-month={!isCurrent}
					class:calendar-day--selected={selected}
					class:calendar-day--in-range={inRange}
					class:calendar-day--disabled={disabled}
					disabled={disabled}
					onclick={() => selectDate(date)}
					aria-label={date.toLocaleDateString()}
				>
					{date.getDate()}
				</button>
			{/if}
		{/each}
	</div>

	<!-- Footer (clear button) -->
	{#if (mode === 'single' && $store.selectedDate) || (mode === 'range' && ($store.selectedRange.from || $store.selectedRange.to))}
		<div class="calendar-footer">
			<button type="button" class="calendar-clear-button" onclick={clear}> Clear </button>
		</div>
	{/if}
</div>

<style>
	.calendar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		width: fit-content;
	}

	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.calendar-nav-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		color: #374151;
	}

	.calendar-nav-button:hover {
		background: #f3f4f6;
	}

	.calendar-nav-button:active {
		background: #e5e7eb;
	}

	.calendar-month-year {
		font-size: 0.875rem;
		font-weight: 600;
		color: #111827;
		min-width: 8rem;
		text-align: center;
	}

	.calendar-month-select,
	.calendar-year-select {
		font: inherit;
		color: inherit;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		padding: 0.125rem 0.25rem;
		cursor: pointer;
	}
	.calendar-month-select:hover,
	.calendar-year-select:hover {
		background: #f3f4f6;
	}

	.calendar-day-names {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
	}

	.calendar-day-name {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
		text-transform: uppercase;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
	}

	.calendar-day {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		color: #111827;
	}

	.calendar-day:hover:not(:disabled) {
		background: #f3f4f6;
	}

	.calendar-day--other-month {
		color: #9ca3af;
	}

	.calendar-day--selected {
		background: #3b82f6;
		color: white;
		font-weight: 600;
	}

	.calendar-day--selected:hover:not(:disabled) {
		background: #2563eb;
	}

	.calendar-day--in-range {
		background: #dbeafe;
		color: #1e40af;
	}

	.calendar-day--in-range:hover:not(:disabled) {
		background: #bfdbfe;
	}

	.calendar-day--disabled {
		color: #d1d5db;
		cursor: not-allowed;
		opacity: 0.5;
	}

	.calendar-footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 0.5rem;
		border-top: 1px solid #e5e7eb;
	}

	.calendar-clear-button {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		color: #374151;
	}

	.calendar-clear-button:hover {
		background: #f3f4f6;
	}

	.calendar-clear-button:active {
		background: #e5e7eb;
	}
</style>

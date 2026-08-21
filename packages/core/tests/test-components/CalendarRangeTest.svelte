<script lang="ts">
	/** A range calendar driven the way `CalendarDemo` drives its three. */
	import Calendar from '../../src/lib/components/ui/calendar/Calendar.svelte';
	import type { DateRange } from '../../src/lib/components/ui/calendar/calendar.types.js';

	let selectedRange = $state<DateRange>({ from: null, to: null });

	const label = $derived(
		selectedRange.to ? 'complete' : selectedRange.from ? 'from-set' : 'from-null'
	);
</script>

<div data-testid="range">{label}</div>
<Calendar mode="range" bind:selectedRange />

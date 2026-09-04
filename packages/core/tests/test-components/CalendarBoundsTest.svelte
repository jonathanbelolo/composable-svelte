<script lang="ts">
	/** A bounded calendar, displaying the month that holds `minDate`. */
	import Calendar from '../../src/lib/components/ui/calendar/Calendar.svelte';

	const minDate = new Date(2024, 2, 10);
	const maxDate = new Date(2024, 8, 20);
</script>

<Calendar {minDate} {maxDate} selectedDate={new Date(2024, 2, 15)} />

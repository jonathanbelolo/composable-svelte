<script lang="ts">
	/**
	 * Drives `selectedDate` from outside, which is how a date-picker uses Calendar:
	 * the popover owns the value and the grid is meant to follow it.
	 */
	import Calendar from '../../src/lib/components/ui/calendar/Calendar.svelte';

	let selectedDate = $state<Date | null>(new Date(2024, 2, 15)); // March
</script>

<button data-testid="jump-to-july" onclick={() => (selectedDate = new Date(2024, 6, 4))}>
	July
</button>
<button data-testid="same-month" onclick={() => (selectedDate = new Date(2024, 2, 28))}>
	Later in March
</button>
<button data-testid="clear" onclick={() => (selectedDate = null)}>Clear</button>

<Calendar bind:selectedDate />

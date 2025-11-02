<script lang="ts">
  import { Calendar } from '@composable-svelte/core/components/ui/calendar/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import type { DateRange } from '@composable-svelte/core/components/ui/calendar/calendar.types.js';

  // State for different calendar demos
  let singleDate = $state<Date | null>(null);
  let birthdayDate = $state<Date | null>(new Date(1990, 5, 15)); // June 15, 1990
  let dateRange = $state<DateRange>({ from: null, to: null });
  let vacationRange = $state<DateRange>({
    from: new Date(2025, 11, 20), // Dec 20, 2025
    to: new Date(2025, 11, 27)    // Dec 27, 2025
  });
  let constrainedDate = $state<Date | null>(null);

  // Event logs
  let eventLog = $state<string[]>([]);

  function logEvent(message: string) {
    eventLog = [message, ...eventLog.slice(0, 4)]; // Keep last 5 events
  }

  function handleDateSelect(date: Date) {
    logEvent(`Date selected: ${date.toLocaleDateString()}`);
  }

  function handleRangeSelect(range: DateRange) {
    if (range.from && range.to) {
      logEvent(`Range: ${range.from.toLocaleDateString()} - ${range.to.toLocaleDateString()}`);
    } else if (range.from) {
      logEvent(`Start date: ${range.from.toLocaleDateString()}`);
    }
  }

  // Date constraints
  const today = new Date();
  const minDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maxDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
</script>

<div class="space-y-12">
  <!-- Basic Single Date Selection -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Date Picker</h3>
      <p class="text-muted-foreground text-sm">
        Simple single date selection
      </p>
    </div>

    <div class="flex flex-col gap-4">
      <Calendar
        mode="single"
        bind:selectedDate={singleDate}
        onDateSelect={handleDateSelect}
      />

      <div class="text-sm">
        {#if singleDate}
          <Badge variant="primary">
            Selected: {singleDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Badge>
        {:else}
          <p class="text-muted-foreground">No date selected</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Date Range Selection -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Date Range Picker</h3>
      <p class="text-muted-foreground text-sm">
        Select a start and end date
      </p>
    </div>

    <div class="flex flex-col gap-4">
      <Calendar
        mode="range"
        bind:selectedRange={dateRange}
        onRangeSelect={handleRangeSelect}
      />

      <div class="text-sm space-y-2">
        {#if dateRange.from && dateRange.to}
          <div class="flex items-center gap-2">
            <Badge variant="success">Start: {dateRange.from.toLocaleDateString()}</Badge>
            <span class="text-muted-foreground">→</span>
            <Badge variant="success">End: {dateRange.to.toLocaleDateString()}</Badge>
          </div>
          <p class="text-muted-foreground">
            Duration: {Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1} days
          </p>
        {:else if dateRange.from}
          <Badge variant="secondary">Start: {dateRange.from.toLocaleDateString()}</Badge>
          <p class="text-muted-foreground">Select an end date</p>
        {:else}
          <p class="text-muted-foreground">No range selected</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Pre-selected Date -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Pre-selected Date</h3>
      <p class="text-muted-foreground text-sm">
        Calendar with initial value
      </p>
    </div>

    <div class="flex flex-col gap-4">
      <Calendar
        mode="single"
        bind:selectedDate={birthdayDate}
      />

      <div class="text-sm">
        {#if birthdayDate}
          <Badge variant="primary">
            Birthday: {birthdayDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </Badge>
        {/if}
      </div>
    </div>
  </section>

  <!-- Pre-selected Range -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Vacation Planner</h3>
      <p class="text-muted-foreground text-sm">
        Range picker with initial selection
      </p>
    </div>

    <div class="flex flex-col gap-4">
      <Calendar
        mode="range"
        bind:selectedRange={vacationRange}
      />

      <div class="text-sm">
        {#if vacationRange.from && vacationRange.to}
          <div class="p-4 bg-muted rounded-lg space-y-2">
            <p class="font-medium">Planned Vacation</p>
            <div class="flex items-center gap-2">
              <Badge variant="success">
                {vacationRange.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Badge>
              <span class="text-muted-foreground">to</span>
              <Badge variant="success">
                {vacationRange.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              {Math.ceil((vacationRange.to.getTime() - vacationRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1} days off
            </p>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- Date Constraints -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Date Constraints</h3>
      <p class="text-muted-foreground text-sm">
        Min/max date restrictions (next 12 months only)
      </p>
    </div>

    <div class="flex flex-col gap-4">
      <Calendar
        mode="single"
        bind:selectedDate={constrainedDate}
        minDate={minDate}
        maxDate={maxDate}
      />

      <div class="text-sm space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">Allowed range:</span>
          <Badge variant="secondary">{minDate.toLocaleDateString()}</Badge>
          <span class="text-muted-foreground">to</span>
          <Badge variant="secondary">{maxDate.toLocaleDateString()}</Badge>
        </div>
        {#if constrainedDate}
          <Badge variant="primary">
            Selected: {constrainedDate.toLocaleDateString()}
          </Badge>
        {:else}
          <p class="text-muted-foreground">Select a date within the allowed range</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Event Callbacks -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Event Callbacks</h3>
      <p class="text-muted-foreground text-sm">
        Calendar with selection event logging
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <Calendar
          mode="range"
          onRangeSelect={handleRangeSelect}
        />
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Event Log</p>
        {#if eventLog.length > 0}
          <div class="space-y-1">
            {#each eventLog as event}
              <div class="text-xs bg-muted p-2 rounded">
                {event}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-muted-foreground">Select dates to see events</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Styled Calendar -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Styling</h3>
      <p class="text-muted-foreground text-sm">
        Calendar with custom CSS classes
      </p>
    </div>

    <Calendar
      mode="single"
      class="border-2 border-primary rounded-lg shadow-lg"
    />
  </section>

  <!-- Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Calendar component applications
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📅</span>
          <span class="font-medium">Event Scheduling</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Select dates for appointments, meetings, or events
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🏨</span>
          <span class="font-medium">Booking Systems</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Check-in/check-out dates for hotels or rentals
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📊</span>
          <span class="font-medium">Date Filtering</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Filter data by date range in dashboards
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🎂</span>
          <span class="font-medium">Birthdays</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Capture date of birth in forms
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">✈️</span>
          <span class="font-medium">Travel Planning</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Select departure and return dates
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📝</span>
          <span class="font-medium">Deadline Tracking</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Set due dates for tasks and projects
        </p>
      </div>
    </div>
  </section>
</div>

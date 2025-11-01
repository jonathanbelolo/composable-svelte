<script lang="ts">
  import { Select } from '@composable-svelte/core/components/ui/select/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';

  const fruits = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' },
    { value: 'grape', label: 'Grape' },
    { value: 'mango', label: 'Mango' }
  ];

  const countries = [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
    { value: 'au', label: 'Australia' },
    { value: 'de', label: 'Germany' },
    { value: 'fr', label: 'France' }
  ];

  let selectedFruit = $state(null);
  let selectedCountry = $state(null);
  let selectedLanguages = $state([]);
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">Dropdown selection with search</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-2">
        <Label for="demo-select">Choose a fruit</Label>
        <Select
          id="demo-select"
          options={fruits}
          bind:value={selectedFruit}
          placeholder="Select a fruit..."
        />
      </div>
      <p class="text-sm text-muted-foreground">
        Selected: {selectedFruit || 'None'}
      </p>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Select Variants</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Basic select</h4>
        <div class="space-y-2">
          <Label for="basic-select">Country</Label>
          <Select
            id="basic-select"
            options={countries}
            bind:value={selectedCountry}
            placeholder="Select a country..."
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">With search</h4>
        <div class="space-y-2">
          <Label for="search-select">Country (searchable)</Label>
          <Select
            id="search-select"
            options={countries}
            searchable
            placeholder="Search countries..."
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Multi-select</h4>
        <div class="space-y-2">
          <Label for="multi-select">Languages</Label>
          <Select
            id="multi-select"
            options={[
              { value: 'js', label: 'JavaScript' },
              { value: 'ts', label: 'TypeScript' },
              { value: 'py', label: 'Python' },
              { value: 'rs', label: 'Rust' }
            ]}
            bind:value={selectedLanguages}
            multiple
            placeholder="Select languages..."
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled</h4>
        <div class="space-y-2">
          <Label for="disabled-select">Disabled select</Label>
          <Select
            id="disabled-select"
            options={fruits}
            disabled
            placeholder="Cannot select..."
          />
        </div>
      </div>
    </div>
  </section>
</div>

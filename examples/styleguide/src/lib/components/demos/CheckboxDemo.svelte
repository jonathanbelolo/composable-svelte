<script lang="ts">
  import { Checkbox } from '@composable-svelte/core/components/ui/checkbox/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';

  let agreedToTerms = $state(false);
  let newsletter = $state(false);
  let feature1 = $state(true);
  let feature2 = $state(false);
  let feature3 = $state(false);

  let selectAll = $state(false);
  let items = $state([false, false, false]);

  $effect(() => {
    selectAll = items.every(item => item);
  });

  function toggleAll() {
    const newValue = !selectAll;
    items = items.map(() => newValue);
  }
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">Binary selection with visual feedback</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="flex items-center space-x-2">
        <Checkbox id="demo-checkbox" bind:checked={agreedToTerms} />
        <Label for="demo-checkbox">I agree to the terms and conditions</Label>
      </div>
      <p class="text-sm text-muted-foreground">
        Status: {agreedToTerms ? 'Agreed ✓' : 'Not agreed'}
      </p>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Checkbox States</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Unchecked</h4>
        <div class="flex items-center space-x-2">
          <Checkbox id="unchecked" />
          <Label for="unchecked">Unchecked checkbox</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Checked</h4>
        <div class="flex items-center space-x-2">
          <Checkbox id="checked" checked />
          <Label for="checked">Checked checkbox</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled unchecked</h4>
        <div class="flex items-center space-x-2">
          <Checkbox id="disabled-unchecked" disabled />
          <Label for="disabled-unchecked">Disabled unchecked</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled checked</h4>
        <div class="flex items-center space-x-2">
          <Checkbox id="disabled-checked" checked disabled />
          <Label for="disabled-checked">Disabled checked</Label>
        </div>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Select All Pattern</h3>
      <p class="text-muted-foreground text-sm">
        Parent checkbox with indeterminate state
      </p>
    </div>

    <div class="rounded-lg border bg-card p-6 space-y-4">
      <div class="flex items-center space-x-2 pb-2 border-b">
        <Checkbox
          id="select-all"
          checked={selectAll}
          indeterminate={items.some(i => i) && !items.every(i => i)}
          onclick={toggleAll}
        />
        <Label for="select-all">Select all items</Label>
      </div>
      <div class="ml-6 space-y-3">
        {#each items as item, i}
          <div class="flex items-center space-x-2">
            <Checkbox id="item-{i}" bind:checked={items[i]} />
            <Label for="item-{i}">Item {i + 1}</Label>
          </div>
        {/each}
      </div>
    </div>
  </section>
</div>

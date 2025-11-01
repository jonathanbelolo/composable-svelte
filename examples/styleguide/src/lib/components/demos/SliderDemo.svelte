<script lang="ts">
  import { Slider } from '@composable-svelte/core/components/ui/slider/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';

  let volume = $state(50);
  let brightness = $state(75);
  let temperature = $state(20);
  let price = $state(500);
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">Range input for selecting numeric values</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-2">
        <div class="flex justify-between">
          <Label for="demo-slider">Volume</Label>
          <span class="text-sm text-muted-foreground">{volume}%</span>
        </div>
        <Slider
          id="demo-slider"
          bind:value={volume}
          min={0}
          max={100}
        />
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Slider Variants</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Default (0-100)</h4>
        <div class="space-y-2">
          <div class="flex justify-between">
            <Label for="brightness-slider">Brightness</Label>
            <span class="text-sm text-muted-foreground">{brightness}%</span>
          </div>
          <Slider
            id="brightness-slider"
            bind:value={brightness}
            min={0}
            max={100}
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Custom range (-10 to 40)</h4>
        <div class="space-y-2">
          <div class="flex justify-between">
            <Label for="temp-slider">Temperature</Label>
            <span class="text-sm text-muted-foreground">{temperature}°C</span>
          </div>
          <Slider
            id="temp-slider"
            bind:value={temperature}
            min={-10}
            max={40}
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">With step (50)</h4>
        <div class="space-y-2">
          <div class="flex justify-between">
            <Label for="price-slider">Price</Label>
            <span class="text-sm text-muted-foreground">${price}</span>
          </div>
          <Slider
            id="price-slider"
            bind:value={price}
            min={0}
            max={1000}
            step={50}
          />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled</h4>
        <div class="space-y-2">
          <div class="flex justify-between">
            <Label for="disabled-slider">Locked value</Label>
            <span class="text-sm text-muted-foreground">75%</span>
          </div>
          <Slider
            id="disabled-slider"
            value={75}
            disabled
          />
        </div>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
    </div>

    <div class="rounded-lg border bg-card p-6 space-y-6">
      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="vol-slider">Audio Volume</Label>
          <span class="text-sm font-mono">{volume}</span>
        </div>
        <Slider id="vol-slider" bind:value={volume} min={0} max={100} />
      </div>

      <div class="space-y-2">
        <div class="flex justify-between">
          <Label for="rating-slider">Rating</Label>
          <span class="text-sm font-mono">{(price / 200).toFixed(1)} / 5.0</span>
        </div>
        <Slider id="rating-slider" bind:value={price} min={0} max={1000} step={10} />
      </div>
    </div>
  </section>
</div>

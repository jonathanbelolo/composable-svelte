<script lang="ts">
  import { Panel } from '@composable-svelte/core/components/ui/panel/index.js';
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Panel Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different visual styles for panels
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <div class="space-y-2">
        <p class="text-sm font-medium">Default</p>
        <Panel variant="default">
          <h4 class="font-semibold mb-2">Default Panel</h4>
          <p class="text-sm text-muted-foreground">Standard panel with subtle border</p>
        </Panel>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Bordered</p>
        <Panel variant="bordered">
          <h4 class="font-semibold mb-2">Bordered Panel</h4>
          <p class="text-sm text-muted-foreground">Prominent border for emphasis</p>
        </Panel>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Elevated</p>
        <Panel variant="elevated">
          <h4 class="font-semibold mb-2">Elevated Panel</h4>
          <p class="text-sm text-muted-foreground">Shadow elevation for depth</p>
        </Panel>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Flat</p>
        <Panel variant="flat">
          <h4 class="font-semibold mb-2">Flat Panel</h4>
          <p class="text-sm text-muted-foreground">No border or shadow</p>
        </Panel>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Common panel layouts
      </p>
    </div>

    <div class="space-y-4">
      <Panel variant="elevated">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-semibold">Settings Panel</h4>
          <button class="text-sm text-primary hover:underline">Edit</button>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Theme</span>
            <span class="font-medium">Dark</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Language</span>
            <span class="font-medium">English</span>
          </div>
        </div>
      </Panel>

      <Panel variant="bordered">
        <h4 class="font-semibold mb-3">Feature List</h4>
        <ul class="space-y-2 text-sm">
          <li class="flex items-center gap-2">
            <span class="text-green-600">✓</span>
            <span>Unlimited projects</span>
          </li>
          <li class="flex items-center gap-2">
            <span class="text-green-600">✓</span>
            <span>Priority support</span>
          </li>
          <li class="flex items-center gap-2">
            <span class="text-green-600">✓</span>
            <span>Advanced analytics</span>
          </li>
        </ul>
      </Panel>
    </div>
  </section>
</div>

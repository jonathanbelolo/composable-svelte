<script lang="ts">
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  let clickCount = $state(0);
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the button to see it in action
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <Button onclick={() => clickCount++}>
        Click me
      </Button>
      <p class="text-sm text-muted-foreground">
        Clicked {clickCount} time{clickCount !== 1 ? 's' : ''}
      </p>
    </div>
  </section>

  <!-- Variants Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different button styles and types
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Default -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Default</h4>
        <div class="flex items-center justify-center h-32 bg-muted/20 rounded">
          <Button>Default Button</Button>
        </div>
      </div>

      <!-- Primary -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Primary</h4>
        <div class="flex items-center justify-center h-32 bg-muted/20 rounded">
          <Button class="bg-primary text-primary-foreground hover:bg-primary/90">
            Primary Button
          </Button>
        </div>
      </div>

      <!-- Secondary -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Secondary</h4>
        <div class="flex items-center justify-center h-32 bg-muted/20 rounded">
          <Button class="bg-secondary text-secondary-foreground hover:bg-secondary/80">
            Secondary Button
          </Button>
        </div>
      </div>

      <!-- Outline -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Outline</h4>
        <div class="flex items-center justify-center h-32 bg-muted/20 rounded">
          <Button class="border-2 border-input bg-background hover:bg-accent hover:text-accent-foreground">
            Outline Button
          </Button>
        </div>
      </div>
    </div>
  </section>

  <!-- States Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">States</h3>
      <p class="text-muted-foreground text-sm">
        Different button states
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Default State -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">Default</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button>Default</Button>
          </div>
        </div>

        <!-- Hover State (simulated with class) -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">Hover</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button class="opacity-90">Hover</Button>
          </div>
        </div>

        <!-- Active/Pressed State -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">Active</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button class="scale-95">Active</Button>
          </div>
        </div>

        <!-- Disabled State -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">Disabled</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button disabled>Disabled</Button>
          </div>
        </div>

        <!-- Loading State -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">Loading</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button disabled>
              <span class="animate-spin mr-2">⏳</span>
              Loading
            </Button>
          </div>
        </div>

        <!-- With Icon -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-muted-foreground">With Icon</div>
          <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
            <Button>
              <span class="mr-2">✓</span>
              Success
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Sizes Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Different button sizes
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-4 p-8 rounded-lg border bg-card">
      <Button class="h-8 px-3 text-xs">
        Small
      </Button>
      <Button class="h-10 px-4">
        Default
      </Button>
      <Button class="h-12 px-6 text-lg">
        Large
      </Button>
    </div>
  </section>
</div>

<script lang="ts">
  import type { ComponentInfo } from '../../data/component-registry.js';
  import type { Component } from 'svelte';
  import ButtonDemo from '../demos/ButtonDemo.svelte';
  import ModalDemo from '../demos/ModalDemo.svelte';
  import SheetDemo from '../demos/SheetDemo.svelte';
  import DrawerDemo from '../demos/DrawerDemo.svelte';
  import SidebarDemo from '../demos/SidebarDemo.svelte';
  import AlertDemo from '../demos/AlertDemo.svelte';
  import PopoverDemo from '../demos/PopoverDemo.svelte';
  import DropdownMenuDemo from '../demos/DropdownMenuDemo.svelte';

  interface ComponentShowcaseProps {
    component: ComponentInfo;
    onBack: () => void;
  }

  let { component, onBack }: ComponentShowcaseProps = $props();

  // Map component IDs to their demo components
  const demoComponents: Record<string, Component> = {
    'button': ButtonDemo,
    'modal': ModalDemo,
    'sheet': SheetDemo,
    'drawer': DrawerDemo,
    'sidebar': SidebarDemo,
    'alert': AlertDemo,
    'popover': PopoverDemo,
    'dropdown-menu': DropdownMenuDemo,
  };

  const DemoComponent = $derived(demoComponents[component.id]);
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center gap-4">
        <button
          onclick={onBack}
          class="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
          aria-label="Back to home"
        >
          ←
        </button>
        <div class="flex-1">
          <h1 class="text-3xl font-bold">{component.name}</h1>
          <p class="text-muted-foreground mt-1">{component.description}</p>
        </div>
        <div class="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
          {component.category}
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="container mx-auto px-6 py-12">
    {#if DemoComponent}
      <!-- Render the specific demo component -->
      <DemoComponent />
    {:else}
      <!-- Fallback: Show placeholder content for components without demos yet -->
      <div class="space-y-12">
        <!-- Demo Section -->
        <section class="space-y-6">
          <div>
            <h2 class="text-2xl font-bold mb-2">Live Demo</h2>
            <p class="text-muted-foreground">
              Interactive example showing the component in action
            </p>
          </div>

          <!-- Demo Area -->
          <div class="rounded-lg border-2 bg-card p-12 flex items-center justify-center min-h-[400px]">
            <div class="text-center space-y-4">
              <div class="text-6xl">🎨</div>
              <div class="text-muted-foreground">
                Live demo for <span class="font-semibold text-foreground">{component.name}</span> will be implemented here
              </div>
            </div>
          </div>
        </section>

        <!-- Variants Section (Placeholder) -->
        <section class="space-y-6">
          <div>
            <h2 class="text-2xl font-bold mb-2">Variants</h2>
            <p class="text-muted-foreground">
              Different configurations and styles
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            {#each [1, 2, 3, 4] as variant}
              <div class="rounded-lg border bg-card p-6">
                <h3 class="font-semibold mb-4">Variant {variant}</h3>
                <div class="flex items-center justify-center h-32 bg-muted/20 rounded">
                  <span class="text-muted-foreground text-sm">Example {variant}</span>
                </div>
              </div>
            {/each}
          </div>
        </section>

        <!-- States Section (Placeholder) -->
        <section class="space-y-6">
          <div>
            <h2 class="text-2xl font-bold mb-2">States</h2>
            <p class="text-muted-foreground">
              Different states like hover, active, disabled, etc.
            </p>
          </div>

          <div class="rounded-lg border bg-card p-8">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              {#each ['Default', 'Hover', 'Active', 'Disabled', 'Loading', 'Error'] as state}
                <div class="space-y-2">
                  <div class="text-sm font-medium text-muted-foreground">{state}</div>
                  <div class="flex items-center justify-center h-20 bg-muted/20 rounded border">
                    <span class="text-xs">{state}</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>

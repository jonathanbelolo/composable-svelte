<script lang="ts">
  import type { ComponentInfo } from '../../data/component-registry.js';

  interface ComponentCardProps {
    component: ComponentInfo;
    onClick: () => void;
  }

  let { component, onClick }: ComponentCardProps = $props();
</script>

<button
  onclick={onClick}
  class="group relative flex flex-col gap-3 p-6 rounded-lg border-2 bg-card text-card-foreground hover:border-primary transition-all hover:shadow-md text-left"
>
  <!-- Component Icon/Preview Placeholder -->
  <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
    <span class="text-2xl">📦</span>
  </div>

  <!-- Component Info -->
  <div class="flex flex-col gap-1">
    <h3 class="font-semibold text-lg group-hover:text-primary transition-colors">
      {component.name}
    </h3>
    <p class="text-sm text-muted-foreground">
      {component.description}
    </p>
  </div>

  <!-- Category Badge -->
  <div class="mt-auto pt-2 border-t">
    <span class="text-xs text-muted-foreground font-medium">
      {component.category}
    </span>
  </div>
</button>

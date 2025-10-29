<script lang="ts">
  import type { ProductCategory } from '../../models/product.js';

  // Phase 6 Components
  import Heading from '@composable-svelte/core/components/ui/heading/Heading.svelte';
  import Separator from '@composable-svelte/core/components/ui/separator/Separator.svelte';
  import Badge from '@composable-svelte/core/components/ui/badge/Badge.svelte';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  // ============================================================================
  // Props
  // ============================================================================

  interface CategoryFilterProps {
    selectedCategories: ProductCategory[];
    onCategoryToggle: (category: ProductCategory) => void;
  }

  let { selectedCategories, onCategoryToggle }: CategoryFilterProps = $props();

  // ============================================================================
  // Categories
  // ============================================================================

  const categories: Array<{ id: ProductCategory; label: string; icon: string }> = [
    { id: 'electronics', label: 'Electronics', icon: '💻' },
    { id: 'clothing', label: 'Clothing', icon: '👕' },
    { id: 'home', label: 'Home & Garden', icon: '🏠' },
    { id: 'sports', label: 'Sports', icon: '⚽' }
  ];
</script>

<!-- ============================================================================ -->
<!-- Category Filter Content - Enhanced with Phase 6 Components -->
<!-- ============================================================================ -->

<div class="p-8 h-full bg-gradient-to-b from-background via-muted/20 to-muted/30 shadow-inner">
  <div class="flex items-center justify-between mb-4">
    <Heading level={2} class="text-2xl font-bold">Categories</Heading>
    {#if selectedCategories.length > 0}
      <Badge variant="secondary" class="text-xs font-semibold px-3 py-1 shadow-md">
        {selectedCategories.length} selected
      </Badge>
    {/if}
  </div>

  <Separator class="my-6 bg-border/50" />

  <div class="space-y-3">
    {#each categories as category}
      <Button
        variant={selectedCategories.includes(category.id) ? 'default' : 'outline'}
        size="default"
        onclick={() => onCategoryToggle(category.id)}
        class="w-full justify-start gap-4 transition-all h-auto py-4 {selectedCategories.includes(category.id) ? 'shadow-lg' : 'hover:shadow-md'}"
      >
        <span class="text-3xl">{category.icon}</span>
        <span class="font-semibold flex-1 text-left text-base">{category.label}</span>
        {#if selectedCategories.includes(category.id)}
          <Badge variant="secondary" class="text-xs font-bold">✓</Badge>
        {/if}
      </Button>
    {/each}
  </div>

  <!-- Clear Filters - Enhanced -->
  {#if selectedCategories.length > 0}
    <Separator class="my-6 bg-border/50" />
    <Button
      variant="outline"
      size="default"
      onclick={() => {
        selectedCategories.forEach((cat) => onCategoryToggle(cat));
      }}
      class="w-full font-semibold shadow-md hover:shadow-lg transition-all"
    >
      Clear All Filters
    </Button>
  {/if}
</div>

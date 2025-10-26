<script lang="ts">
  import type { ProductCategory } from '../../models/product.js';

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
<!-- Category Filter Content -->
<!-- ============================================================================ -->

<div class="p-6 h-full">
  <h2 class="text-lg font-bold mb-4">Categories</h2>

  <div class="space-y-2">
    {#each categories as category}
      <button
        onclick={() => onCategoryToggle(category.id)}
        class="w-full flex items-center gap-3 p-3 rounded-lg transition-all {selectedCategories.includes(
          category.id
        )
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent'}"
      >
        <span class="text-2xl">{category.icon}</span>
        <span class="font-medium flex-1 text-left">{category.label}</span>
        {#if selectedCategories.includes(category.id)}
          <span class="text-xl">✓</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Clear Filters -->
  {#if selectedCategories.length > 0}
    <button
      onclick={() => {
        selectedCategories.forEach((cat) => onCategoryToggle(cat));
      }}
      class="w-full mt-6 py-2 px-4 border-2 border-border rounded-lg font-medium hover:bg-accent"
    >
      Clear Filters
    </button>
  {/if}
</div>

<script lang="ts">
  import type { Product } from '../../models/product.js';
  import { formatPrice, isInStock } from '../../models/product.js';

  // Phase 6 Components - Verified imports
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter
  } from '@composable-svelte/core/components/ui/card';
  import Badge from '@composable-svelte/core/components/ui/badge/Badge.svelte';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import Tooltip from '@composable-svelte/core/components/ui/tooltip/Tooltip.svelte';

  // ============================================================================
  // Props
  // ============================================================================

  interface ProductCardProps {
    product: Product;
    viewMode: 'grid' | 'list';
    onclick?: () => void;
  }

  let { product, viewMode, onclick }: ProductCardProps = $props();

  // ============================================================================
  // Helpers
  // ============================================================================

  function getStockBadgeVariant(product: Product): 'success' | 'warning' | 'destructive' {
    if (!isInStock(product)) return 'destructive';
    if (product.stock <= 5) return 'warning';
    return 'success';
  }

  function getStockText(product: Product): string {
    if (!isInStock(product)) return 'Out of Stock';
    if (product.stock <= 5) return `Only ${product.stock} left`;
    return 'In Stock';
  }
</script>

<!-- ============================================================================ -->
<!-- Product Card -->
<!-- ============================================================================ -->

{#if viewMode === 'grid'}
  <!-- Grid View - Dramatically Enhanced Design -->
  <Card
    class="group relative overflow-hidden h-full flex flex-col transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer border-2 hover:border-primary/50"
  >
    <button
      {onclick}
      data-testid="product-card"
      data-product-id={String(product.id)}
      data-product-name={String(product.name)}
      class="w-full h-full flex flex-col text-left"
    >
      <CardHeader class="relative pb-4 pt-6 px-6">
        <!-- Stock Badge Overlay -->
        <div class="absolute top-4 left-4 z-10">
          <Badge variant={getStockBadgeVariant(product)} class="text-xs font-semibold shadow-md">
            {getStockText(product)}
          </Badge>
        </div>

        <!-- Favorite Button Overlay -->
        <div class="absolute top-4 right-4 z-10" onclick={(e) => e.stopPropagation()}>
          {#if product.isFavorite}
            <Tooltip content="Remove from favorites" delay={300}>
              {#snippet children()}
                <Button variant="ghost" size="icon" class="h-10 w-10 rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all">
                  <span class="text-xl">❤️</span>
                </Button>
              {/snippet}
            </Tooltip>
          {:else}
            <Tooltip content="Add to favorites" delay={300}>
              {#snippet children()}
                <Button variant="ghost" size="icon" class="h-10 w-10 rounded-full bg-background/90 backdrop-blur-sm hover:bg-background shadow-lg hover:shadow-xl transition-all">
                  <span class="text-xl">🤍</span>
                </Button>
              {/snippet}
            </Tooltip>
          {/if}
        </div>

        <!-- Product Image with Enhanced Background -->
        <div class="relative py-12 px-8 rounded-xl bg-gradient-to-br from-muted/60 to-muted/30 shadow-inner">
          <div class="text-8xl text-center transition-transform duration-300 group-hover:scale-125 group-hover:rotate-3">
            {product.image}
          </div>
        </div>
      </CardHeader>

      <CardContent class="pt-6 pb-4 px-6 flex-1 flex flex-col">
        <CardTitle class="text-xl mb-2 line-clamp-2 group-hover:text-primary transition-colors font-bold">
          {product.name}
        </CardTitle>
        <CardDescription class="capitalize mb-4 text-sm font-medium">
          {product.category}
        </CardDescription>
        <div class="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mt-auto">
          {formatPrice(product.price)}
        </div>
      </CardContent>

      <CardFooter class="pt-4 pb-6 px-6">
        <Button variant="outline" size="default" class="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all font-semibold">
          View Details
        </Button>
      </CardFooter>
    </button>
  </Card>
{:else}
  <!-- List View - Dramatically Enhanced Design -->
  <Card class="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-x-1 cursor-pointer border-2 hover:border-primary/50">
    <button
      {onclick}
      data-testid="product-card"
      data-product-id={String(product.id)}
      data-product-name={String(product.name)}
      class="w-full text-left"
    >
      <CardContent class="p-6">
        <div class="flex items-center gap-6">
          <!-- Product Image with Enhanced Background -->
          <div class="flex-shrink-0 p-6 rounded-xl bg-gradient-to-br from-muted/60 to-muted/30 shadow-inner">
            <div class="text-7xl transition-transform duration-300 group-hover:scale-125 group-hover:rotate-3">
              {product.image}
            </div>
          </div>

          <!-- Product Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-6">
              <div class="flex-1">
                <CardTitle class="text-2xl mb-2 group-hover:text-primary transition-colors font-bold">
                  {product.name}
                </CardTitle>
                <CardDescription class="mb-4 line-clamp-2 text-base">
                  {product.description}
                </CardDescription>
                <div class="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" class="capitalize text-xs font-semibold px-3 py-1">
                    {product.category}
                  </Badge>
                  <Badge variant={getStockBadgeVariant(product)} class="text-xs font-semibold px-3 py-1 shadow-md">
                    {getStockText(product)}
                  </Badge>
                </div>
              </div>

              <div class="text-right flex-shrink-0 flex flex-col items-end gap-3">
                <div class="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  {formatPrice(product.price)}
                </div>
                <div onclick={(e) => e.stopPropagation()}>
                  {#if product.isFavorite}
                    <Tooltip content="Remove from favorites" delay={300}>
                      {#snippet children()}
                        <Button variant="ghost" size="icon" class="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all">
                          <span class="text-xl">❤️</span>
                        </Button>
                      {/snippet}
                    </Tooltip>
                  {:else}
                    <Tooltip content="Add to favorites" delay={300}>
                      {#snippet children()}
                        <Button variant="ghost" size="icon" class="h-10 w-10 rounded-full shadow-lg hover:shadow-xl transition-all">
                          <span class="text-xl">🤍</span>
                        </Button>
                      {/snippet}
                    </Tooltip>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </button>
  </Card>
{/if}

<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { ShareState, ShareAction, ShareMethod } from './share.types.js';
  import type { Product } from '../../models/product.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ShareProps {
    store: Store<ShareState, ShareAction>;
    product: Product;
  }

  let { store, product }: ShareProps = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const state = $derived(store.state);

  // ============================================================================
  // Share Methods
  // ============================================================================

  const shareMethods: Array<{ method: ShareMethod; label: string; icon: string }> = [
    { method: 'email', label: 'Email', icon: '📧' },
    { method: 'twitter', label: 'Twitter', icon: '🐦' },
    { method: 'facebook', label: 'Facebook', icon: '👤' },
    { method: 'link', label: 'Copy Link', icon: '🔗' }
  ];
</script>

<!-- ============================================================================ -->
<!-- Share Sheet Content -->
<!-- ============================================================================ -->

<div class="flex flex-col h-full bg-background">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b">
    <button
      onclick={() => store.send({ type: 'cancelButtonTapped' })}
      class="text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Cancel
    </button>
    <h2 class="text-lg font-semibold">Share Product</h2>
    <button
      onclick={() => store.send({ type: 'shareButtonTapped' })}
      disabled={!state.selectedMethod}
      class="text-sm font-medium text-primary hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Share
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-6">
    <!-- Product Info -->
    <div class="flex items-center gap-4 mb-6">
      <div class="text-5xl">{product.image}</div>
      <div>
        <h3 class="font-semibold">{product.name}</h3>
        <p class="text-sm text-muted-foreground">{product.description}</p>
      </div>
    </div>

    <!-- Share Methods -->
    <div class="space-y-2">
      <label class="text-sm font-medium block mb-3">Share via</label>
      {#each shareMethods as { method, label, icon }}
        <button
          onclick={() => store.send({ type: 'methodSelected', method })}
          class="w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all {state.selectedMethod ===
          method
            ? 'border-primary bg-primary/10'
            : 'border-border hover:bg-accent'}"
        >
          <span class="text-3xl">{icon}</span>
          <span class="font-medium">{label}</span>
          {#if state.selectedMethod === method}
            <span class="ml-auto text-primary">✓</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

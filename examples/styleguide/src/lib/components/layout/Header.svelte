<script lang="ts">
  import type { Theme } from '../../stores/styleguide.types.js';

  interface HeaderProps {
    theme: Theme;
    onThemeToggle: () => void;
  }

  let { theme, onThemeToggle }: HeaderProps = $props();
</script>

<header class="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <div class="container flex h-16 items-center justify-between px-6">
    <!-- Logo/Title -->
    <div class="flex items-center gap-3">
      <button
        onclick={() => {/* TODO: Navigate home */}}
        class="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span class="text-primary-foreground font-bold text-lg">CS</span>
        </div>
        <h1 class="text-xl font-bold">Component Showcase</h1>
      </button>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-4">
      <!-- Theme Toggle -->
      <button
        onclick={onThemeToggle}
        class="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        {#if theme === 'light'}
          <span class="text-xl">🌙</span>
        {:else}
          <span class="text-xl">☀️</span>
        {/if}
      </button>
    </div>
  </div>
</header>

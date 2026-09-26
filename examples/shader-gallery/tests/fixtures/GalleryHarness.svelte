<script lang="ts">
import ShaderGallery from '../../src/lib/ShaderGallery.svelte';
import ShaderImage2 from '../../src/lib/ShaderImage2.svelte';
import type { Store } from '@composable-svelte/core';
import type { ShaderGalleryState, ShaderGalleryAction } from '../../src/lib/shader-types';
import type { ShaderEffect } from '@composable-svelte/graphics';
let { store, standalone = false, initialSrc }: {
  store: Store<ShaderGalleryState, ShaderGalleryAction>;
  standalone?: boolean;
  initialSrc: string;
} = $props();
let width = $state<string | number>(600);
let height = $state<string | number>(400);
let show = $state(true);
let id = $state('image-1');
let src = $state(initialSrc);
let shader = $state<ShaderEffect | undefined>(undefined);
export function change(next: { id?: string; src?: string; shader?: ShaderEffect; show?: boolean; width?: string | number; height?: string | number }): void {
  if (next.id !== undefined) id = next.id;
  if (next.src !== undefined) src = next.src;
  if (next.shader !== undefined) shader = next.shader;
  if (next.show !== undefined) show = next.show;
  if (next.width !== undefined) width = next.width;
  if (next.height !== undefined) height = next.height;
}
</script>
{#snippet image()}
  {#if show}<ShaderImage2 {id} {src} alt="Test image" {shader} />{/if}
{/snippet}
{#if standalone}
  {@render image()}
{:else}
  <ShaderGallery {store} {width} {height}>{@render image()}</ShaderGallery>
{/if}

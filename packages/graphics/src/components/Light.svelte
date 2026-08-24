<script lang="ts">
/**
 * Light - Declarative light component
 * Adds light to scene via store
 */

import { onMount, onDestroy } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction, LightConfig } from '../core/types.js';

// Props
let {
  store,
  id: providedId,
  type,
  position,
  direction,
  angle,
  intensity,
  radius,
  color
}: {
  store: Store<GraphicsState, GraphicsAction>;
  /**
   * Stable identity for this light. Optional: one is generated when you do not
   * supply it, so existing markup is unaffected. Supply it if you need to
   * address the light from outside this component.
   */
  id?: string;
  type: 'directional' | 'point' | 'spot' | 'ambient';
  position?: [number, number, number];
  direction?: [number, number, number];
  angle?: number;
  intensity: number;
  radius?: number;
  color?: string;
} = $props();

/**
 * `$props.id()` is stable for the lifetime of this component instance and
 * SSR-safe, so no id generator or injected dependency is needed.
 *
 * Identity is what makes removal correct. This component used to capture
 * `store.state.lights.length - 1` at mount and remove by that number, while the
 * reducer filtered positionally — so with the default ambient light in slot 0,
 * unmounting three `<Light>` children removed index 1, then index 2 of the
 * already-shifted array, i.e. the wrong lights.
 */
const uid = $props.id();
const lightId = $derived(providedId ?? uid);

// Build light config
const lightConfig = $derived(
  (() => {
    switch (type) {
      case 'ambient':
        return { id: lightId, type, intensity, color } as LightConfig;
      case 'directional':
        return { id: lightId, type, position: position || [0, 1, 0], intensity, color } as LightConfig;
      case 'point':
        return { id: lightId, type, position: position || [0, 1, 0], intensity, radius, color } as LightConfig;
      case 'spot':
        return {
          id: lightId,
          type,
          position: position || [0, 1, 0],
          direction: direction || [0, -1, 0],
          angle: angle || Math.PI / 4,
          intensity,
          color
        } as LightConfig;
    }
  })()
);

// Add light on mount
onMount(() => {
  store.dispatch({
    type: 'addLight',
    light: lightConfig
  });
});

/**
 * Keep the light in step with its props.
 *
 * This component had no effect at all, so `lightConfig` recomputed on every
 * prop change and nothing ever consumed the result — `<Light intensity={x} />`
 * with a changing `x` did nothing, forever. `Camera.svelte` and `Mesh.svelte`
 * both carry this shape; `Light` was simply never given one.
 *
 * The `mounted` gate skips the first run, because `onMount` has already
 * dispatched. `updateLight` is idempotent by value, which is what
 * `tests/component-mount.test.ts` pins for the other two.
 */
let mounted = $state(false);

$effect(() => {
  if (!mounted) {
    mounted = true;
    return;
  }

  store.dispatch({
    type: 'updateLight',
    id: lightId,
    light: lightConfig
  });
});

// Remove light on unmount
onDestroy(() => {
  store.dispatch({
    type: 'removeLight',
    id: lightId
  });
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Light component updates state only, no visual output -->

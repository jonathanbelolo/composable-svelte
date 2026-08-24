<script lang="ts">
/**
 * Light - Declarative light component
 * Adds light to scene via store
 */

import { onDestroy, untrack } from 'svelte';
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

/**
 * The id this component currently owns in the store, or `null` if it owns none.
 *
 * Ownership is what makes the three lifecycle questions answerable: whether to
 * add or update, whether an id change means "rename" or "claim", and whether
 * unmounting should remove anything at all.
 *
 * There is no `onMount` here any more. It dispatched `addLight`, and the
 * `$effect` below then had to skip its own first run to avoid dispatching
 * twice — via a `mounted` flag that was itself `$state`, so writing it inside
 * the effect that read it scheduled a second run and produced `addLight` then
 * `updateLight` anyway. The gate never skipped anything; only the reducer's
 * value-idempotency made it harmless.
 */
let ownedId: string | null = null;
let warnedId: string | null = null;

$effect(() => {
  // `lightConfig` is the only tracked read: this effect exists to follow the
  // props, and everything below is untracked so it does not also follow the
  // store it is writing to. `store.dispatch` reads state internally, so without
  // this the effect depended on its own output — mounting dispatched `addLight`
  // and then a redundant `updateLight`, and only the reducer's value-idempotency
  // stopped that becoming a loop.
  const config = lightConfig;

  untrack(() => syncToStore(config));
});

function syncToStore(config: LightConfig): void {
  if (ownedId === config.id) {
    store.dispatch({ type: 'updateLight', id: config.id, light: config });
    return;
  }

  // The id changed, so release the old light before claiming the new one.
  // Without this the update went to an id the store had never heard of,
  // `updateLight` dropped it in silence, and the original light stayed in the
  // scene for good — surviving even this component's own unmount, because
  // `onDestroy` removes the *current* id.
  if (ownedId !== null) {
    store.dispatch({ type: 'removeLight', id: ownedId });
    ownedId = null;
  }

  const taken = store.state.lights.some((light) => light.id === config.id);

  if (taken) {
    // Two components owning one id used to overwrite each other's config
    // forever — the reducer's guard compares against the first match while its
    // update maps over every match — until Svelte aborted the app with
    // `effect_update_depth_exceeded`. Standing aside is what breaks the cycle.
    if (warnedId !== config.id) {
      console.warn(
        `[graphics] <Light> id "${config.id}" is already in use; this light is inert`
      );
      warnedId = config.id;
    }
    return;
  }

  store.dispatch({ type: 'addLight', light: config });
  ownedId = config.id;
}

onDestroy(() => {
  if (ownedId !== null) {
    store.dispatch({ type: 'removeLight', id: ownedId });
  }
});
</script>

<!-- Empty element for Svelte 5 snippet compatibility -->
<!-- Light component updates state only, no visual output -->

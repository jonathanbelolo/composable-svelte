<script lang="ts">
/**
 * Light - Declarative light component
 * Adds light to scene via store
 */

import { onDestroy, untrack } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction, LightConfig } from '../core/types.js';

/**
 * Props, discriminated by `type`.
 *
 * These used to be one flat object with every variant field optional, so
 * `<Light type="ambient" position={[0,5,0]} radius={10} />` compiled clean and
 * both props were silently dropped by the switch below. `LightConfig` is a
 * proper discriminated union; the component threw that away at its boundary.
 *
 * Two details are load-bearing, both learned from `ImageGallery.svelte`, the
 * repo's only other union-typed `$props()`:
 *
 * - the exclusion markers are `?: undefined`, **not** `?: never`. `never`
 *   refuses an explicit `undefined`, which is exactly what a forwarding wrapper
 *   holds under `exactOptionalPropertyTypes` — so neither arm could be
 *   forwarded. `?: undefined` still refuses a real value, which is all that is
 *   needed to reject `radius={10}` on an ambient light.
 * - every arm declares every key, which is what makes the union destructurable.
 *
 * Each arm spells out `id` and `color` rather than extending a shared base:
 * `optional-props.test.ts` only scans an interface's *own* body, so anything
 * inherited would go unchecked by the guard that exists to catch exactly the
 * `T?` versus `T | undefined` mistake.
 *
 * This comment used to blind that guard outright. It finds the props
 * declaration by searching for the first `$props()`, and the mention of one two
 * paragraphs up was the first — so the whole file resolved to nothing, silently,
 * while the paragraph explaining how not to blind the guard sat inside the thing
 * blinding it. The guard blanks comments before searching now; that is the fix,
 * and this paragraph is left as the demonstration.
 */
interface AmbientLightProps {
  store: Store<GraphicsState, GraphicsAction>;
  /**
   * Stable identity for this light. Optional: one is generated when you do not
   * supply it, so existing markup is unaffected. Supply it if you need to
   * address the light from outside this component.
   */
  id?: string | undefined;
  type: 'ambient';
  intensity: number;
  color?: string | undefined;
  position?: undefined;
  direction?: undefined;
  angle?: undefined;
  radius?: undefined;
}

interface DirectionalLightProps {
  store: Store<GraphicsState, GraphicsAction>;
  id?: string | undefined;
  type: 'directional';
  /** The direction the light travels in. A directional light has no position. */
  direction?: [number, number, number] | undefined;
  intensity: number;
  color?: string | undefined;
  position?: undefined;
  angle?: undefined;
  radius?: undefined;
}

interface PointLightProps {
  store: Store<GraphicsState, GraphicsAction>;
  id?: string | undefined;
  type: 'point';
  position?: [number, number, number] | undefined;
  radius?: number | undefined;
  intensity: number;
  color?: string | undefined;
  direction?: undefined;
  angle?: undefined;
}

interface SpotLightProps {
  store: Store<GraphicsState, GraphicsAction>;
  id?: string | undefined;
  type: 'spot';
  position?: [number, number, number] | undefined;
  direction?: [number, number, number] | undefined;
  /** Cone half-angle in radians. */
  angle?: number | undefined;
  intensity: number;
  color?: string | undefined;
  radius?: undefined;
}

type LightProps =
  | AmbientLightProps
  | DirectionalLightProps
  | PointLightProps
  | SpotLightProps;

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
}: LightProps = $props();

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

// Build light config.
//
// Conditional spreads rather than `as LightConfig` casts, which is the idiom
// `Camera.svelte` already uses and for the reason recorded there: a bare
// `{ radius }` sends `radius: undefined`, and the reducer's spread merge lets
// that overwrite a configured value. The casts existed to paper over exactly
// that mismatch.
const lightConfig = $derived(
  ((): LightConfig => {
    const base = {
      id: lightId,
      intensity,
      ...(color !== undefined && { color })
    };

    switch (type) {
      case 'ambient':
        return { ...base, type };
      case 'directional':
        // The default is unchanged from when this prop was called `position`;
        // renaming it should not also move it.
        return { ...base, type, direction: direction ?? [0, 1, 0] };
      case 'point':
        return {
          ...base,
          type,
          position: position ?? [0, 1, 0],
          ...(radius !== undefined && { radius })
        };
      case 'spot':
        return {
          ...base,
          type,
          position: position ?? [0, 1, 0],
          direction: direction ?? [0, -1, 0],
          // `??`, not `||`: `angle={0}` is a degenerate cone, but it is what
          // the caller asked for, and `||` silently replaced it with 45°.
          angle: angle ?? Math.PI / 4
        };
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

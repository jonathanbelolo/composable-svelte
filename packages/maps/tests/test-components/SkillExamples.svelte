<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-maps/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under
	 * `tests`. `packages/core/tests/repo/skill-examples.test.ts` compares the two,
	 * so a fence that changes in one place goes red until the other follows.
	 *
	 * The "Layer Toggle" fence (skill line 902) has no `<script>` tag: its runes
	 * sit bare above the `<button>`, so the guard sees the whole fence as markup
	 * and no `.svelte` construct can hold it. It is registered in the guard's
	 * NOT_COMPILED (DA-X2); its two halves are typechecked separately — the
	 * runes in this script, the button below. Once the skill wraps the runes in
	 * a `<script>`, the real button satisfies the guard on its own and the
	 * register entry falls out.
	 */
	import { Map } from '../../src/lib/index.js';
	import type { Layer, MapAction, MapState } from '../../src/lib/index.js';
	import type { Store } from '@composable-svelte/core';

	let {
		mapStore,
		myLayer
	}: {
		mapStore: Store<MapState, MapAction>;
		myLayer: Layer;
	} = $props();

	// Heatmap example (skill line 763): the intensity slider's state.
	let intensity = $state(1.0);

	// Layer Toggle (skill line 902): the runes the fence leaves outside a <script>.
	let showLayer = $state(true);

	$effect(() => {
	  if (showLayer) {
	    mapStore.dispatch({
	      type: 'addLayer',
	      layer: myLayer
	    });
	  } else {
	    mapStore.dispatch({
	      type: 'removeLayer',
	      id: myLayer.id
	    });
	  }
	});
</script>

<!-- Quick Start (skill line 38) -->
<Map
  store={mapStore}
  width="100%"
  height="600px"
/>

<!-- Map with onMapClick (skill line 78) -->
<Map
  store={mapStore}
  width="100%"
  height="600px"
  onMapClick={(lngLat) => console.log('Clicked:', lngLat)}
/>

<!-- Markers example (skill line 657) -->
<Map store={mapStore} width="100%" height="600px" />

<!-- GeoJSON example (skill line 700) -->
<Map store={mapStore} width="100%" height="600px" />

<!-- Heatmap example (skill line 763) -->
<div>
  <Map store={mapStore} width="100%" height="600px" />

  <div class="controls">
    <label>
      Intensity: {intensity.toFixed(1)}
      <input
        type="range"
        bind:value={intensity}
        min="0"
        max="2"
        step="0.1"
      />
    </label>
  </div>
</div>

<!-- Layer Toggle (skill line 902): the button, typechecked. -->
<button onclick={() => showLayer = !showLayer}>
  {showLayer ? 'Hide' : 'Show'} Layer
</button>

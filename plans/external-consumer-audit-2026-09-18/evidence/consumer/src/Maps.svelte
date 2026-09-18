<script lang="ts">
import { Map, createInitialMapState, mapReducer } from '@composable-svelte/maps';
import { createStore } from '@composable-svelte/core';

const store = createStore({
  initialState: createInitialMapState({
    center: [-74.006, 40.7128],  // NYC
    zoom: 12,
    markers: [
      {
        id: 'marker-1',
        position: [-74.006, 40.7128],
        popup: {
          content: '<h3>New York City</h3>',
          isOpen: true
        }
      }
    ]
  }),
  reducer: mapReducer,
  dependencies: {}
});

</script>
<Map
  {store}
  width="100%"
  height="600px"
/>

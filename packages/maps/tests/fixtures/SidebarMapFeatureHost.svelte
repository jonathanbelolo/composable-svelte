<script lang="ts">
import { getContext } from 'svelte';
import type { PresentationFeatureViewProps, ChildView } from '@composable-svelte/core/application';
import type { MapState, MapAction, MapAdapter } from '../../src/lib/types/map.types.js';
import MapPrimitive from '../../src/lib/components/MapPrimitive.svelte';

let {
  store,
  surface
}: PresentationFeatureViewProps<MapState, MapAction> = $props();

const getSidebarAdapter = getContext<(() => MapAdapter | undefined) | undefined>('getSidebarAdapter');
const adapter = getSidebarAdapter ? getSidebarAdapter() : undefined;
const onCaptureSidebar = getContext<((view: ChildView<MapState, MapAction>) => void) | undefined>('onCaptureSidebar');

$effect(() => {
  onCaptureSidebar?.(store);
});
</script>

<div use:surface data-testid="managed-sidebar-map-feature" style="width: 100%; height: 100%;">
  <MapPrimitive {store} {adapter} />
</div>

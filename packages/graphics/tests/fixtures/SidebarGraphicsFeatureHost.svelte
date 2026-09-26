<script lang="ts">
import { getContext } from 'svelte';
import type { PresentationFeatureViewProps, ChildView } from '@composable-svelte/core/application';
import type { GraphicsState, GraphicsAction } from '../../src/core/types.js';
import type { GraphicsAdapter } from '../../src/core/scene-sync.js';
import Scene from '../../src/components/Scene.svelte';

let {
  store,
  surface
}: PresentationFeatureViewProps<GraphicsState, GraphicsAction> = $props();

const getSidebarAdapter = getContext<(() => GraphicsAdapter) | undefined>('getSidebarAdapter');
const createAdapter = getSidebarAdapter;
const onCaptureSidebar = getContext<((view: ChildView<GraphicsState, GraphicsAction>) => void) | undefined>('onCaptureSidebar');

$effect(() => {
  onCaptureSidebar?.(store);
});
</script>

<div use:surface data-testid="managed-sidebar-graphics-feature" style="width: 100%; height: 100%;">
  <Scene {store} {createAdapter} />
</div>

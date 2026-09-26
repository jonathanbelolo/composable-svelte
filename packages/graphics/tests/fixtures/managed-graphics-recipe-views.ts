import { defineViews } from '@composable-svelte/core/application';
import { composition } from './managed-graphics-recipe-model.js';
import ManagedGraphicsFeatureHost from './ManagedGraphicsFeatureHost.svelte';
import SidebarGraphicsFeatureHost from './SidebarGraphicsFeatureHost.svelte';

export const graphicsViews = defineViews(composition, {
  scene: { render: ManagedGraphicsFeatureHost },
  sidebarScene: { render: SidebarGraphicsFeatureHost }
});

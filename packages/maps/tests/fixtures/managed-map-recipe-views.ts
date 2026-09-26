import { defineViews } from '@composable-svelte/core/application';
import { composition } from './managed-map-recipe-model.js';
import ManagedMapFeatureHost from './ManagedMapFeatureHost.svelte';
import SidebarMapFeatureHost from './SidebarMapFeatureHost.svelte';

export const mapViews = defineViews(composition, {
  map: { render: ManagedMapFeatureHost },
  sidebarMap: { render: SidebarMapFeatureHost }
});

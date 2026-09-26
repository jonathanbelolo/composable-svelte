import { defineViews } from '@composable-svelte/core/application';
import { composition } from './managed-chart-recipe-model.js';
import ManagedChartFeatureHost from './ManagedChartFeatureHost.svelte';
import SidebarChartFeatureHost from './SidebarChartFeatureHost.svelte';

export const chartViews = defineViews(composition, {
  chart: { render: ManagedChartFeatureHost },
  sidebarChart: { render: SidebarChartFeatureHost }
});

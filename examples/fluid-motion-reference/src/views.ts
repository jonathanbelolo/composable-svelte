/** View bindings for the page slot (kept apart from the pure domain in model.ts). */
import { defineViews } from '@composable-svelte/core/application';
import { composition } from './model.js';
import HomeView from './HomeView.svelte';
import DetailView from './DetailView.svelte';
import StudyView from './StudyView.svelte';

export const viewPlan = defineViews(composition, {
  page: {
    cases: {
      home: { render: HomeView },
      detail: { render: DetailView },
      study: { render: StudyView }
    }
  },
  // The pavilion model has no view of its own: pages render it through the shared scene context.
  scene: { headless: true }
});

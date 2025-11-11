/**
 * Client-side entry point.
 *
 * This hydrates the server-rendered HTML and makes the application interactive.
 */

import { hydrate as hydrateComponent } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import { syncBrowserHistory } from '@composable-svelte/core/routing';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import type { AppState, AppAction } from '../shared/types';
import { parseDestinationFromURL, destinationURL } from '../shared/routing';

/**
 * Client-side dependencies.
 * These provide the real implementations for effects.
 */
const clientDependencies: AppDependencies = {
  fetchPosts: async () => {
    // In a real app, this would fetch from an API
    // For this example, we'll just return empty array
    // (the data is already loaded via SSR)
    return [];
  },
  fetchComments: async (postId: number) => {
    // In a real app, this would fetch from an API
    // For this example, return empty (comments loaded via SSR)
    return [];
  }
};

/**
 * Hydrate the application.
 */
function hydrate() {
  try {
    // 1. Read serialized state from the server
    const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');

    if (!stateElement || !stateElement.textContent) {
      throw new Error('No hydration data found. Server-side rendering may have failed.');
    }

    // 2. Hydrate the store with client dependencies
    const store = hydrateStore<AppState, AppAction, AppDependencies>(
      stateElement.textContent,
      {
        reducer: appReducer,
        dependencies: clientDependencies
      }
    );

    // 3. Sync browser history with state (URL routing!)
    // When destination changes → update URL
    // When user clicks back/forward → dispatch navigate action
    syncBrowserHistory(store, {
      // Parse URL path to destination
      parse: parseDestinationFromURL,
      // Serialize state to URL
      serialize: (state) => destinationURL(state.destination),
      // Map destination → action for back/forward navigation
      destinationToAction: (dest) => {
        if (dest) {
          return { type: 'navigate', destination: dest };
        }
        // If no destination, navigate to list
        return { type: 'navigate', destination: { type: 'list' } };
      }
    });

    // 4. Hydrate the app (reuse existing DOM from SSR)
    const app = hydrateComponent(App, {
      target: document.body,
      props: { store }
    });

    // Log successful hydration
    console.log('✅ Composable Svelte hydrated successfully with URL routing');

    // Cleanup on unmount (for HMR during development)
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        app.$destroy?.();
      });
    }
  } catch (error) {
    console.error('❌ Hydration failed:', error);

    // Show error to user
    document.body.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: #fee;
        color: #c00;
        font-family: monospace;
        padding: 2rem;
      ">
        <div>
          <h1>Hydration Error</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    `;
  }
}

// Start hydration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}

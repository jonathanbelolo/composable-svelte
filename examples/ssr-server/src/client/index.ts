/**
 * Client-side entry point.
 *
 * This hydrates the server-rendered HTML and makes the application interactive.
 */

import { hydrate as hydrateComponent, unmount } from 'svelte';
import { hydrateStore } from '@composable-svelte/core/ssr';
import { syncBrowserHistory } from '@composable-svelte/core/routing';
import { createLocalStorage } from '@composable-svelte/core/dependencies';
import { BundledTranslationLoader, createStaticLocaleDetector, browserDOM } from '@composable-svelte/core/i18n';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import type { AppState, AppAction } from '../shared/types';
import { parseDestinationFromURL, extractLocaleAndCleanPath, supportedLocale } from '../shared/routing';

// Import translation files
import enTranslations from '../locales/en/common.json';
import frTranslations from '../locales/fr/common.json';
import esTranslations from '../locales/es/common.json';

/**
 * Create translation loader with bundled translations
 */
const translationLoader = new BundledTranslationLoader({
  bundles: {
    en: { common: enTranslations },
    fr: { common: frTranslations },
    es: { common: esTranslations }
  }
});

/**
 * Hydrate the application.
 */
async function hydrate() {
  let releaseOwnedStore: (() => void) | undefined;
  try {
    // 1. Read serialized state from the server
    const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');

    if (!stateElement || !stateElement.textContent) {
      throw new Error('No hydration data found. Server-side rendering may have failed.');
    }

    // 2. Parse the state to get the locale
    const parsedState = JSON.parse(stateElement.textContent) as AppState;
    const locale = parsedState.i18n.currentLocale;

    // 3. Client storage that persists the locale to localStorage.
    //    `createLocalStorage` is the library's own implementation of the
    //    `Storage` interface `I18nDependencies` asks for.
    const clientStorage = createLocalStorage<string>();

    // Create i18n dependencies (same as server)
    const i18nDependencies = {
      translationLoader,
      localeDetector: createStaticLocaleDetector(locale, ['en', 'fr', 'es']),
      storage: clientStorage,
      dom: browserDOM
    };

    // 4. Hydrate the store with client dependencies
    const store = hydrateStore<AppState, AppAction, AppDependencies>(
      stateElement.textContent,
      {
        reducer: appReducer,
        dependencies: {
          // Read-only demo snapshot, not a persistence or network API.
          fetchPosts: async () => parsedState.posts,
          fetchComments: async (postId: number) => parsedState.comments.filter(comment => comment.postId === postId),
          ...i18nDependencies
        } satisfies AppDependencies
      }
    );

    // 5. Sync browser history with state (URL routing!)
    // When destination changes → update URL
    // When user clicks back/forward → dispatch navigate action
    let cleanupHistory: (() => void) | undefined;
    releaseOwnedStore = () => {
      try { cleanupHistory?.(); } finally { store.destroy(); }
    };
    cleanupHistory = syncBrowserHistory(store, {
      parse: path => ({ destination: parseDestinationFromURL(path), ...extractLocaleAndCleanPath(path) }),
      parseQuery: search => search,
      destinationToAction: (route, query: unknown): AppAction | null => route ? {
        type: 'historyNavigated',
        destination: route.destination,
        locale: route.locale ?? supportedLocale(new URLSearchParams(typeof query === 'string' ? query : '').get('lang')) ?? locale,
        search: typeof query === 'string' ? query : ''
      } : null
    });

    // 6. Hydrate the app (reuse existing DOM from SSR)
    const app = hydrateComponent(App, {
      target: document.body,
      props: { store }
    });

    // Log successful hydration
    console.log('✅ Composable Svelte hydrated successfully with URL routing and i18n');

    // Cleanup on unmount (for HMR during development)
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        releaseOwnedStore?.();
        void unmount(app);
      });
    }
  } catch (error) {
    releaseOwnedStore?.();
    console.error('❌ Hydration failed:', error);

    // Show error to user. Built as DOM nodes rather than an innerHTML template
    // so the message — which can carry server-influenced text — is never parsed
    // as markup.
    const shell = document.createElement('div');
    shell.setAttribute(
      'style',
      'display:flex;align-items:center;justify-content:center;min-height:100vh;' +
        'background:#fee;color:#c00;font-family:monospace;padding:2rem;'
    );
    const inner = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = 'Hydration Error';
    const detail = document.createElement('p');
    detail.textContent = error instanceof Error ? error.message : 'Unknown error';
    inner.append(heading, detail);
    shell.append(inner);
    document.body.replaceChildren(shell);
  }
}

// Start hydration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate);
} else {
  hydrate();
}

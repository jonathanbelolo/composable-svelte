<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';
  import { destinationURL } from './routing';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  // Get current locale and available locales
  const currentLocale = $derived($store.i18n.currentLocale);
  const availableLocales = $derived($store.i18n.availableLocales);

  // Get the base path from the current destination (works server-side and client-side)
  const basePath = $derived(destinationURL($store.destination));

  // Language names
  const languageNames: Record<string, string> = {
    en: 'English',
    fr: 'Français',
    es: 'Español'
  };

  // Get the URL for a given locale
  // Prefixes the base path with the locale (except for English which has no prefix)
  function getLocaleURL(locale: string): string {
    return locale === 'en' ? basePath : `/${locale}${basePath}`;
  }
</script>

<div class="language-switcher">
  <span class="label">Language:</span>
  <div class="language-links">
    {#each availableLocales as locale}
      <a
        href={getLocaleURL(locale)}
        class="language-link"
        class:active={locale === currentLocale}
        aria-current={locale === currentLocale ? 'page' : undefined}
      >
        {languageNames[locale] || locale}
      </a>
    {/each}
  </div>
</div>

<style>
  .language-switcher {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f5f5f5;
    border-radius: 6px;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
  }

  .language-links {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .language-link {
    display: inline-block;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #555;
    text-decoration: none;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .language-link:hover {
    background: #e8f4ff;
    color: #0066cc;
    border-color: #0066cc;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .language-link.active {
    background: #0066cc;
    color: white;
    border-color: #0066cc;
    font-weight: 600;
  }

  .language-link:focus {
    outline: 2px solid #0066cc;
    outline-offset: 2px;
  }

  .language-link:active {
    transform: translateY(0);
  }
</style>

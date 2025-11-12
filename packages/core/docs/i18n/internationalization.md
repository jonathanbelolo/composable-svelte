# Internationalization (i18n)

Composable Svelte provides a complete internationalization system built on ICU MessageFormat with full SSR/SSG support.

## Overview

The i18n system integrates seamlessly with the Composable Architecture:
- **State-driven**: Locale and translations are part of your app state
- **Type-safe**: Full TypeScript support with autocompletion
- **SSR/SSG ready**: Server-side locale detection and static generation
- **Framework formatters**: Automatic date, number, and currency formatting

## Quick Start

### Installation

i18n is included in `@composable-svelte/core`:

```bash
pnpm add @composable-svelte/core
```

### Basic Setup

```typescript
import { createStore } from '@composable-svelte/core';
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createBrowserLocaleDetector,
  browserDOM
} from '@composable-svelte/core/i18n';

// 1. Import translations
import enTranslations from './locales/en/common.json';
import frTranslations from './locales/fr/common.json';

// 2. Create translation loader
const translationLoader = new BundledTranslationLoader({
  bundles: {
    en: { common: enTranslations },
    fr: { common: frTranslations }
  }
});

// 3. Initialize i18n state
const i18nState = createInitialI18nState('en', ['en', 'fr'], 'en');

// 4. Create store with i18n
const store = createStore({
  initialState: {
    // ... your state
    i18n: i18nState
  },
  reducer: appReducer,
  dependencies: {
    // ... your dependencies
    translationLoader,
    localeDetector: createBrowserLocaleDetector(['en', 'fr']),
    storage: localStorage,
    dom: browserDOM
  }
});
```

### Translation Files

Create JSON files in `src/locales/{locale}/{namespace}.json`:

**`locales/en/common.json`**:
```json
{
  "welcome": "Welcome",
  "greeting": "Hello, {name}!",
  "items": "{count, plural, =0 {No items} one {# item} other {# items}}"
}
```

**`locales/fr/common.json`**:
```json
{
  "welcome": "Bienvenue",
  "greeting": "Bonjour, {name} !",
  "items": "{count, plural, =0 {Aucun article} one {# article} other {# articles}}"
}
```

## Using Translations

### In Components

```svelte
<script lang="ts">
  import { createTranslator } from '@composable-svelte/core/i18n';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  // Create translator bound to current locale
  const t = $derived(createTranslator($store.i18n, 'common'));
</script>

<h1>{t('welcome')}</h1>
<p>{t('greeting', { name: 'Alice' })}</p>
<span>{t('items', { count: 5 })}</span>
```

### With Formatters

Use framework formatters for automatic locale-aware formatting:

```svelte
<script lang="ts">
  import { createTranslator, createFormatters } from '@composable-svelte/core/i18n';

  const t = $derived(createTranslator($store.i18n, 'common'));
  const formatters = $derived(createFormatters($store.i18n));

  const date = new Date('2025-01-15');
  const price = 29.99;
</script>

<!-- Date: "January 15, 2025" (en) or "15 janvier 2025" (fr) -->
<p>{formatters.date(date)}</p>

<!-- Number: "1,234.56" (en) or "1 234,56" (fr) -->
<p>{formatters.number(1234.56)}</p>

<!-- Currency: "$29.99" (en) or "29,99 €" (fr) -->
<p>{formatters.currency(price, 'USD')}</p>

<!-- Relative time: "2 hours ago" (en) or "il y a 2 heures" (fr) -->
<p>{formatters.relativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000))}</p>
```

## ICU MessageFormat

The i18n system supports full ICU MessageFormat syntax:

### Variables

```json
{
  "greeting": "Hello, {name}!"
}
```

```typescript
t('greeting', { name: 'Alice' }) // "Hello, Alice!"
```

### Plurals

```json
{
  "items": "{count, plural, =0 {No items} one {# item} other {# items}}"
}
```

```typescript
t('items', { count: 0 }) // "No items"
t('items', { count: 1 }) // "1 item"
t('items', { count: 5 }) // "5 items"
```

### Select

```json
{
  "gender": "{gender, select, male {He} female {She} other {They}} replied"
}
```

```typescript
t('gender', { gender: 'male' })   // "He replied"
t('gender', { gender: 'female' }) // "She replied"
t('gender', { gender: 'other' })  // "They replied"
```

## Locale Switching

### Add Locale Switcher

```svelte
<script lang="ts">
  const availableLocales = ['en', 'fr', 'es'];
  const currentLocale = $derived($store.i18n.currentLocale);

  function switchLocale(locale: string) {
    store.dispatch({
      type: 'i18n',
      action: {
        type: 'setLocale',
        locale
      }
    });
  }
</script>

<div class="language-switcher">
  {#each availableLocales as locale}
    <button
      onclick={() => switchLocale(locale)}
      class:active={locale === currentLocale}
    >
      {locale.toUpperCase()}
    </button>
  {/each}
</div>
```

### Handle Locale Changes in Reducer

```typescript
import { i18nReducer } from '@composable-svelte/core/i18n';

function appReducer(
  state: AppState,
  action: AppAction,
  deps: AppDependencies
): [AppState, Effect<AppAction>] {
  // Handle i18n actions
  if (action.type === 'i18n') {
    const [i18nState, i18nEffect] = i18nReducer(
      state.i18n,
      action.action,
      {
        translationLoader: deps.translationLoader,
        localeDetector: deps.localeDetector,
        storage: deps.storage,
        dom: deps.dom
      }
    );

    return [
      { ...state, i18n: i18nState },
      Effect.map(i18nEffect, (a) => ({ type: 'i18n', action: a }))
    ];
  }

  // ... other actions
}
```

## Namespace Loading

Load translations on demand for better performance:

### Load Namespace

```typescript
// Dispatch load action
store.dispatch({
  type: 'i18n',
  action: {
    type: 'loadNamespace',
    namespace: 'settings',
    locale: 'en' // optional, defaults to current locale
  }
});
```

### Check Loading State

```svelte
<script>
  import { isNamespaceLoading, isNamespaceLoaded } from '@composable-svelte/core/i18n';

  const isLoading = $derived(isNamespaceLoading($store.i18n, 'settings'));
  const isLoaded = $derived(isNamespaceLoaded($store.i18n, 'settings'));
</script>

{#if isLoading}
  <p>Loading translations...</p>
{:else if isLoaded}
  <p>{t('settings:title')}</p>
{/if}
```

## SSR Integration

### Server-Side Setup

```typescript
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createStaticLocaleDetector,
  serverDOM
} from '@composable-svelte/core/i18n';

// Detect locale from request
function detectLocale(request: any): string {
  // 1. Check query param (?lang=fr)
  const queryLang = request.query?.lang;
  if (queryLang && ['en', 'fr', 'es'].includes(queryLang)) {
    return queryLang;
  }

  // 2. Check Accept-Language header
  const acceptLanguage = request.headers?.['accept-language'];
  if (acceptLanguage) {
    // Parse and find first supported locale
    // ... parsing logic
  }

  // 3. Default
  return 'en';
}

// Create SSR store
async function renderApp(request, reply) {
  const locale = detectLocale(request);
  const i18nState = createInitialI18nState(locale, ['en', 'fr', 'es'], 'en');

  const translationLoader = new BundledTranslationLoader({
    bundles: {
      en: { common: enTranslations },
      fr: { common: frTranslations },
      es: { common: esTranslations }
    }
  });

  // Preload translations
  const translations = await translationLoader.load('common', locale);
  const updatedI18nState = {
    ...i18nState,
    translations: { [`${locale}:common`]: translations }
  };

  // Mock storage for server (no-op)
  const mockStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    keys: () => [],
    has: () => false,
    clear: () => {}
  };

  const store = createStore({
    initialState: { ...initialState, i18n: updatedI18nState },
    reducer: appReducer,
    dependencies: {
      translationLoader,
      localeDetector: createStaticLocaleDetector(locale, ['en', 'fr', 'es']),
      storage: mockStorage,
      dom: serverDOM
    }
  });

  const html = renderToHTML(App, { store });
  reply.send(html);
}
```

### Client-Side Hydration

```typescript
import {
  BundledTranslationLoader,
  createStaticLocaleDetector,
  browserDOM
} from '@composable-svelte/core/i18n';

async function hydrate() {
  const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
  const parsedState = JSON.parse(stateElement.textContent);
  const locale = parsedState.i18n.currentLocale;

  const translationLoader = new BundledTranslationLoader({
    bundles: {
      en: { common: enTranslations },
      fr: { common: frTranslations },
      es: { common: esTranslations }
    }
  });

  const store = hydrateStore(stateElement.textContent, {
    reducer: appReducer,
    dependencies: {
      translationLoader,
      localeDetector: createStaticLocaleDetector(locale, ['en', 'fr', 'es']),
      storage: localStorage, // Real localStorage on client
      dom: browserDOM
    }
  });

  hydrateComponent(App, { target: document.body, props: { store } });
}
```

## SSG (Static Site Generation)

Generate static pages for each locale:

```typescript
import { generateStaticSite } from '@composable-svelte/core/ssr';

const supportedLocales = ['en', 'fr', 'es'];
const routes = [];

// Generate routes for each locale
for (const locale of supportedLocales) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;

  routes.push({
    path: `${localePrefix}/`,
    getServerProps: async () => {
      const i18nState = await initI18n(locale);
      return { ...initialState, i18n: i18nState };
    }
  });

  // Add more routes...
}

await generateStaticSite(App, {
  routes,
  outDir: './static',
  baseURL: 'https://example.com'
}, {
  reducer: appReducer,
  dependencies: {}
});
```

Result: Static HTML pages for all locales:
- `/index.html` (English)
- `/fr/index.html` (French)
- `/es/index.html` (Spanish)

## Best Practices

### 1. Always Use Framework Formatters

```svelte
<!-- ✅ GOOD: Framework handles locale -->
<script>
  const formatters = $derived(createFormatters($store.i18n));
</script>
<p>{formatters.date(date)}</p>

<!-- ❌ BAD: Manual formatting, ignores locale -->
<p>{date.toLocaleDateString()}</p>
```

### 2. Load Namespaces Progressively

```typescript
// ✅ GOOD: Load only what you need
const t = createTranslator($store.i18n, 'common');

// Load settings namespace when needed
if (!isNamespaceLoaded($store.i18n, 'settings')) {
  store.dispatch({ type: 'i18n', action: { type: 'loadNamespace', namespace: 'settings' } });
}
```

### 3. Use ICU MessageFormat for Plurals

```json
// ✅ GOOD: ICU handles all plural forms
{
  "items": "{count, plural, =0 {No items} one {# item} other {# items}}"
}

// ❌ BAD: Manual plural logic in component
{
  "item": "item",
  "items": "items"
}
```

### 4. Organize Translation Keys

```json
{
  "app.title": "My App",
  "app.description": "Welcome to my app",
  "nav.home": "Home",
  "nav.about": "About",
  "posts.title": "Posts",
  "posts.author": "By {author}",
  "posts.published": "Published {date}"
}
```

## Troubleshooting

### Translations Not Updating

**Problem**: Translations don't change when locale changes.

**Solution**: Ensure you're using `$derived` with `$store`:

```svelte
<!-- ✅ CORRECT -->
<script>
  const t = $derived(createTranslator($store.i18n, 'common'));
</script>

<!-- ❌ WRONG - No reactivity -->
<script>
  const t = createTranslator(store.state.i18n, 'common');
</script>
```

### Missing Translations

**Problem**: Keys show as `[missing: key]`.

**Solution**: Load the namespace first:

```typescript
store.dispatch({
  type: 'i18n',
  action: { type: 'loadNamespace', namespace: 'common' }
});
```

### SSR Locale Detection Not Working

**Problem**: Server always uses default locale.

**Solution**: Check locale detection order:

1. Query parameter (`?lang=fr`)
2. Accept-Language header
3. Cookie (if persisted)
4. Default locale

### Storage Errors in SSR

**Problem**: `localStorage is not defined` on server.

**Solution**: Use mock storage on server:

```typescript
const mockStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  keys: () => [],
  has: () => false,
  clear: () => {}
};
```

## API Reference

### Core Functions

```typescript
// Create initial i18n state
createInitialI18nState(
  currentLocale: string,
  availableLocales: string[],
  defaultLocale: string
): I18nState

// Create translator
createTranslator(
  i18nState: I18nState,
  namespace: string
): (key: string, params?: Record<string, any>) => string

// Create formatters
createFormatters(
  i18nState: I18nState
): BoundFormatters

// Check namespace status
isNamespaceLoaded(i18nState: I18nState, namespace: string): boolean
isNamespaceLoading(i18nState: I18nState, namespace: string): boolean
getLoadedNamespaces(i18nState: I18nState): string[]
```

### Translation Loaders

```typescript
// Bundled translations (import JSON)
new BundledTranslationLoader({
  bundles: {
    en: { common: enTranslations },
    fr: { common: frTranslations }
  }
})

// Fetch translations (load over network)
new FetchTranslationLoader({
  baseURL: '/locales'
})

// Glob translations (Vite import.meta.glob)
new GlobTranslationLoader({
  files: import.meta.glob('./locales/**/*.json')
})
```

### Locale Detectors

```typescript
// Browser locale detection
createBrowserLocaleDetector(supportedLocales: string[])

// Static locale (SSR/SSG)
createStaticLocaleDetector(locale: string, supportedLocales: string[])
```

### Formatters

```typescript
interface BoundFormatters {
  date: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  currency: (value: number, currency: string) => string;
  relativeTime: (date: Date) => string;
}
```

## Next Steps

- **[SSR/SSG Guide](../ssr/server-rendering.md)** - Full server rendering setup
- **[Testing i18n](../core-concepts/testing.md#testing-i18n)** - Test translations
- **[Examples](../../../examples/ssr-server/)** - Multi-locale blog example

## Resources

- [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
- [CLDR Plurals](https://cldr.unicode.org/index/cldr-spec/plural-rules)

# Phase 17: Internationalization (i18n) for Composable Svelte

**Status**: Specification
**Author**: Phase 17 Planning
**Date**: 2025-11-11

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Requirements](#2-goals--requirements)
3. [Architecture](#3-architecture)
4. [Core Types](#4-core-types)
5. [Reducer Pattern](#5-reducer-pattern)
6. [Translation Loading](#6-translation-loading)
7. [SSR Integration](#7-ssr-integration)
8. [LLM Translation Pipeline](#8-llm-translation-pipeline)
9. [Type Safety](#9-type-safety)
10. [Component Integration](#10-component-integration)
11. [Testing](#11-testing)
12. [Examples](#12-examples)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. Overview

This specification defines a **state-of-the-art internationalization (i18n) system** for Composable Svelte that:

- **Integrates deeply with the Composable Architecture** (state, reducers, effects)
- **Supports both client-side and SSR** with no Flash of Incorrect Translation (FOIT)
- **Leverages LLMs** for AI-powered translation generation with human validation
- **Provides type-safe translation keys** via TypeScript
- **Scales to production** with lazy loading, namespaces, and caching

### Key Innovations

1. **Reducer-Driven i18n**: Language switching, translation loading, and locale detection are all actions/effects
2. **LLM Translation Pipeline**: CLI tools that use Claude/GPT to generate translations with human review workflow
3. **Zero-FOIT SSR**: Server pre-renders with correct language, client hydrates seamlessly
4. **Type-Safe Translations**: Auto-generated TypeScript types from translation files
5. **Namespace Architecture**: Lazy-load translations per feature/page for optimal performance

---

## 2. Goals & Requirements

### Functional Requirements

- **FR1**: Support multiple languages with fallback chains (e.g., `pt-BR` → `pt` → `en`)
- **FR2**: Lazy load translation namespaces on demand
- **FR3**: Server-side rendering with correct language (no FOIT)
- **FR4**: Client-side language switching without page reload
- **FR5**: ICU MessageFormat support (pluralization, interpolation, formatting)
- **FR6**: Date, time, number formatting via Intl API
- **FR7**: RTL (right-to-left) language support
- **FR8**: Type-safe translation keys with autocomplete

### LLM Translation Requirements

- **LLM1**: Generate translations using Claude/GPT APIs
- **LLM2**: Preserve placeholders, variables, and formatting
- **LLM3**: Context-aware translations (provide context from codebase)
- **LLM4**: Incremental updates (only translate new/changed keys)
- **LLM5**: Human review workflow with git-based diffs
- **LLM6**: Quality checks (missing keys, placeholder validation, tone consistency)

### Performance Requirements

- **PERF1**: Initial bundle includes only default language + critical namespaces
- **PERF2**: Lazy load additional languages on demand
- **PERF3**: Cache translations in memory and localStorage
- **PERF4**: Minimize re-renders when language changes

### Developer Experience

- **DX1**: Simple API: `t('common.welcome')` for basic translations
- **DX2**: Auto-completion for translation keys in IDEs
- **DX3**: ESLint rules for missing translations
- **DX4**: Hot reload translations in development

---

## 3. Architecture

### 3.1 Component Hierarchy

```
┌─────────────────────────────────────────────┐
│           Application Store                 │
│  ┌────────────────────────────────────────┐ │
│  │        I18n State                      │ │
│  │  - currentLocale: string               │ │
│  │  - translations: Map<ns, translations> │ │
│  │  - loadingNamespaces: Set<string>      │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│         I18n Reducer + Effects              │
│  Actions:                                   │
│  - setLocale(locale)                        │
│  - loadNamespace(ns, locale)                │
│  - namespaceLoaded(ns, translations)        │
│  Effects:                                   │
│  - Load translations from server/bundle     │
│  - Update localStorage preference           │
│  - Update document lang/dir attributes      │
└─────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────┐
│         I18n Dependencies                   │
│  - TranslationLoader (fetch translations)   │
│  - LocaleDetector (browser/server)          │
│  - IntlFormatters (date, number, currency)  │
│  - Storage (persist locale preference)      │
└─────────────────────────────────────────────┘
```

### 3.2 Integration with Composable Architecture

i18n is **not a separate system** but fully integrated into the Composable Architecture:

```typescript
// App state includes i18n
interface AppState {
  i18n: I18nState;
  user: UserState;
  products: ProductState;
  // ... other features
}

// App reducer composes i18n reducer
const appReducer = combineReducers({
  i18n: i18nReducer,
  user: userReducer,
  products: productReducer
});

// Components use store for translations
const state = $derived($store);
const t = $derived(createTranslator(state.i18n, 'common'));
```

---

## 4. Core Types

### 4.1 I18n State

```typescript
/**
 * I18n state managed in the store.
 */
interface I18nState {
  /** Current active locale (e.g., 'en-US', 'pt-BR') */
  currentLocale: string;

  /** Default fallback locale */
  defaultLocale: string;

  /** All available locales in the app */
  availableLocales: readonly string[];

  /** Loaded translation namespaces */
  translations: Record<string, TranslationNamespace>;

  /** Namespaces currently being loaded */
  loadingNamespaces: Set<string>;

  /** Fallback chain for current locale (e.g., ['pt-BR', 'pt', 'en']) */
  fallbackChain: readonly string[];

  /** Text direction for current locale */
  direction: 'ltr' | 'rtl';
}

/**
 * Translation namespace (e.g., 'common', 'products', 'checkout')
 */
type TranslationNamespace = Record<string, string | TranslationFunction>;

/**
 * Function-based translation (for complex ICU messages)
 */
type TranslationFunction = (params: Record<string, any>) => string;
```

### 4.2 I18n Actions

```typescript
/**
 * All i18n actions are part of the app's action union.
 */
type I18nAction =
  | {
      type: 'i18n/setLocale';
      locale: string;
      /** Optional: preload namespaces for new locale */
      preloadNamespaces?: string[];
    }
  | {
      type: 'i18n/loadNamespace';
      namespace: string;
      locale: string;
    }
  | {
      type: 'i18n/namespaceLoaded';
      namespace: string;
      locale: string;
      translations: TranslationNamespace;
    }
  | {
      type: 'i18n/namespaceLoadFailed';
      namespace: string;
      locale: string;
      error: Error;
    }
  | {
      type: 'i18n/setDirection';
      direction: 'ltr' | 'rtl';
    };
```

### 4.3 I18n Dependencies

```typescript
/**
 * Injectable dependencies for i18n.
 */
interface I18nDependencies {
  /** Load translations from server/bundle */
  translationLoader: TranslationLoader;

  /** Detect user's preferred locale */
  localeDetector: LocaleDetector;

  /** Format dates, numbers, currencies */
  formatters: IntlFormatters;

  /** Persist locale preference */
  storage: Storage;
}

interface TranslationLoader {
  /**
   * Load a translation namespace for a locale.
   * Returns null if namespace doesn't exist.
   */
  load(namespace: string, locale: string): Promise<TranslationNamespace | null>;

  /**
   * Preload multiple namespaces in parallel.
   */
  preload(namespaces: string[], locale: string): Promise<void>;
}

interface LocaleDetector {
  /**
   * Detect user's preferred locale from:
   * - URL parameter (?lang=pt-BR)
   * - Cookie
   * - Browser Accept-Language header
   * - Default locale
   */
  detect(): string;

  /**
   * Get list of supported locales for fallback chain.
   */
  getSupportedLocales(): string[];
}

interface IntlFormatters {
  /**
   * Format date according to locale.
   */
  formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions): string;

  /**
   * Format number according to locale.
   */
  formatNumber(num: number, locale: string, options?: Intl.NumberFormatOptions): string;

  /**
   * Format currency according to locale.
   */
  formatCurrency(amount: number, currency: string, locale: string): string;

  /**
   * Format relative time (e.g., "2 hours ago").
   */
  formatRelativeTime(date: Date, locale: string): string;
}
```

---

## 5. Reducer Pattern

### 5.1 I18n Reducer

```typescript
/**
 * I18n reducer handles all locale/translation state changes.
 */
const i18nReducer: Reducer<I18nState, I18nAction, I18nDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'i18n/setLocale': {
      const { locale, preloadNamespaces = [] } = action;

      // Validate locale is supported
      if (!deps.localeDetector.getSupportedLocales().includes(locale)) {
        console.warn(`Unsupported locale: ${locale}, falling back to ${state.defaultLocale}`);
        return [state, Effect.none()];
      }

      // Update state with new locale and fallback chain
      const newState: I18nState = {
        ...state,
        currentLocale: locale,
        fallbackChain: buildFallbackChain(locale, state.defaultLocale),
        direction: getDirection(locale)
      };

      // Effects: persist locale + update DOM + preload namespaces
      const effects: Effect<I18nAction>[] = [
        // Persist to localStorage/cookie
        Effect.fireAndForget(async () => {
          await deps.storage.setItem('locale', locale);
        }),

        // Update document attributes
        Effect.fireAndForget(async () => {
          document.documentElement.lang = locale;
          document.documentElement.dir = newState.direction;
        })
      ];

      // Preload namespaces for new locale
      if (preloadNamespaces.length > 0) {
        effects.push(
          Effect.run<I18nAction>(async (dispatch) => {
            await Promise.all(
              preloadNamespaces.map(ns =>
                dispatch({ type: 'i18n/loadNamespace', namespace: ns, locale })
              )
            );
          })
        );
      }

      return [newState, Effect.batch(...effects)];
    }

    case 'i18n/loadNamespace': {
      const { namespace, locale } = action;

      // Skip if already loaded or loading
      const cacheKey = `${locale}:${namespace}`;
      if (state.translations[cacheKey] || state.loadingNamespaces.has(cacheKey)) {
        return [state, Effect.none()];
      }

      // Mark as loading
      const newState: I18nState = {
        ...state,
        loadingNamespaces: new Set([...state.loadingNamespaces, cacheKey])
      };

      // Effect: load translations
      const effect = Effect.run<I18nAction>(async (dispatch) => {
        try {
          const translations = await deps.translationLoader.load(namespace, locale);

          if (translations) {
            dispatch({
              type: 'i18n/namespaceLoaded',
              namespace,
              locale,
              translations
            });
          } else {
            throw new Error(`Namespace ${namespace} not found for locale ${locale}`);
          }
        } catch (error) {
          dispatch({
            type: 'i18n/namespaceLoadFailed',
            namespace,
            locale,
            error: error as Error
          });
        }
      });

      return [newState, effect];
    }

    case 'i18n/namespaceLoaded': {
      const { namespace, locale, translations } = action;
      const cacheKey = `${locale}:${namespace}`;

      // Remove from loading set and add to translations
      const loadingNamespaces = new Set(state.loadingNamespaces);
      loadingNamespaces.delete(cacheKey);

      return [
        {
          ...state,
          translations: {
            ...state.translations,
            [cacheKey]: translations
          },
          loadingNamespaces
        },
        Effect.none()
      ];
    }

    case 'i18n/namespaceLoadFailed': {
      const { namespace, locale, error } = action;
      const cacheKey = `${locale}:${namespace}`;

      console.error(`Failed to load namespace ${namespace} for ${locale}:`, error);

      // Remove from loading set
      const loadingNamespaces = new Set(state.loadingNamespaces);
      loadingNamespaces.delete(cacheKey);

      return [{ ...state, loadingNamespaces }, Effect.none()];
    }

    case 'i18n/setDirection': {
      return [
        { ...state, direction: action.direction },
        Effect.fireAndForget(async () => {
          document.documentElement.dir = action.direction;
        })
      ];
    }

    default:
      return [state, Effect.none()];
  }
};

/**
 * Build fallback chain for a locale.
 * Example: 'pt-BR' → ['pt-BR', 'pt', 'en']
 */
function buildFallbackChain(locale: string, defaultLocale: string): string[] {
  const chain: string[] = [locale];

  // Add base language if locale has region (pt-BR → pt)
  if (locale.includes('-')) {
    const baseLanguage = locale.split('-')[0];
    chain.push(baseLanguage);
  }

  // Add default locale if not already in chain
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}

/**
 * Determine text direction for locale.
 */
function getDirection(locale: string): 'ltr' | 'rtl' {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  const language = locale.split('-')[0];
  return rtlLanguages.includes(language) ? 'rtl' : 'ltr';
}
```

---

## 6. Translation Loading

### 6.1 Namespace Architecture

Translations are organized into **namespaces** for lazy loading:

```
locales/
├── en/
│   ├── common.json          # Shared strings (header, footer, buttons)
│   ├── auth.json            # Authentication (login, signup, forgot password)
│   ├── products.json        # Product catalog
│   ├── checkout.json        # Checkout flow
│   └── admin.json           # Admin panel
├── pt/
│   ├── common.json
│   ├── auth.json
│   └── products.json
└── es/
    ├── common.json
    └── auth.json
```

**Benefits**:
- Only load translations for current page/feature
- Reduce initial bundle size
- Parallel loading of multiple namespaces
- Independent updates per namespace

### 6.2 Translation Loader Implementation

```typescript
/**
 * Browser-based translation loader (fetch from /locales/).
 */
export class FetchTranslationLoader implements TranslationLoader {
  private cache = new Map<string, TranslationNamespace>();

  constructor(private baseURL: string = '/locales') {}

  async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
    const cacheKey = `${locale}:${namespace}`;

    // Check memory cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Fetch from server
    try {
      const url = `${this.baseURL}/${locale}/${namespace}.json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const translations = await response.json();

      // Cache in memory
      this.cache.set(cacheKey, translations);

      return translations;
    } catch (error) {
      console.error(`Failed to load ${namespace} for ${locale}:`, error);
      return null;
    }
  }

  async preload(namespaces: string[], locale: string): Promise<void> {
    await Promise.all(
      namespaces.map(ns => this.load(ns, locale))
    );
  }
}

/**
 * Bundle-based loader for SSR/critical namespaces.
 */
export class BundledTranslationLoader implements TranslationLoader {
  constructor(
    private bundles: Record<string, Record<string, TranslationNamespace>>
  ) {}

  async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
    return this.bundles[locale]?.[namespace] ?? null;
  }

  async preload(namespaces: string[], locale: string): Promise<void> {
    // Already bundled, nothing to do
  }
}
```

### 6.3 Translation Function

```typescript
/**
 * Get translation function for a namespace.
 */
export function createTranslator(
  i18nState: I18nState,
  namespace: string
): TranslationFunction {
  return (key: string, params?: Record<string, any>) => {
    // Try each locale in fallback chain
    for (const locale of i18nState.fallbackChain) {
      const cacheKey = `${locale}:${namespace}`;
      const translations = i18nState.translations[cacheKey];

      if (translations && key in translations) {
        const value = translations[key];

        // If it's a function (ICU message), call it with params
        if (typeof value === 'function') {
          return value(params ?? {});
        }

        // Otherwise interpolate params into string
        return interpolate(value, params ?? {});
      }
    }

    // Fallback: return key if translation not found
    console.warn(`Translation missing: ${namespace}.${key}`);
    return key;
  };
}

/**
 * Simple interpolation: "Hello {name}" + { name: "Alice" } → "Hello Alice"
 */
function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}
```

---

## 7. SSR Integration

### 7.1 Server-Side Locale Detection

```typescript
/**
 * Fastify plugin for locale detection.
 */
export function fastifyI18n(
  fastify: any,
  options: {
    supportedLocales: string[];
    defaultLocale: string;
  }
) {
  fastify.decorateRequest('locale', null);

  fastify.addHook('onRequest', async (request: any, reply: any) => {
    // 1. Check URL parameter: ?lang=pt-BR
    const urlLang = request.query.lang;
    if (urlLang && options.supportedLocales.includes(urlLang)) {
      request.locale = urlLang;
      return;
    }

    // 2. Check cookie: locale=pt-BR
    const cookieLang = request.cookies.locale;
    if (cookieLang && options.supportedLocales.includes(cookieLang)) {
      request.locale = cookieLang;
      return;
    }

    // 3. Parse Accept-Language header
    const acceptLanguage = request.headers['accept-language'];
    if (acceptLanguage) {
      const preferred = parseAcceptLanguage(acceptLanguage, options.supportedLocales);
      if (preferred) {
        request.locale = preferred;
        return;
      }
    }

    // 4. Fallback to default
    request.locale = options.defaultLocale;
  });
}

/**
 * Parse Accept-Language header and return best match.
 */
function parseAcceptLanguage(
  header: string,
  supported: string[]
): string | null {
  // Parse: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  const languages = header
    .split(',')
    .map(lang => {
      const [locale, qPart] = lang.trim().split(';');
      const q = qPart ? parseFloat(qPart.split('=')[1]) : 1.0;
      return { locale, q };
    })
    .sort((a, b) => b.q - a.q);

  // Find first supported locale (exact match or base language match)
  for (const { locale } of languages) {
    if (supported.includes(locale)) return locale;

    const base = locale.split('-')[0];
    const match = supported.find(s => s.startsWith(base));
    if (match) return match;
  }

  return null;
}
```

### 7.2 Server-Side Rendering with Translations

```typescript
/**
 * SSR route handler with i18n.
 */
app.get('/', async (req, res) => {
  const locale = req.locale; // From fastifyI18n middleware

  // Load critical namespaces for this route
  const translationLoader = new BundledTranslationLoader({
    [locale]: {
      common: await import(`../locales/${locale}/common.json`),
      home: await import(`../locales/${locale}/home.json`)
    }
  });

  // Create store with i18n state
  const store = createStore({
    initialState: {
      i18n: {
        currentLocale: locale,
        defaultLocale: 'en',
        availableLocales: ['en', 'pt', 'es', 'fr'],
        translations: {
          [`${locale}:common`]: await translationLoader.load('common', locale),
          [`${locale}:home`]: await translationLoader.load('home', locale)
        },
        loadingNamespaces: new Set(),
        fallbackChain: buildFallbackChain(locale, 'en'),
        direction: getDirection(locale)
      },
      // ... other state
    },
    reducer: appReducer,
    dependencies: {
      translationLoader,
      // ... other dependencies
    }
  });

  // Render to HTML
  const html = renderToHTML(App, { store });

  // Serialize state for hydration
  const stateScript = buildHydrationScript(serializeStore(store));

  // Build full HTML with correct lang attribute
  const fullHTML = `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${getDirection(locale)}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My App</title>
      </head>
      <body>
        <div id="app">${html}</div>
        ${stateScript}
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  `;

  res.type('text/html').send(fullHTML);
});
```

### 7.3 Client Hydration

```typescript
/**
 * Client entry point with hydration.
 */
import { hydrateStore } from '@composable-svelte/core/ssr';
import { mount } from 'svelte';
import App from './App.svelte';

// Hydrate store from server state
const stateJSON = document.getElementById('__COMPOSABLE_SVELTE_STATE__')?.textContent;

const store = hydrateStore<AppState, AppAction>(stateJSON, {
  reducer: appReducer,
  dependencies: {
    // Switch to fetch-based loader on client
    translationLoader: new FetchTranslationLoader('/locales'),
    localeDetector: new BrowserLocaleDetector(),
    formatters: new IntlFormatters(),
    storage: localStorage
  }
});

// Mount app
mount(App, { target: document.body, props: { store } });
```

**Zero-FOIT Guarantee**:
1. Server detects locale from headers/cookies
2. Server pre-loads critical namespaces
3. Server renders HTML with correct translations
4. Client hydrates with same state (no flash, no re-render)
5. Client lazy-loads additional namespaces on navigation

---

## 8. LLM Translation Pipeline

### 8.1 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Developer Workflow                     │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  1. Extract new/changed keys from en/common.json         │
│     (compare with previous version via git diff)         │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  2. Generate translations via LLM (Claude/GPT)           │
│     - Load context from codebase (where key is used)     │
│     - Preserve placeholders: {name}, {count}, etc.       │
│     - Apply tone/style guidelines from .i18nrc           │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  3. Quality checks                                        │
│     - Validate placeholders match source                 │
│     - Check for missing keys                             │
│     - Flag potential issues (length, tone)               │
└──────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────┐
│  4. Create review branch: i18n/update-pt-2025-11-11      │
│     - Git diff shows what changed                        │
│     - Human reviewers validate translations              │
│     - Approve → merge → translations go live             │
└──────────────────────────────────────────────────────────┘
```

### 8.2 CLI Tool: `composable-svelte i18n`

```bash
# Initialize i18n configuration
pnpm composable-svelte i18n init

# Generate translations for all languages
pnpm composable-svelte i18n translate --all

# Generate translations for specific language
pnpm composable-svelte i18n translate --locale pt-BR

# Update translations (only new/changed keys)
pnpm composable-svelte i18n update --locale pt-BR

# Validate translations
pnpm composable-svelte i18n validate

# Show translation coverage
pnpm composable-svelte i18n coverage
```

### 8.3 Configuration File: `.i18nrc.json`

```json
{
  "defaultLocale": "en",
  "supportedLocales": ["en", "pt-BR", "es", "fr", "de", "ja"],
  "localesDir": "./locales",
  "namespaces": ["common", "auth", "products", "checkout", "admin"],

  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "apiKey": "${ANTHROPIC_API_KEY}",
    "maxTokens": 4096,
    "temperature": 0.3
  },

  "translationGuidelines": {
    "tone": "professional and friendly",
    "style": "concise",
    "formality": {
      "pt-BR": "informal",
      "es": "formal",
      "fr": "formal"
    },
    "preserveFormatting": true,
    "contextAware": true
  },

  "review": {
    "enabled": true,
    "createBranch": true,
    "branchPrefix": "i18n/update",
    "assignReviewers": ["translator-team"]
  },

  "quality": {
    "checkPlaceholders": true,
    "checkLength": true,
    "maxLengthDifference": 0.5,
    "warnOnMissingKeys": true
  }
}
```

### 8.4 LLM Translation Implementation

```typescript
/**
 * LLM-powered translation generator.
 */
export class LLMTranslator {
  constructor(private config: I18nConfig) {}

  /**
   * Translate a namespace from source locale to target locale.
   */
  async translateNamespace(
    namespace: string,
    sourceLocale: string,
    targetLocale: string,
    keysToTranslate?: string[]
  ): Promise<TranslationNamespace> {
    // Load source translations
    const sourceTranslations = await this.loadTranslations(namespace, sourceLocale);

    // Load existing target translations (for incremental updates)
    const existingTranslations = await this.loadTranslations(namespace, targetLocale);

    // Determine which keys need translation
    const keys = keysToTranslate ?? Object.keys(sourceTranslations);
    const keysToUpdate = keys.filter(key =>
      !existingTranslations[key] || this.hasSourceChanged(key, sourceTranslations, existingTranslations)
    );

    if (keysToUpdate.length === 0) {
      console.log(`No updates needed for ${namespace} (${targetLocale})`);
      return existingTranslations;
    }

    console.log(`Translating ${keysToUpdate.length} keys from ${sourceLocale} to ${targetLocale}...`);

    // Load context for each key (where it's used in code)
    const contexts = await this.loadContexts(namespace, keysToUpdate);

    // Generate translations via LLM
    const newTranslations = await this.generateTranslations(
      keysToUpdate,
      sourceTranslations,
      targetLocale,
      contexts
    );

    // Merge with existing translations
    return {
      ...existingTranslations,
      ...newTranslations
    };
  }

  /**
   * Generate translations using Claude/GPT.
   */
  private async generateTranslations(
    keys: string[],
    sourceTranslations: TranslationNamespace,
    targetLocale: string,
    contexts: Record<string, string>
  ): Promise<TranslationNamespace> {
    const guidelines = this.config.translationGuidelines;
    const formality = guidelines.formality[targetLocale] ?? 'neutral';

    // Build prompt for LLM
    const prompt = this.buildTranslationPrompt(
      keys,
      sourceTranslations,
      targetLocale,
      formality,
      contexts
    );

    // Call LLM API
    const response = await this.callLLM(prompt);

    // Parse JSON response
    const translations = JSON.parse(response);

    // Validate translations
    this.validateTranslations(translations, sourceTranslations);

    return translations;
  }

  /**
   * Build LLM prompt with context and guidelines.
   */
  private buildTranslationPrompt(
    keys: string[],
    sourceTranslations: TranslationNamespace,
    targetLocale: string,
    formality: string,
    contexts: Record<string, string>
  ): string {
    const guidelines = this.config.translationGuidelines;

    // Build source strings with context
    const sourceStrings = keys.map(key => ({
      key,
      source: sourceTranslations[key],
      context: contexts[key] || 'No context available'
    }));

    return `You are a professional translator. Translate the following strings from English to ${targetLocale}.

**Translation Guidelines**:
- Tone: ${guidelines.tone}
- Style: ${guidelines.style}
- Formality: ${formality}
- CRITICAL: Preserve all placeholders exactly as they appear (e.g., {name}, {count}, {date})
- CRITICAL: Preserve all HTML tags if present
- Be context-aware: use the provided code context to understand meaning

**Format**: Return ONLY a JSON object with keys mapped to translated values. No explanation.

**Strings to translate**:

${sourceStrings.map((s, i) => `
${i + 1}. Key: "${s.key}"
   Source: "${s.source}"
   Context: ${s.context}
`).join('\n')}

**Output format**:
{
  "key1": "translated value 1",
  "key2": "translated value 2",
  ...
}`;
  }

  /**
   * Call LLM API (Anthropic or OpenAI).
   */
  private async callLLM(prompt: string): Promise<string> {
    const { provider, model, apiKey, maxTokens, temperature } = this.config.llm;

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      return data.content[0].text;
    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  /**
   * Validate translations match source structure.
   */
  private validateTranslations(
    translations: TranslationNamespace,
    sourceTranslations: TranslationNamespace
  ): void {
    for (const [key, sourceValue] of Object.entries(sourceTranslations)) {
      if (!translations[key]) {
        throw new Error(`Missing translation for key: ${key}`);
      }

      // Extract placeholders from source
      const sourcePlaceholders = this.extractPlaceholders(String(sourceValue));
      const translatedPlaceholders = this.extractPlaceholders(String(translations[key]));

      // Validate placeholders match
      if (!this.placeholdersMatch(sourcePlaceholders, translatedPlaceholders)) {
        throw new Error(
          `Placeholder mismatch for key "${key}":\n` +
          `  Source: ${sourcePlaceholders.join(', ')}\n` +
          `  Translation: ${translatedPlaceholders.join(', ')}`
        );
      }
    }
  }

  /**
   * Extract placeholders from string (e.g., {name}, {count}).
   */
  private extractPlaceholders(text: string): string[] {
    const matches = text.match(/\{(\w+)\}/g);
    return matches ?? [];
  }

  /**
   * Check if placeholder sets match.
   */
  private placeholdersMatch(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
  }

  /**
   * Load code context for translation keys.
   */
  private async loadContexts(
    namespace: string,
    keys: string[]
  ): Promise<Record<string, string>> {
    // Search codebase for usage of each key
    const contexts: Record<string, string> = {};

    for (const key of keys) {
      // Use ripgrep to find usage: t('namespace.key')
      const searchPattern = `t\\(['"]${namespace}\\.${key}['"]\\)`;
      const results = await this.searchCodebase(searchPattern);

      if (results.length > 0) {
        // Extract surrounding lines for context
        contexts[key] = results[0].context;
      }
    }

    return contexts;
  }

  /**
   * Search codebase for pattern.
   */
  private async searchCodebase(pattern: string): Promise<Array<{ file: string; line: number; context: string }>> {
    // Implementation would use ripgrep or similar
    // For now, placeholder
    return [];
  }

  /**
   * Load translations from file system.
   */
  private async loadTranslations(
    namespace: string,
    locale: string
  ): Promise<TranslationNamespace> {
    const path = `${this.config.localesDir}/${locale}/${namespace}.json`;
    try {
      const content = await fs.readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Check if source translation has changed.
   */
  private hasSourceChanged(
    key: string,
    sourceTranslations: TranslationNamespace,
    existingTranslations: TranslationNamespace
  ): boolean {
    // Compare git history to see if source changed
    // For now, simple implementation
    return false;
  }
}
```

### 8.5 Review Workflow

```typescript
/**
 * Create review branch for translation updates.
 */
export async function createReviewBranch(
  namespace: string,
  locale: string,
  translations: TranslationNamespace
): Promise<string> {
  const branchName = `i18n/update-${locale}-${new Date().toISOString().split('T')[0]}`;

  // Create branch
  await exec(`git checkout -b ${branchName}`);

  // Write translations to file
  const path = `locales/${locale}/${namespace}.json`;
  await fs.writeFile(path, JSON.stringify(translations, null, 2));

  // Commit
  await exec(`git add ${path}`);
  await exec(`git commit -m "feat(i18n): Update ${locale} translations for ${namespace}"`);

  // Push and create PR
  await exec(`git push -u origin ${branchName}`);

  console.log(`✅ Review branch created: ${branchName}`);
  console.log(`Please review the changes and merge when ready.`);

  return branchName;
}
```

---

## 9. Type Safety

### 9.1 Generated Types from Translations

```typescript
/**
 * Auto-generate TypeScript types from translation files.
 *
 * Example: locales/en/common.json
 * {
 *   "welcome": "Welcome, {name}!",
 *   "logout": "Logout",
 *   "items": {
 *     "one": "1 item",
 *     "other": "{count} items"
 *   }
 * }
 *
 * Generates:
 * type CommonKeys = 'welcome' | 'logout' | 'items';
 * type CommonParams = {
 *   welcome: { name: string };
 *   logout: never;
 *   items: { count: number };
 * };
 */

// CLI command to generate types
pnpm composable-svelte i18n generate-types

// Generated file: locales/types.ts
export type CommonKeys = 'welcome' | 'logout' | 'items';
export type AuthKeys = 'login' | 'signup' | 'forgotPassword';
// ... for each namespace

export type TranslationParams = {
  common: {
    welcome: { name: string };
    logout: never;
    items: { count: number };
  };
  auth: {
    login: never;
    signup: never;
    forgotPassword: { email: string };
  };
};
```

### 9.2 Type-Safe Translation Function

```typescript
/**
 * Type-safe translation function with autocomplete.
 */
export function createTypedTranslator<Namespace extends keyof TranslationParams>(
  i18nState: I18nState,
  namespace: Namespace
) {
  return <Key extends keyof TranslationParams[Namespace]>(
    key: Key,
    ...params: TranslationParams[Namespace][Key] extends never
      ? []
      : [TranslationParams[Namespace][Key]]
  ): string => {
    const t = createTranslator(i18nState, namespace as string);
    return t(key as string, params[0]);
  };
}

// Usage with full type safety and autocomplete
const t = createTypedTranslator(state.i18n, 'common');

t('welcome', { name: 'Alice' }); // ✅ OK
t('welcome'); // ❌ Error: missing required param 'name'
t('logout'); // ✅ OK (no params)
t('logout', { name: 'Alice' }); // ❌ Error: unexpected param
t('invalidKey'); // ❌ Error: not a valid key
```

---

## 10. Component Integration

### 10.1 Basic Usage in Components

```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';
  import { createTranslator } from '@composable-svelte/core/i18n';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  // Subscribe to i18n state
  const state = $derived($store);

  // Create translator for 'common' namespace
  const t = $derived(createTranslator(state.i18n, 'common'));

  // Formatted values
  const formatters = $derived(state.i18n.formatters);
</script>

<header>
  <h1>{t('welcome', { name: state.user.name })}</h1>
  <button onclick={() => store.dispatch({ type: 'user/logout' })}>
    {t('logout')}
  </button>

  <p>
    Last login: {formatters.formatDate(
      state.user.lastLogin,
      state.i18n.currentLocale,
      { dateStyle: 'medium', timeStyle: 'short' }
    )}
  </p>
</header>
```

### 10.2 Language Switcher Component

```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();
  const state = $derived($store);

  function switchLocale(locale: string) {
    store.dispatch({
      type: 'i18n/setLocale',
      locale,
      preloadNamespaces: ['common'] // Preload common namespace for new locale
    });
  }

  const localeNames: Record<string, string> = {
    'en': 'English',
    'pt-BR': 'Português (Brasil)',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'ja': '日本語'
  };
</script>

<div class="language-switcher">
  <select
    value={state.i18n.currentLocale}
    onchange={(e) => switchLocale(e.currentTarget.value)}
  >
    {#each state.i18n.availableLocales as locale}
      <option value={locale}>
        {localeNames[locale] ?? locale}
      </option>
    {/each}
  </select>

  {#if state.i18n.loadingNamespaces.size > 0}
    <span class="loading">Loading translations...</span>
  {/if}
</div>

<style>
  .language-switcher {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .loading {
    font-size: 0.875rem;
    color: #666;
  }
</style>
```

### 10.3 Lazy Loading Translations on Route Change

```typescript
/**
 * Load namespace when navigating to a route.
 */
const productsReducer: Reducer<ProductsState, ProductsAction, AppDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'products/init': {
      // Load products namespace when entering products page
      const currentLocale = deps.store.state.i18n.currentLocale;

      return [
        { ...state, loading: true },
        Effect.batch(
          // Load products data
          Effect.run(async (dispatch) => {
            const products = await deps.api.getProducts();
            dispatch({ type: 'products/loaded', products });
          }),

          // Load products translations
          Effect.run(async (dispatch) => {
            dispatch({
              type: 'i18n/loadNamespace',
              namespace: 'products',
              locale: currentLocale
            });
          })
        )
      ];
    }

    // ... other cases
  }
};
```

---

## 11. Testing

### 11.1 Testing i18n Reducer

```typescript
import { describe, it, expect } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { i18nReducer, type I18nState, type I18nAction } from '../i18n';

describe('i18nReducer', () => {
  it('should change locale', async () => {
    const store = new TestStore<I18nState, I18nAction>({
      initialState: {
        currentLocale: 'en',
        defaultLocale: 'en',
        availableLocales: ['en', 'pt-BR', 'es'],
        translations: {},
        loadingNamespaces: new Set(),
        fallbackChain: ['en'],
        direction: 'ltr'
      },
      reducer: i18nReducer,
      dependencies: {
        translationLoader: mockTranslationLoader,
        localeDetector: mockLocaleDetector,
        formatters: mockFormatters,
        storage: mockStorage
      }
    });

    await store.send(
      { type: 'i18n/setLocale', locale: 'pt-BR' },
      (state) => {
        expect(state.currentLocale).toBe('pt-BR');
        expect(state.fallbackChain).toEqual(['pt-BR', 'pt', 'en']);
        expect(state.direction).toBe('ltr');
      }
    );

    // Verify locale was persisted
    expect(mockStorage.setItem).toHaveBeenCalledWith('locale', 'pt-BR');
  });

  it('should load namespace', async () => {
    const store = new TestStore<I18nState, I18nAction>({
      initialState: createInitialState(),
      reducer: i18nReducer,
      dependencies: {
        translationLoader: {
          load: async (ns, locale) => {
            if (ns === 'common' && locale === 'en') {
              return { welcome: 'Welcome!', logout: 'Logout' };
            }
            return null;
          }
        },
        // ... other deps
      }
    });

    await store.send(
      { type: 'i18n/loadNamespace', namespace: 'common', locale: 'en' },
      (state) => {
        expect(state.loadingNamespaces.has('en:common')).toBe(true);
      }
    );

    await store.receive(
      {
        type: 'i18n/namespaceLoaded',
        namespace: 'common',
        locale: 'en',
        translations: { welcome: 'Welcome!', logout: 'Logout' }
      },
      (state) => {
        expect(state.translations['en:common']).toEqual({
          welcome: 'Welcome!',
          logout: 'Logout'
        });
        expect(state.loadingNamespaces.has('en:common')).toBe(false);
      }
    );
  });
});
```

### 11.2 Testing Translation Function

```typescript
import { describe, it, expect } from 'vitest';
import { createTranslator } from '../i18n';

describe('createTranslator', () => {
  it('should translate simple strings', () => {
    const i18nState: I18nState = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en'],
      translations: {
        'en:common': {
          welcome: 'Welcome!',
          logout: 'Logout'
        }
      },
      loadingNamespaces: new Set(),
      fallbackChain: ['en'],
      direction: 'ltr'
    };

    const t = createTranslator(i18nState, 'common');

    expect(t('welcome')).toBe('Welcome!');
    expect(t('logout')).toBe('Logout');
  });

  it('should interpolate parameters', () => {
    const i18nState: I18nState = {
      // ... state
      translations: {
        'en:common': {
          welcome: 'Welcome, {name}!',
          items: 'You have {count} items'
        }
      },
      fallbackChain: ['en']
    };

    const t = createTranslator(i18nState, 'common');

    expect(t('welcome', { name: 'Alice' })).toBe('Welcome, Alice!');
    expect(t('items', { count: 5 })).toBe('You have 5 items');
  });

  it('should fallback to next locale in chain', () => {
    const i18nState: I18nState = {
      currentLocale: 'pt-BR',
      fallbackChain: ['pt-BR', 'pt', 'en'],
      translations: {
        'pt-BR:common': {
          welcome: 'Bem-vindo!'
        },
        'en:common': {
          welcome: 'Welcome!',
          logout: 'Logout'
        }
      }
    };

    const t = createTranslator(i18nState, 'common');

    expect(t('welcome')).toBe('Bem-vindo!'); // Found in pt-BR
    expect(t('logout')).toBe('Logout'); // Fell back to en
  });

  it('should return key if translation not found', () => {
    const i18nState: I18nState = {
      fallbackChain: ['en'],
      translations: {
        'en:common': {}
      }
    };

    const t = createTranslator(i18nState, 'common');

    expect(t('missingKey')).toBe('missingKey');
  });
});
```

### 11.3 Testing LLM Translator

```typescript
import { describe, it, expect, vi } from 'vitest';
import { LLMTranslator } from '../llm-translator';

describe('LLMTranslator', () => {
  it('should preserve placeholders', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      welcome: 'Bem-vindo, {name}!',
      items: 'Você tem {count} itens'
    }));

    const translator = new LLMTranslator({
      llm: { provider: 'mock', call: mockLLM },
      // ... config
    });

    const result = await translator.translateNamespace('common', 'en', 'pt-BR', [
      'welcome',
      'items'
    ]);

    expect(result).toEqual({
      welcome: 'Bem-vindo, {name}!',
      items: 'Você tem {count} itens'
    });
  });

  it('should throw error on placeholder mismatch', async () => {
    const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
      welcome: 'Bem-vindo!' // Missing {name} placeholder
    }));

    const translator = new LLMTranslator({
      llm: { provider: 'mock', call: mockLLM },
      // ... config
    });

    await expect(
      translator.translateNamespace('common', 'en', 'pt-BR', ['welcome'])
    ).rejects.toThrow('Placeholder mismatch');
  });
});
```

---

## 12. Examples

### 12.1 Simple Blog with i18n

```svelte
<!-- BlogPost.svelte -->
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction, BlogPost } from './types';
  import { createTranslator } from '@composable-svelte/core/i18n';

  interface Props {
    store: Store<AppState, AppAction>;
    post: BlogPost;
  }

  let { store, post }: Props = $props();

  const state = $derived($store);
  const t = $derived(createTranslator(state.i18n, 'blog'));
  const formatters = $derived(new IntlFormatters());
</script>

<article>
  <header>
    <h1>{post.title}</h1>
    <p class="meta">
      {t('publishedBy', { author: post.author })}
      {formatters.formatDate(post.publishedAt, state.i18n.currentLocale, {
        dateStyle: 'long'
      })}
    </p>
  </header>

  <div class="content">
    {@html post.content}
  </div>

  <footer>
    <p>
      {t('readingTime', { minutes: post.readingTimeMinutes })}
    </p>
  </footer>
</article>
```

**Translation files**:

`locales/en/blog.json`:
```json
{
  "publishedBy": "Published by {author} on",
  "readingTime": "{minutes} min read"
}
```

`locales/pt-BR/blog.json`:
```json
{
  "publishedBy": "Publicado por {author} em",
  "readingTime": "{minutes} min de leitura"
}
```

### 12.2 E-commerce Checkout with Currency Formatting

```svelte
<!-- CheckoutSummary.svelte -->
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';
  import { createTranslator } from '@composable-svelte/core/i18n';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  const state = $derived($store);
  const t = $derived(createTranslator(state.i18n, 'checkout'));
  const formatters = $derived(new IntlFormatters());

  const cart = $derived(state.cart);
  const locale = $derived(state.i18n.currentLocale);

  const subtotal = $derived(
    cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
  const tax = $derived(subtotal * 0.1);
  const total = $derived(subtotal + tax);
</script>

<div class="checkout-summary">
  <h2>{t('orderSummary')}</h2>

  <div class="line-items">
    {#each cart.items as item}
      <div class="item">
        <span>{item.name} × {item.quantity}</span>
        <span>{formatters.formatCurrency(item.price * item.quantity, 'USD', locale)}</span>
      </div>
    {/each}
  </div>

  <div class="totals">
    <div class="line">
      <span>{t('subtotal')}</span>
      <span>{formatters.formatCurrency(subtotal, 'USD', locale)}</span>
    </div>
    <div class="line">
      <span>{t('tax')}</span>
      <span>{formatters.formatCurrency(tax, 'USD', locale)}</span>
    </div>
    <div class="line total">
      <span>{t('total')}</span>
      <span>{formatters.formatCurrency(total, 'USD', locale)}</span>
    </div>
  </div>

  <button onclick={() => store.dispatch({ type: 'checkout/submit' })}>
    {t('placeOrder')}
  </button>
</div>
```

**Translation files**:

`locales/en/checkout.json`:
```json
{
  "orderSummary": "Order Summary",
  "subtotal": "Subtotal",
  "tax": "Tax",
  "total": "Total",
  "placeOrder": "Place Order"
}
```

`locales/pt-BR/checkout.json`:
```json
{
  "orderSummary": "Resumo do Pedido",
  "subtotal": "Subtotal",
  "tax": "Imposto",
  "total": "Total",
  "placeOrder": "Finalizar Pedido"
}
```

---

## 13. Implementation Roadmap

### Phase 17.1: Core i18n Architecture (Week 1-2)

**Tasks**:
- [ ] Define core types (`I18nState`, `I18nAction`, `I18nDependencies`)
- [ ] Implement `i18nReducer` with locale switching and namespace loading
- [ ] Implement `createTranslator` with fallback chain
- [ ] Create `TranslationLoader` implementations (fetch, bundled)
- [ ] Create `LocaleDetector` for browser and SSR
- [ ] Write unit tests for reducer and translation function

**Deliverables**:
- `packages/core/src/i18n/types.ts`
- `packages/core/src/i18n/reducer.ts`
- `packages/core/src/i18n/translator.ts`
- `packages/core/src/i18n/loader.ts`
- `packages/core/src/i18n/detector.ts`
- `packages/core/tests/i18n/`

### Phase 17.2: SSR Integration (Week 3)

**Tasks**:
- [ ] Implement `fastifyI18n` middleware for locale detection
- [ ] Add `parseAcceptLanguage` utility
- [ ] Update SSR example with i18n state
- [ ] Test zero-FOIT rendering (server → client hydration)
- [ ] Add examples with multiple languages

**Deliverables**:
- `packages/core/src/ssr/i18n-middleware.ts`
- `examples/ssr-server/` updated with i18n
- `examples/ssr-server/locales/` with sample translations

### Phase 17.3: LLM Translation Pipeline (Week 4-5)

**Tasks**:
- [ ] Create `.i18nrc.json` configuration schema
- [ ] Implement `LLMTranslator` class
- [ ] Build CLI tool: `composable-svelte i18n`
- [ ] Add commands: `init`, `translate`, `update`, `validate`, `coverage`
- [ ] Implement placeholder validation
- [ ] Implement context extraction from codebase
- [ ] Create git-based review workflow
- [ ] Write tests for LLM translator

**Deliverables**:
- `packages/cli/src/commands/i18n/`
- `packages/core/src/i18n/llm-translator.ts`
- `.i18nrc.json` template
- Documentation: `guides/I18N-LLM-WORKFLOW.md`

### Phase 17.4: Type Safety & DX (Week 6)

**Tasks**:
- [ ] Implement type generation from translation files
- [ ] Create `createTypedTranslator` with full type safety
- [ ] Add ESLint rules for missing translations
- [ ] Add hot reload for translations in development
- [ ] Create Svelte component for language switcher
- [ ] Write comprehensive examples

**Deliverables**:
- `packages/core/src/i18n/typed-translator.ts`
- `packages/eslint-plugin/rules/i18n-missing-keys.ts`
- `packages/core/src/i18n/components/LanguageSwitcher.svelte`
- `examples/i18n-demo/` - Full demo app

### Phase 17.5: Intl Formatters & Advanced Features (Week 7)

**Tasks**:
- [ ] Implement `IntlFormatters` for dates, numbers, currencies
- [ ] Add relative time formatting ("2 hours ago")
- [ ] Add ICU MessageFormat support for complex pluralization
- [ ] Add RTL layout support with automatic `dir` attribute
- [ ] Add performance optimizations (memoization, caching)
- [ ] Write performance tests

**Deliverables**:
- `packages/core/src/i18n/formatters.ts`
- `packages/core/src/i18n/icu-message.ts`
- Performance benchmarks

### Phase 17.6: Documentation & Examples (Week 8)

**Tasks**:
- [ ] Write comprehensive i18n guide
- [ ] Document LLM translation workflow
- [ ] Create video tutorial
- [ ] Add i18n to component library (shadcn-svelte)
- [ ] Create real-world example app (e-commerce with i18n)
- [ ] Update main README with i18n section

**Deliverables**:
- `guides/I18N.md`
- `guides/I18N-LLM-WORKFLOW.md`
- `guides/I18N-SSR.md`
- `examples/ecommerce-i18n/` - Full e-commerce app with i18n

---

## Success Criteria

### Functionality

- ✅ Language switching without page reload
- ✅ SSR with correct language (no FOIT)
- ✅ Lazy loading of translation namespaces
- ✅ Fallback chain working correctly
- ✅ LLM translation pipeline generates accurate translations
- ✅ Type-safe translation keys with autocomplete
- ✅ Date/number/currency formatting per locale
- ✅ RTL language support

### Performance

- ✅ Initial bundle < 50KB for i18n code
- ✅ Translation namespace loading < 200ms
- ✅ Language switch < 100ms
- ✅ SSR hydration with no re-render

### Developer Experience

- ✅ Simple API: `t('key')`
- ✅ CLI tool for managing translations
- ✅ Auto-generated types from translations
- ✅ ESLint rules catch missing translations
- ✅ Hot reload translations in dev

### Quality

- ✅ 100% test coverage for core i18n
- ✅ LLM translations validated (placeholders, structure)
- ✅ Git-based review workflow
- ✅ Comprehensive documentation

---

## Conclusion

This specification defines a **production-ready, state-of-the-art i18n system** for Composable Svelte that:

1. **Integrates seamlessly** with the Composable Architecture
2. **Scales to production** with lazy loading and SSR support
3. **Leverages AI** for rapid translation generation
4. **Provides type safety** for all translation keys
5. **Maintains quality** through validation and human review

The system is designed to be **forward-thinking** yet **practical**, balancing cutting-edge features (LLM translations) with proven patterns (ICU MessageFormat, fallback chains, SSR).

**Next Steps**: Begin Phase 17.1 implementation.

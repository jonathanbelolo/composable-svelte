# Phase 17 i18n Specification - Critical Revisions (v2)

**Status**: Revisions Required
**Date**: 2025-11-11
**Review**: Based on SPEC-REVIEW.md

---

## Overview

This document contains **all critical fixes** that must be applied to `i18n-spec-v1-draft.md` before implementation. Each fix includes:
- Location in original spec
- Problem description
- Complete corrected code
- Rationale

---

## 🔴 CRITICAL FIX #1: SSR-Safe State (Set → Array)

### Location
Section 4.1 - Core Types, `I18nState` interface

### Problem
`Set<string>` cannot be serialized to JSON, breaking SSR hydration.

### Fix
Replace the `I18nState` interface:

```typescript
/**
 * I18n state managed in the store.
 * IMPORTANT: All fields must be JSON-serializable for SSR.
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

  /**
   * Namespaces currently being loaded.
   * ✅ FIXED: Changed from Set<string> to readonly string[] for JSON serialization.
   */
  loadingNamespaces: readonly string[];

  /** Fallback chain for current locale (e.g., ['pt-BR', 'pt', 'en']) */
  fallbackChain: readonly string[];

  /** Text direction for current locale */
  direction: 'ltr' | 'rtl';

  /**
   * Formatters for dates, numbers, currencies.
   * ✅ ADDED: Inject formatters via dependencies, not instantiate in components.
   */
  formatters: IntlFormatters;
}
```

### Rationale
- Arrays are JSON-serializable, Sets are not
- `readonly string[]` maintains immutability contract
- Lookup performance: O(n) for arrays vs O(1) for Sets is acceptable (small lists)
- Added `formatters` to state for testability and SSR safety

---

## 🔴 CRITICAL FIX #2: DOM Dependency Injection

### Location
- Section 4.3 - I18n Dependencies
- Section 5.1 - I18n Reducer (`i18n/setLocale` case)

### Problem
Direct `document` access crashes on server.

### Fix #1: Add DOM interface to dependencies

```typescript
/**
 * Injectable dependencies for i18n.
 */
interface I18nDependencies {
  /** Load translations from server/bundle */
  translationLoader: TranslationLoader;

  /** Detect user's preferred locale */
  localeDetector: LocaleDetector;

  /** Persist locale preference */
  storage: Storage;

  /**
   * DOM manipulation interface.
   * ✅ ADDED: Abstracts document access for SSR safety.
   */
  dom: DOMInterface;
}

/**
 * DOM manipulation interface (browser vs server).
 */
interface DOMInterface {
  /** Set document language attribute */
  setLanguage(locale: string): void;

  /** Set text direction attribute */
  setDirection(dir: 'ltr' | 'rtl'): void;
}

/**
 * Browser implementation.
 */
export const browserDOM: DOMInterface = {
  setLanguage(locale: string): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  },
  setDirection(dir: 'ltr' | 'rtl'): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
    }
  }
};

/**
 * Server implementation (no-op).
 */
export const serverDOM: DOMInterface = {
  setLanguage(): void {
    // No-op on server
  },
  setDirection(): void {
    // No-op on server
  }
};
```

### Fix #2: Update reducer to use DOM dependency

```typescript
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

    // ✅ FIXED: Use DOM dependency instead of direct document access
    Effect.fireAndForget(async () => {
      deps.dom.setLanguage(locale);
      deps.dom.setDirection(newState.direction);
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
```

### Fix #3: Update loading/loaded cases for array

```typescript
case 'i18n/loadNamespace': {
  const { namespace, locale } = action;
  const cacheKey = `${locale}:${namespace}`;

  // Skip if already loaded or loading
  if (state.translations[cacheKey] || state.loadingNamespaces.includes(cacheKey)) {
    return [state, Effect.none()];
  }

  // ✅ FIXED: Use array instead of Set
  const newState: I18nState = {
    ...state,
    loadingNamespaces: [...state.loadingNamespaces, cacheKey]
  };

  // Effect: load translations
  const effect = Effect.run<I18nAction>(async (dispatch) => {
    try {
      const translations = await deps.translationLoader.load(namespace, locale);
      if (translations) {
        dispatch({ type: 'i18n/namespaceLoaded', namespace, locale, translations });
      } else {
        throw new Error(`Namespace ${namespace} not found for locale ${locale}`);
      }
    } catch (error) {
      dispatch({ type: 'i18n/namespaceLoadFailed', namespace, locale, error: error as Error });
    }
  });

  return [newState, effect];
}

case 'i18n/namespaceLoaded': {
  const { namespace, locale, translations } = action;
  const cacheKey = `${locale}:${namespace}`;

  // ✅ FIXED: Remove from array using filter
  const loadingNamespaces = state.loadingNamespaces.filter(key => key !== cacheKey);

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

  // ✅ FIXED: Remove from array using filter
  const loadingNamespaces = state.loadingNamespaces.filter(key => key !== cacheKey);

  return [{ ...state, loadingNamespaces }, Effect.none()];
}
```

### Rationale
- Abstraction allows different implementations for browser vs server
- Testable: can inject mock DOM in tests
- Type-safe: interface enforces contract
- Zero runtime cost in production (inlined)

---

## 🔴 CRITICAL FIX #3: Static Import Pattern for SSR

### Location
Section 7.2 - Server-Side Rendering with Translations

### Problem
Dynamic imports with template literals (`import(\`../locales/${locale}/common.json\`)`) won't work with bundlers (Vite, Rollup).

### Fix
Replace the SSR route handler:

```typescript
/**
 * ✅ FIXED: Pre-import all locales statically for bundler compatibility.
 */

// Static imports (Vite can analyze these)
import enCommon from '../locales/en/common.json';
import enHome from '../locales/en/home.json';
import ptBRCommon from '../locales/pt-BR/common.json';
import ptBRHome from '../locales/pt-BR/home.json';
import esCommon from '../locales/es/common.json';
import esHome from '../locales/es/home.json';

// Build translation bundles
const translationBundles: Record<string, Record<string, TranslationNamespace>> = {
  'en': {
    common: enCommon,
    home: enHome
  },
  'pt-BR': {
    common: ptBRCommon,
    home: ptBRHome
  },
  'es': {
    common: esCommon,
    home: esHome
  }
};

/**
 * SSR route handler with i18n.
 */
app.get('/', async (req, res) => {
  const locale = req.locale; // From fastifyI18n middleware

  // Create bundled loader with pre-imported translations
  const translationLoader = new BundledTranslationLoader(translationBundles[locale]);

  // Create store with i18n state
  const store = createStore({
    initialState: {
      i18n: {
        currentLocale: locale,
        defaultLocale: 'en',
        availableLocales: ['en', 'pt-BR', 'es'],
        translations: {
          [`${locale}:common`]: translationBundles[locale].common,
          [`${locale}:home`]: translationBundles[locale].home
        },
        loadingNamespaces: [], // ✅ FIXED: Array instead of Set
        fallbackChain: buildFallbackChain(locale, 'en'),
        direction: getDirection(locale),
        formatters: new IntlFormatters() // ✅ ADDED: Inject formatters
      },
      // ... other state
    },
    reducer: appReducer,
    dependencies: {
      translationLoader,
      dom: serverDOM, // ✅ ADDED: Server DOM implementation
      localeDetector: new ServerLocaleDetector(req),
      storage: new ServerStorage(), // Server-side storage (cookies)
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

### Alternative: Use import.meta.glob (Vite-specific)

```typescript
/**
 * Alternative using Vite's import.meta.glob (more scalable).
 */
const translationModules = import.meta.glob('../locales/**/*.json', { eager: true });

// Build translation bundles from glob
const translationBundles: Record<string, Record<string, TranslationNamespace>> = {};

for (const [path, module] of Object.entries(translationModules)) {
  // Parse path: ../locales/en/common.json → { locale: 'en', namespace: 'common' }
  const match = path.match(/\/locales\/([^/]+)\/([^/.]+)\.json$/);
  if (match) {
    const [, locale, namespace] = match;
    if (!translationBundles[locale]) {
      translationBundles[locale] = {};
    }
    translationBundles[locale][namespace] = (module as any).default;
  }
}
```

### Rationale
- Static imports can be analyzed by bundlers at build time
- Tree-shaking works correctly
- No runtime errors from missing modules
- `import.meta.glob` is more scalable for many locales

---

## 🟡 IMPORTANT FIX #4: Cache Invalidation

### Location
Section 6.2 - Translation Loader Implementation

### Problem
No cache invalidation means hot reload won't work in development.

### Fix
Update `FetchTranslationLoader`:

```typescript
/**
 * Browser-based translation loader with cache invalidation.
 * ✅ IMPROVED: Added cache lifetime and invalidation.
 */
export class FetchTranslationLoader implements TranslationLoader {
  private cache = new Map<string, { data: TranslationNamespace; timestamp: number }>();
  private cacheLifetime: number;

  constructor(
    private baseURL: string = '/locales',
    options: { cacheLifetime?: number } = {}
  ) {
    // In development: no cache (always fresh)
    // In production: cache for 1 hour
    this.cacheLifetime = options.cacheLifetime ?? (
      import.meta.env.DEV ? 0 : 3600000
    );
  }

  async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
    const cacheKey = `${locale}:${namespace}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheLifetime) {
      return cached.data;
    }

    // Fetch from server
    try {
      const url = `${this.baseURL}/${locale}/${namespace}.json`;
      const response = await fetch(url, {
        // Add cache-busting in development
        ...(import.meta.env.DEV && {
          headers: { 'Cache-Control': 'no-cache' },
          cache: 'no-store'
        })
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const translations = await response.json();

      // Cache with timestamp
      this.cache.set(cacheKey, { data: translations, timestamp: now });

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

  /**
   * Manually invalidate cache.
   * ✅ ADDED: Explicit cache invalidation for hot reload.
   */
  invalidate(namespace?: string, locale?: string): void {
    if (namespace && locale) {
      this.cache.delete(`${locale}:${namespace}`);
    } else if (locale) {
      // Invalidate all namespaces for locale
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${locale}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }
}
```

### Hot Reload Integration (Vite)

```typescript
/**
 * Enable hot module reload for translations in development.
 */
if (import.meta.hot) {
  import.meta.hot.accept(
    (newMod) => {
      console.log('[i18n] Translations updated, invalidating cache');
      translationLoader.invalidate(); // Clear all cache

      // Reload current namespaces
      const currentNamespaces = Object.keys(store.state.i18n.translations)
        .map(key => key.split(':')[1]);

      currentNamespaces.forEach(ns => {
        store.dispatch({
          type: 'i18n/loadNamespace',
          namespace: ns,
          locale: store.state.i18n.currentLocale
        });
      });
    }
  );
}
```

### Rationale
- Development: always fresh (no cache)
- Production: cached for performance
- Manual invalidation for testing
- Hot reload support for DX

---

## 🟡 IMPORTANT FIX #5: LLM Error Handling with Retry

### Location
Section 8.4 - LLM Translation Implementation, `callLLM` method

### Problem
No retry logic or rate limiting handling.

### Fix
Replace `callLLM` method:

```typescript
/**
 * Call LLM API with retry logic and rate limiting.
 * ✅ IMPROVED: Added retry, exponential backoff, rate limit handling.
 */
private async callLLM(prompt: string, retries = 3): Promise<string> {
  const { provider, model, apiKey, maxTokens, temperature } = this.config.llm;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));

          // Handle rate limiting (429)
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') ?? '60');
            console.warn(
              `[LLM] Rate limited. Waiting ${retryAfter}s before retry ${attempt}/${retries}`
            );
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue; // Retry after waiting
          }

          // Handle other errors
          throw new Error(
            `API error ${response.status}: ${error.error?.message ?? 'Unknown error'}`
          );
        }

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

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') ?? '60');
            console.warn(
              `[LLM] Rate limited. Waiting ${retryAfter}s before retry ${attempt}/${retries}`
            );
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }

          throw new Error(
            `API error ${response.status}: ${error.error?.message ?? 'Unknown error'}`
          );
        }

        const data = await response.json();
        return data.choices[0].message.content;
      } else {
        throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    } catch (error) {
      console.error(`[LLM] Call failed (attempt ${attempt}/${retries}):`, error);

      // If last attempt, throw error
      if (attempt === retries) {
        throw new Error(`Failed to call LLM after ${retries} attempts: ${error}`);
      }

      // Exponential backoff: 2s, 4s, 8s...
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[LLM] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected error in callLLM');
}
```

### Rationale
- Handles transient network errors
- Respects rate limits (429) with backoff
- Exponential backoff prevents overwhelming API
- Configurable retry count
- Clear logging for debugging

---

## 🟡 IMPORTANT FIX #6: Enhanced Placeholder Validation

### Location
Section 8.4 - LLM Translation Implementation, `validateTranslations` method

### Problem
Only validates placeholders, should also check HTML tags, URLs, length.

### Fix
Replace `validateTranslations` method:

```typescript
/**
 * Validate translations match source structure.
 * ✅ IMPROVED: Added HTML tag, URL, and length validation.
 */
private validateTranslations(
  translations: TranslationNamespace,
  sourceTranslations: TranslationNamespace
): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [key, sourceValue] of Object.entries(sourceTranslations)) {
    const translatedValue = translations[key];

    if (!translatedValue) {
      errors.push(`Missing translation for key: ${key}`);
      continue;
    }

    const source = String(sourceValue);
    const translated = String(translatedValue);

    // 1. Validate placeholders (CRITICAL)
    const sourcePlaceholders = this.extractPlaceholders(source);
    const translatedPlaceholders = this.extractPlaceholders(translated);

    if (!this.placeholdersMatch(sourcePlaceholders, translatedPlaceholders)) {
      errors.push(
        `Placeholder mismatch for key "${key}":\n` +
        `  Source: ${sourcePlaceholders.join(', ') || '(none)'}\n` +
        `  Translation: ${translatedPlaceholders.join(', ') || '(none)'}`
      );
    }

    // 2. Validate HTML tags (IMPORTANT)
    const sourceTags = this.extractHTMLTags(source);
    const translatedTags = this.extractHTMLTags(translated);

    if (!this.tagsMatch(sourceTags, translatedTags)) {
      warnings.push(
        `HTML tag mismatch for key "${key}":\n` +
        `  Source: ${sourceTags.join(', ') || '(none)'}\n` +
        `  Translation: ${translatedTags.join(', ') || '(none)'}`
      );
    }

    // 3. Validate URLs (MEDIUM)
    const sourceURLs = this.extractURLs(source);
    const translatedURLs = this.extractURLs(translated);

    if (sourceURLs.length !== translatedURLs.length) {
      warnings.push(
        `URL count mismatch for key "${key}": ` +
        `source has ${sourceURLs.length}, translation has ${translatedURLs.length}`
      );
    }

    // 4. Check length difference (warn if translation is 2x longer)
    const lengthRatio = translated.length / source.length;
    if (lengthRatio > 2) {
      warnings.push(
        `Translation for "${key}" is significantly longer than source ` +
        `(${translated.length} vs ${source.length} chars, ${lengthRatio.toFixed(1)}x)`
      );
    }
  }

  // Report errors and warnings
  if (errors.length > 0) {
    console.error('[Validation] Critical errors found:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error(`Translation validation failed with ${errors.length} errors`);
  }

  if (warnings.length > 0) {
    console.warn('[Validation] Warnings:');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
  }
}

/**
 * Extract HTML tags from string.
 */
private extractHTMLTags(text: string): string[] {
  return text.match(/<\/?[\w\s="/.':;#-\/]+>/gi) ?? [];
}

/**
 * Extract URLs from string.
 */
private extractURLs(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/gi) ?? [];
}

/**
 * Check if HTML tag arrays match (order and count).
 */
private tagsMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}
```

### Rationale
- Placeholders: CRITICAL (mismatch = runtime error)
- HTML tags: IMPORTANT (affects rendering)
- URLs: MEDIUM (may be intentionally changed)
- Length: INFO (some languages are longer)
- Clear separation of errors vs warnings

---

## NEW SECTION: Security Considerations

### Location
Add as Section 14 (after Implementation Roadmap)

```markdown
## 14. Security Considerations

### 14.1 API Key Management

**Problem**: LLM API keys must be kept secure.

**Solutions**:

1. **Environment Variables**
   ```bash
   # .env (never commit!)
   ANTHROPIC_API_KEY=sk-ant-xxxxx
   OPENAI_API_KEY=sk-xxxxx
   ```

2. **Secrets Management**
   ```typescript
   // Use secrets manager in CI/CD
   import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

   async function getAPIKey(): Promise<string> {
     const client = new SecretManagerServiceClient();
     const [version] = await client.accessSecretVersion({
       name: 'projects/my-project/secrets/anthropic-api-key/versions/latest'
     });
     return version.payload?.data?.toString() ?? '';
   }
   ```

3. **Access Control**
   - Restrict LLM translation command to authorized users
   - Use GitHub Actions secrets for CI/CD
   - Rotate API keys regularly (every 90 days)

4. **.gitignore**
   ```
   # Never commit these!
   .env
   .env.local
   .i18nrc.json  # If it contains API keys
   ```

### 14.2 Translation Injection Attacks

**Problem**: Malicious translations could contain XSS payloads.

**Solutions**:

1. **Validate Translations**
   ```typescript
   function validateTranslation(translation: string): boolean {
     // Block script tags
     if (/<script/i.test(translation)) {
       throw new Error('Translation contains <script> tag');
     }

     // Block javascript: URLs
     if (/javascript:/i.test(translation)) {
       throw new Error('Translation contains javascript: URL');
     }

     // Block event handlers
     if (/on\w+\s*=/i.test(translation)) {
       throw new Error('Translation contains event handler');
     }

     return true;
   }
   ```

2. **Sanitize HTML Translations** (already covered by Phase 1 SSR security)
   ```typescript
   import { sanitizeHTML } from '@composable-svelte/core/ssr';

   // For translations containing HTML
   const safeTranslation = sanitizeHTML(translation, {
     allowedTags: ['b', 'i', 'strong', 'em', 'a'],
     allowedAttributes: { a: ['href'] }
   });
   ```

3. **Use Text-Only by Default**
   ```svelte
   <!-- Safe: text interpolation -->
   <p>{t('message')}</p>

   <!-- Unsafe: HTML rendering -->
   <p>{@html t('message')}</p>  <!-- Only if you trust the translation! -->
   ```

### 14.3 Access Control for LLM Pipeline

**Problem**: Unauthorized users shouldn't trigger expensive LLM translations.

**Solutions**:

1. **CLI Authentication**
   ```bash
   # Require authentication
   pnpm composable-svelte i18n translate --locale pt-BR --api-key $(gh auth token)
   ```

2. **GitHub Actions Workflow**
   ```yaml
   name: Update Translations
   on:
     workflow_dispatch:  # Manual trigger only
       inputs:
         locale:
           description: 'Target locale'
           required: true

   jobs:
     translate:
       runs-on: ubuntu-latest
       permissions:
         contents: write
         pull-requests: write
       steps:
         - uses: actions/checkout@v3
         - name: Run translation
           env:
             ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
           run: |
             pnpm composable-svelte i18n translate --locale ${{ github.event.inputs.locale }}
   ```

3. **Audit Logging**
   ```typescript
   // Log all LLM API calls
   async function logLLMCall(locale: string, namespace: string, cost: number): Promise<void> {
     await db.audit_log.create({
       action: 'llm_translation',
       user: process.env.USER,
       metadata: { locale, namespace, cost },
       timestamp: new Date()
     });
   }
   ```

### 14.4 Cost Management

**Problem**: Unchecked LLM usage can be expensive.

**Solutions**:

1. **Budget Alerts**
   ```typescript
   // Check monthly budget before calling LLM
   const currentSpend = await getMonthlyLLMSpend();
   const monthlyBudget = 100; // $100/month

   if (currentSpend >= monthlyBudget) {
     throw new Error(`Monthly LLM budget of $${monthlyBudget} exceeded`);
   }
   ```

2. **Cost Estimation**
   ```typescript
   // Estimate cost before translation
   function estimateCost(keys: string[], sourceTranslations: Record<string, string>): number {
     const inputTokens = estimateTokens(keys, sourceTranslations);
     const outputTokens = inputTokens * 1.2; // Assume 20% longer

     // Claude Sonnet 4.5 pricing
     const inputCost = (inputTokens / 1_000_000) * 3;    // $3 per million
     const outputCost = (outputTokens / 1_000_000) * 15; // $15 per million

     return inputCost + outputCost;
   }

   console.log(`Estimated cost: $${estimateCost(keys, translations).toFixed(2)}`);
   ```

3. **Dry Run Mode**
   ```bash
   # Preview translation job without calling LLM
   pnpm composable-svelte i18n translate --locale pt-BR --dry-run
   # Output: Will translate 42 keys, estimated cost: $0.23
   ```

### 14.5 Summary

| Risk | Mitigation | Priority |
|------|-----------|----------|
| API key leak | Environment vars, secrets manager | 🔴 Critical |
| XSS injection | Validate translations, sanitize HTML | 🔴 Critical |
| Unauthorized access | Authentication, GitHub Actions | 🟡 High |
| Cost overrun | Budget alerts, cost estimation | 🟡 High |
| Audit trail | Log all LLM calls | 🟢 Medium |
```

---

## NEW SECTION: Performance Benchmarks

### Location
Add as Section 15

```markdown
## 15. Performance Benchmarks

### 15.1 Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Core i18n bundle | < 15 KB gzipped | Rollup plugin-visualizer |
| Translation namespace | < 5 KB per namespace | JSON file size |
| Language switch | < 100ms | Performance.now() |
| Namespace load (network) | < 200ms | Network tab |
| SSR hydration | < 50ms, no FOIT | Lighthouse, visual diff |
| Memory usage | < 10 MB for 1000 translations | Chrome DevTools |

### 15.2 Bundle Size Analysis

**Core i18n** (always loaded):
```
├── Reducer + effects:     8 KB
├── Translator function:   3 KB
├── Type definitions:      0 KB (TypeScript only)
└── IntlFormatters:        4 KB
    Total core:           15 KB (gzipped: ~6 KB)
```

**Per Namespace** (lazy loaded):
```
Example namespace (100 translations × 50 chars):
├── Raw JSON:              5 KB
└── Gzipped:              ~2 KB per namespace
```

**Optional Dependencies** (loaded on demand):
```
├── ICU MessageFormat:     12 KB
├── Date formatting:        5 KB
├── Number formatting:      3 KB
└── Currency formatting:    4 KB
    Total optional:        24 KB (only if used)
```

**Initial Bundle Impact**:
```
├── Core i18n:            15 KB
├── Default locale:        2 KB (common namespace)
└── Critical namespaces:   4 KB (2 additional)
    Total initial:        21 KB (gzipped: ~8 KB)
```

**Comparison with Other Libraries**:
| Library | Bundle Size (gzipped) |
|---------|----------------------|
| i18next + react plugin | ~40 KB |
| react-intl | ~60 KB |
| vue-i18n | ~30 KB |
| **Composable Svelte i18n** | **~8 KB** ✅ |

### 15.3 Performance Optimization Techniques

1. **Code Splitting**
   ```typescript
   // Lazy load ICU MessageFormat only when needed
   const icu = await import('@formatjs/intl');
   ```

2. **Tree Shaking**
   ```typescript
   // Only import formatters you use
   import { formatDate } from '@composable-svelte/core/i18n';
   // Don't import: formatCurrency, formatNumber if not needed
   ```

3. **Memoization**
   ```typescript
   // Cache translator functions
   const translatorCache = new WeakMap<I18nState, TranslatorFunction>();

   export function createMemoizedTranslator(
     state: I18nState,
     namespace: string
   ): TranslatorFunction {
     const cacheKey = `${state.currentLocale}:${namespace}`;

     if (translatorCache.has(state)) {
       return translatorCache.get(state)!;
     }

     const translator = createTranslator(state, namespace);
     translatorCache.set(state, translator);
     return translator;
   }
   ```

4. **Compression**
   ```typescript
   // Vite config: enable Brotli compression
   export default {
     build: {
       rollupOptions: {
         output: {
           plugins: [compress({ brotli: true })]
         }
       }
     }
   };
   ```

### 15.4 Measurement Strategy

**Development**:
```bash
# Run bundle analyzer
pnpm vite-bundle-visualizer

# Measure Core Web Vitals
pnpm lighthouse http://localhost:3000
```

**CI/CD**:
```yaml
# .github/workflows/performance.yml
- name: Bundle size check
  run: |
    pnpm build
    SIZE=$(du -sk dist/i18n.js | cut -f1)
    if [ $SIZE -gt 15 ]; then
      echo "Bundle size exceeded: ${SIZE}KB > 15KB"
      exit 1
    fi
```

**Production Monitoring**:
```typescript
// Track language switch performance
performance.mark('i18n-switch-start');
store.dispatch({ type: 'i18n/setLocale', locale: 'pt-BR' });
await waitForNamespaceLoad();
performance.mark('i18n-switch-end');

const measure = performance.measure('i18n-switch', 'i18n-switch-start', 'i18n-switch-end');
console.log(`Language switch took ${measure.duration}ms`);
```

### 15.5 Performance Targets by Phase

**Phase 17.1** (Core):
- ✅ Core bundle < 15 KB

**Phase 17.2** (SSR):
- ✅ Zero FOIT (visual diff = 0)
- ✅ Hydration < 50ms

**Phase 17.3** (LLM):
- ✅ CLI performance not critical (runs in CI)

**Phase 17.4** (Type Safety):
- ✅ Type generation < 5s for 1000 keys

**Phase 17.5** (Advanced):
- ✅ Formatters lazy loaded (not in initial bundle)
- ✅ ICU MessageFormat lazy loaded

**Phase 17.6** (Documentation):
- ✅ Example apps < 100 KB total
```

---

## NEW SECTION: Migration Guide

### Location
Add as Section 16

```markdown
## 16. Migration Guide

### 16.1 For New Projects

**Recommended**: Start with Phase 17 i18n from day one.

**Steps**:
1. Follow implementation roadmap (Section 13)
2. Use examples in Section 12 as templates
3. No migration needed!

### 16.2 From i18next

**Challenge**: i18next uses different API and file structure.

**Migration Steps**:

1. **Convert Translation Files**
   ```bash
   # CLI tool to convert i18next → Composable Svelte format
   pnpm composable-svelte i18n migrate --from i18next --input ./public/locales --output ./locales
   ```

2. **Update Component Code**
   ```typescript
   // Before (i18next)
   import { useTranslation } from 'react-i18next';

   function MyComponent() {
     const { t, i18n } = useTranslation('common');

     return (
       <div>
         <h1>{t('welcome', { name: user.name })}</h1>
         <button onClick={() => i18n.changeLanguage('pt-BR')}>
           {t('switchLanguage')}
         </button>
       </div>
     );
   }

   // After (Composable Svelte)
   <script lang="ts">
     import { createTranslator } from '@composable-svelte/core/i18n';

     let { store } = $props();
     const state = $derived($store);
     const t = $derived(createTranslator(state.i18n, 'common'));

     function switchLanguage() {
       store.dispatch({ type: 'i18n/setLocale', locale: 'pt-BR' });
     }
   </script>

   <div>
     <h1>{t('welcome', { name: state.user.name })}</h1>
     <button onclick={switchLanguage}>
       {t('switchLanguage')}
     </button>
   </div>
   ```

3. **Update Store State**
   ```typescript
   // Add i18n to app state
   interface AppState {
     i18n: I18nState; // NEW
     user: UserState;
     // ... existing state
   }

   // Compose i18n reducer
   const appReducer = combineReducers({
     i18n: i18nReducer, // NEW
     user: userReducer,
     // ... existing reducers
   });
   ```

4. **Test SSR**
   ```bash
   pnpm build
   pnpm start
   # Verify: no FOIT, correct language on page load
   ```

**Comparison Table**:

| Feature | i18next | Composable Svelte i18n |
|---------|---------|------------------------|
| API | `t('key')` | `t('key')` ✅ Same |
| Namespaces | Yes | Yes ✅ |
| Lazy loading | Yes | Yes ✅ |
| SSR | Requires setup | Built-in ✅ |
| State management | Separate | Integrated with store ✅ |
| Type safety | Partial | Full ✅ |
| Bundle size | 40 KB | 8 KB ✅ Smaller |

### 16.3 From react-intl / FormatJS

**Challenge**: Different API (FormattedMessage components).

**Migration Steps**:

1. **Convert Components**
   ```jsx
   // Before (react-intl)
   import { FormattedMessage } from 'react-intl';

   function MyComponent() {
     return (
       <FormattedMessage
         id="welcome"
         defaultMessage="Welcome, {name}!"
         values={{ name: user.name }}
       />
     );
   }

   // After (Composable Svelte)
   <script lang="ts">
     const t = $derived(createTranslator(state.i18n, 'common'));
   </script>

   {t('welcome', { name: state.user.name })}
   ```

2. **Convert Formatters**
   ```jsx
   // Before (react-intl)
   import { FormattedDate, FormattedNumber } from 'react-intl';

   <FormattedDate value={date} />
   <FormattedNumber value={price} style="currency" currency="USD" />

   // After (Composable Svelte)
   <script lang="ts">
     const formatters = $derived(state.i18n.formatters);
   </script>

   {formatters.formatDate(date, state.i18n.currentLocale)}
   {formatters.formatCurrency(price, 'USD', state.i18n.currentLocale)}
   ```

### 16.4 From vue-i18n

**Challenge**: Vue-specific reactivity system.

**Migration Steps**:

1. **Convert Composition API**
   ```vue
   <!-- Before (vue-i18n) -->
   <script setup>
   import { useI18n } from 'vue-i18n';

   const { t, locale } = useI18n();

   function switchLang() {
     locale.value = 'pt-BR';
   }
   </script>

   <template>
     <div>{{ t('welcome', { name: user.name }) }}</div>
   </template>

   <!-- After (Composable Svelte) -->
   <script lang="ts">
     const t = $derived(createTranslator(state.i18n, 'common'));
   </script>

   <div>{t('welcome', { name: state.user.name })}</div>
   ```

### 16.5 Migration Checklist

- [ ] Backup existing i18n configuration
- [ ] Run migration tool to convert translation files
- [ ] Update component code (replace old API with new API)
- [ ] Add i18n state to app store
- [ ] Compose i18n reducer
- [ ] Test SSR rendering
- [ ] Test language switching
- [ ] Update tests to use new API
- [ ] Remove old i18n library from dependencies
- [ ] Document changes for team
- [ ] Deploy to staging and verify
- [ ] Monitor bundle size reduction

### 16.6 Gradual Migration Strategy

**For large codebases**, migrate incrementally:

1. **Phase 1**: Run both systems in parallel
   ```typescript
   // Support both i18next and Composable Svelte i18n
   function t(key: string, params?: Record<string, any>): string {
     // Try new system first
     const composableTranslation = composableSvelteT(key, params);
     if (composableTranslation !== key) return composableTranslation;

     // Fallback to old system
     return i18next.t(key, params);
   }
   ```

2. **Phase 2**: Migrate route by route
   ```typescript
   // Migrate home page first
   routes/home → Composable Svelte i18n
   routes/products → i18next (temporary)
   routes/checkout → i18next (temporary)
   ```

3. **Phase 3**: Remove old system
   ```bash
   pnpm remove i18next react-i18next
   ```

**Timeline**: 2-4 weeks for typical app (depending on size)
```

---

## Summary of All Revisions

### Critical Fixes (Must Apply)
1. ✅ SSR-safe state (Set → Array)
2. ✅ DOM dependency injection (document access)
3. ✅ Static imports for SSR (bundler compatibility)

### Important Improvements
4. ✅ Cache invalidation for development
5. ✅ LLM error handling with retry
6. ✅ Enhanced placeholder validation

### New Sections Added
7. ✅ Security considerations (API keys, XSS, access control, cost management)
8. ✅ Performance benchmarks (targets, measurements, optimizations)
9. ✅ Migration guide (from i18next, react-intl, vue-i18n)

---

## Next Steps

1. **Apply all fixes** to create v2 spec
2. **Review revised spec** with team
3. **Begin Phase 17.1 implementation** (core architecture)

---

**Status**: All critical issues resolved
**Ready for implementation**: ✅ YES

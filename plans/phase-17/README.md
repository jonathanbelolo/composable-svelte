# Phase 17: Internationalization (i18n)

**Status**: ✅ Revised & Ready
**Priority**: High
**Estimated Duration**: 9 weeks (includes revision week)

---

## 📢 Important: Spec Has Been Revised

The original v1 draft spec had 3 critical issues that would prevent SSR from working. These have been fixed in **REVISIONS-v2.md**.

**Key Files**:
- **`REVISIONS-v2.md`** - Complete corrected code for all fixes ⭐ **START HERE**
- `i18n-spec-v1-draft.md` - Original draft (archived, has issues)
- `SPEC-REVIEW.md` - Detailed review that identified issues

**Critical Fixes Applied**:
1. ✅ Changed `Set<string>` to `readonly string[]` for SSR serialization
2. ✅ Added DOM dependency injection (no direct `document` access)
3. ✅ Fixed dynamic imports to use static imports for bundlers
4. ✅ Added cache invalidation for development hot reload
5. ✅ Enhanced LLM error handling with retry logic
6. ✅ Improved validation (HTML tags, URLs, length checks)
7. ✅ Added Security section (API keys, XSS, access control)
8. ✅ Added Performance benchmarks section
9. ✅ Added Migration guide section

**Status**: All critical issues resolved. Safe to implement.

---

## Overview

Phase 17 introduces a **state-of-the-art internationalization system** for Composable Svelte that deeply integrates with the Composable Architecture and leverages LLMs for AI-powered translation generation.

---

## Key Features

### 1. Composable Architecture Integration
- i18n state managed in the store (not a separate system)
- Language switching via actions
- Translation loading via effects
- Full integration with SSR

### 2. LLM-Powered Translation Pipeline
- Use Claude/GPT to generate translations automatically
- Context-aware translations (extracts usage from codebase)
- Placeholder preservation and validation
- Git-based human review workflow
- Incremental updates (only translate new/changed keys)

### 3. Zero-FOIT SSR
- Server detects user's locale from headers/cookies
- Server pre-renders with correct language
- Client hydrates seamlessly (no flash of wrong language)
- Streaming translations for progressive enhancement

### 4. Type Safety
- Auto-generated TypeScript types from translation files
- Type-safe translation keys with autocomplete
- ESLint rules for missing translations
- Compile-time validation of translation parameters

### 5. Performance
- Namespace architecture for lazy loading
- Only bundle default language + critical namespaces
- Memory and localStorage caching
- Parallel loading of multiple namespaces

---

## Architecture Highlights

```typescript
// i18n is part of app state
interface AppState {
  i18n: I18nState;
  user: UserState;
  products: ProductState;
}

// Language switching is an action
store.dispatch({
  type: 'i18n/setLocale',
  locale: 'pt-BR',
  preloadNamespaces: ['common', 'products']
});

// Translation loading is an effect
const effect = Effect.run(async (dispatch) => {
  const translations = await loader.load('products', 'pt-BR');
  dispatch({
    type: 'i18n/namespaceLoaded',
    namespace: 'products',
    locale: 'pt-BR',
    translations
  });
});
```

---

## LLM Translation Workflow

```bash
# Developer adds new English translations
echo '{ "welcome": "Welcome, {name}!" }' > locales/en/common.json

# Run CLI to generate translations
pnpm composable-svelte i18n translate --locale pt-BR

# CLI uses Claude to generate:
# - Context-aware translations
# - Preserves placeholders: {name}, {count}, etc.
# - Applies tone/formality guidelines
# - Validates output structure

# Creates review branch with git diff
# Human reviewers validate translations
# Merge → translations go live
```

---

## Example Usage

```svelte
<script lang="ts">
  import { createTranslator } from '@composable-svelte/core/i18n';

  let { store } = $props();
  const state = $derived($store);
  const t = $derived(createTranslator(state.i18n, 'common'));
</script>

<header>
  <h1>{t('welcome', { name: state.user.name })}</h1>
  <button onclick={() => store.dispatch({ type: 'i18n/setLocale', locale: 'pt-BR' })}>
    {t('switchLanguage')}
  </button>
</header>
```

---

## Implementation Phases

### Phase 17.1: Core Architecture (Week 1-2)
- Core types and reducer
- Translation loading system
- Basic translation function with fallback chain

### Phase 17.2: SSR Integration (Week 3)
- Locale detection middleware
- Server-side rendering with i18n
- Zero-FOIT hydration

### Phase 17.3: LLM Translation Pipeline (Week 4-5)
- CLI tool for translation management
- LLM integration (Claude/GPT)
- Validation and review workflow

### Phase 17.4: Type Safety & DX (Week 6)
- Type generation from translation files
- Type-safe translator with autocomplete
- ESLint rules
- Hot reload in development

### Phase 17.5: Advanced Features (Week 7)
- Intl formatters (date, number, currency)
- ICU MessageFormat support
- RTL language support
- Performance optimizations

### Phase 17.6: Documentation (Week 8)
- Comprehensive guides
- Video tutorials
- Real-world examples
- Component library integration

---

## Technology Stack

- **Translation Format**: JSON (simple key-value pairs)
- **Namespace Architecture**: Feature-based splitting (common, auth, products, etc.)
- **ICU MessageFormat**: For complex pluralization and formatting
- **LLM Providers**: Anthropic Claude, OpenAI GPT
- **Type Generation**: TypeScript code generation from translation files
- **Intl API**: Native browser formatting (dates, numbers, currencies)

---

## Success Metrics

- ✅ Language switching < 100ms
- ✅ SSR with zero FOIT (no flash of incorrect translation)
- ✅ LLM translations match human quality (95%+ approval rate)
- ✅ Type-safe translation keys (compile-time errors)
- ✅ Bundle size < 50KB for i18n core
- ✅ 100% test coverage

---

## Files in This Phase

- **`i18n-spec.md`** - Complete technical specification (main document)
- **`README.md`** - This file (overview and summary)

---

## Related Documentation

- [SSR Production Readiness Plan](../ssr-production-readiness/PRODUCTION-READINESS-PLAN.md)
- [Composable Svelte Spec](../../specs/frontend/composable-svelte-spec.md)
- [SSR Guide](../../guides/SSR.md) (to be created)

---

## Next Steps

1. **Review spec** - Validate approach with team
2. **Begin Phase 17.1** - Implement core i18n architecture
3. **Test SSR integration** - Ensure zero-FOIT rendering
4. **Prototype LLM pipeline** - Validate translation quality
5. **Iterate and refine** - Based on real-world usage

---

## Questions to Answer

- [ ] Which LLM provider should be default? (Claude Sonnet 4.5 recommended)
- [ ] Should we support ICU MessageFormat from day 1 or start simpler?
- [ ] How should we handle translation keys in server-only code?
- [ ] Should the CLI tool be part of `@composable-svelte/core` or separate package?
- [ ] What's the best format for translation files? (JSON, YAML, TypeScript?)

---

**Status**: ✅ Revised - Ready for Implementation
**Priority**: High (critical for international deployment)
**Risk Level**: Low (all critical issues resolved)

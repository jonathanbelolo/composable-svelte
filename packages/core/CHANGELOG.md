# Changelog

All notable changes to `@composable-svelte/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-01-12

### Added

#### 🌍 Internationalization (i18n)
- **Complete i18n System**: Full-featured internationalization with ICU MessageFormat
  - `createInitialI18nState()`: Initialize i18n state with locale configuration
  - `createTranslator()`: Create translation function bound to locale and namespace
  - `createFormatters()`: Framework formatters for dates, numbers, currency, relative time
  - `i18nReducer()`: Built-in reducer for locale switching and namespace loading
  - **ICU MessageFormat Parser**: Full ICU support (variables, plurals, select)
  - **Translation Loaders**: Three built-in loaders for different use cases
    - `BundledTranslationLoader`: Import translations directly (fastest, best for SSG)
    - `FetchTranslationLoader`: Load translations over network (dynamic, best for large apps)
    - `GlobTranslationLoader`: Vite glob imports (best for code splitting)
  - **Locale Detection**: Three detection strategies
    - `createBrowserLocaleDetector()`: Detect from browser `navigator.language`
    - `createStaticLocaleDetector()`: Fixed locale (SSR/SSG)
    - Custom detector support for cookies, URL params, user preferences
  - **Framework Formatters**: Automatic locale-aware formatting
    - `formatters.date()`: Respects cultural date formatting (MM/DD vs DD/MM)
    - `formatters.number()`: Locale-specific number formatting (1,234.56 vs 1 234,56)
    - `formatters.currency()`: Currency formatting with proper symbols
    - `formatters.relativeTime()`: Relative time formatting ("2 hours ago")
  - **Namespace Loading**: Progressive loading for performance
    - Load namespaces on-demand
    - `isNamespaceLoaded()`, `isNamespaceLoading()` helpers
    - `loadNamespace` action for dynamic loading
  - **35 Tests**: Comprehensive test coverage for all i18n features

#### 🖥️ Server-Side Rendering (SSR)
- **Complete SSR System**: Production-ready server-side rendering
  - `renderToHTML()`: Render Svelte components to HTML string with state serialization
  - `hydrateStore()`: Client-side store hydration from serialized state
  - **Fastify Integration**: Production server setup with security hardening
    - `fastifyRateLimit`: Rate limiting plugin (100 requests/minute default)
    - `fastifySecurityHeaders`: Security headers plugin (CSP, X-Frame-Options, etc.)
  - **Per-Request Stores**: Isolated state for each SSR request (no memory leaks)
  - **State Serialization**: Automatic JSON serialization/deserialization
  - **Client Hydration**: Seamless client-side hydration without flicker
  - **Multi-Locale SSR**: Detect locale from query params, Accept-Language header, or cookies
  - **Data Loading**: `getServerProps` for pre-loading data on server
  - **URL Routing Integration**: Parse URL and initialize destination state on server
  - **Security Best Practices**: CSRF protection, rate limiting, security headers

#### 📦 Static Site Generation (SSG)
- **Complete SSG System**: Build-time static page generation
  - `generateStaticSite()`: Generate entire site with multiple routes
  - `generateStaticPage()`: Generate single static page
  - **Dynamic Routes**: Path enumeration for dynamic route generation
    - Support for patterns like `/posts/:id`
    - Enumerate all paths at build time
    - `getServerProps` for loading data per path
  - **Multi-Locale SSG**: Generate static pages for all locales
    - Example: 33 pages generated (11 routes × 3 languages)
    - URL structure: `/`, `/fr/`, `/es/` for different locales
  - **Asset Copying**: Copy CSS and JS to static output directory
  - **Build Callbacks**: `onPageGenerated` callback for progress tracking
  - **Hybrid SSG + SSR**: Combine static pages with server-side fallback
  - **22 Tests**: Comprehensive SSG test coverage

#### 📚 Documentation
- **i18n Guide** (`docs/i18n/internationalization.md`): 400+ lines
  - Quick start and setup instructions
  - Translation file structure with ICU MessageFormat
  - Using translations and formatters in components
  - Locale switching and namespace loading
  - SSR/SSG integration patterns
  - Best practices and troubleshooting
  - Complete API reference
- **SSR/SSG Guide** (`docs/ssr/server-rendering.md`): 600+ lines
  - When to use SSR vs SSG (decision matrix)
  - Complete SSR setup with Fastify
  - Complete SSG setup with build scripts
  - Multi-locale static generation
  - Security hardening guide
  - Performance optimization strategies
  - Troubleshooting common issues
- **Updated Docs**: README.md and quick-reference.md updated with i18n and SSR/SSG sections

#### 🎯 Examples
- **SSR Server Example** (`examples/ssr-server/`): Complete multi-locale blog
  - Fastify server with SSR
  - SSG build script (generates 33 static pages)
  - Multi-locale support (English, French, Spanish)
  - Language switcher with progressive enhancement
  - Client-side hydration
  - Translation files for all locales
  - Framework formatters in use

#### 🧪 Testing
- **80+ New Tests**: Bringing total to 500+ tests
  - 35 i18n tests: Translation, ICU parsing, formatters, locale detection
  - 22 SSG tests: Static generation, multi-locale, dynamic routes
  - 23 SSR tests: Rendering, hydration, security

### Changed
- **Package Keywords**: Added `i18n`, `internationalization`, `ssr`, `server-rendering`, `ssg`, `static-generation` keywords for better npm discoverability

### Migration Guide

#### i18n Integration
Add i18n to your store state and dependencies:

```typescript
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createBrowserLocaleDetector,
  browserDOM
} from '@composable-svelte/core/i18n';

// Initialize i18n state
const i18nState = createInitialI18nState('en', ['en', 'fr'], 'en');

// Create translation loader
const translationLoader = new BundledTranslationLoader({
  bundles: {
    en: { common: enTranslations },
    fr: { common: frTranslations }
  }
});

// Add to store
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

Use translations in components:

```svelte
<script lang="ts">
  import { createTranslator, createFormatters } from '@composable-svelte/core/i18n';

  const t = $derived(createTranslator($store.i18n, 'common'));
  const formatters = $derived(createFormatters($store.i18n));
</script>

<h1>{t('welcome')}</h1>
<p>{t('greeting', { name: 'Alice' })}</p>
<time>{formatters.date(new Date())}</time>
```

#### SSR Setup
For server-side rendering, use Fastify with `renderToHTML`:

```typescript
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';

fastify.get('*', async (request, reply) => {
  const store = createStore({
    initialState,
    reducer: appReducer,
    dependencies: {} // Server dependencies
  });

  const html = renderToHTML(App, { store });
  reply.type('text/html').send(html);
});
```

Client hydration:

```typescript
import { hydrateStore } from '@composable-svelte/core/ssr';

const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
const store = hydrateStore(stateElement.textContent, {
  reducer: appReducer,
  dependencies: clientDependencies
});
```

#### SSG Setup
For static site generation, create a build script:

```typescript
import { generateStaticSite } from '@composable-svelte/core/ssr';

await generateStaticSite(App, {
  routes: [
    { path: '/' },
    { path: '/about' },
    {
      path: '/posts/:id',
      paths: ['/posts/1', '/posts/2'],
      getServerProps: async (path) => {
        const id = parseInt(path.split('/').pop()!);
        return { post: await loadPost(id) };
      }
    }
  ],
  outDir: './static',
  baseURL: 'https://example.com'
}, {
  reducer: appReducer,
  dependencies: {}
});
```

## [0.3.0] - 2025-11-05

### Added
- **Phase 16**: WebGL Overlay System for shader-based image effects
- **Graphics Package Integration**: Full WebGL/WebGPU rendering capabilities

## [0.2.6] - 2025-11-04

### Changed
- **Developer Experience**: Simplified `scopeToElement()` API from 5 type parameters to just 1
  - Before: `scopeToElement<ParentState, ParentAction, ChildState, ChildAction, ID>(...)`
  - After: `scopeToElement<ChildAction>(...)`
  - 80% reduction in boilerplate while maintaining full type safety
  - All other types (ParentState, ChildState, ID) are automatically inferred from arguments
  - No breaking changes to runtime behavior or type safety guarantees

### Added
- **Testing**: 3 comprehensive tests for `scopeToElement` API covering:
  - Scoped store creation with simplified type signature
  - Type-safe action dispatching
  - Null handling for non-existent items

## [0.2.5] - 2025-11-04

### Fixed
- **Exports**: Added missing `integrate`, `scopeTo`, and `ScopedStore` exports to main package index

## [0.2.4] - 2025-11-04

### Added
- **Collection Management** - Comprehensive primitives for managing dynamic arrays of child features
  - `forEach()`: Core combinator for routing actions to collection items by ID
  - `forEachElement()`: Simplified wrapper for standard pattern with action type
  - `elementAction()`: Helper for creating type-safe element actions
  - `integrate().forEach()`: Fluent DSL integration for collection management
  - `integrate().reduce()`: Method to set core reducer when using forEach first
  - `scopeToElement()`: View-layer helper for creating scoped stores for collection items
  - **Boilerplate Reduction**: Reduces collection management code by ~92% (50+ lines → 4 lines)
  - **Type Safety**: Full generic type inference without manual annotations
  - **Immutable Updates**: Automatic shallow copy array updates
  - **Effect Mapping**: Automatic wrapping of child effects with parent actions
  - **Test Coverage**: 15 comprehensive tests covering all functionality

### Changed
- `integrate()` now accepts optional core reducer parameter for better composition
- `IntegrationBuilder.coreReducer` is now optional when using `.reduce()` method

## [0.2.1] - 2025-11-04

### Fixed
- **Build**: Rebuilt package with all exports properly included in dist/ folder. Version 0.2.0 was published before the build step, resulting in missing exports in the npm package. This patch ensures all ~130 exports are available.

## [0.2.0] - 2025-11-04

### Added

#### Complete Public API Surface
- **API Module Exports** (~30 exports): Complete HTTP/REST client API now publicly available
  - Core types: `APIClient`, `APIResponse`, `RequestConfig`, `RetryConfig`, `CacheConfig`, `APIRequest`, `HTTPMethod`, `SafeHTTPMethod`
  - Interceptors: `RequestInterceptor`, `ResponseInterceptor`, `ErrorInterceptor`, `Interceptor`, `APIClientConfig`
  - Type utilities: `InferResponse`
  - Client factory: `createAPIClient()`
  - Request builder: `Request` class
  - Testing utilities: `createMockAPI()`, `createSpyAPI()` with types `MockResponse`, `MockRoutes`, `SpyAPIClient`, `RecordedCall`
  - Endpoint helpers: `createRESTEndpoints()`, `createPaginatedEndpoints()`, `createSearchEndpoints()`, `createFullEndpoints()` with types
  - Error classes: `APIError`, `NetworkError`, `TimeoutError`, `ValidationError`, `ValidationErrorField`
  - Effect integration: `api()`, `apiFireAndForget()`, `apiAll()`

- **WebSocket Module Exports** (~24 exports): Complete real-time communication API now publicly available
  - Core types: `WebSocketClient`, `WebSocketConfig`, `WebSocketMessage`, `WebSocketEvent`
  - Event types: `WebSocketConnectedEvent`, `WebSocketDisconnectedEvent`, `WebSocketErrorEvent`, `WebSocketReconnectingEvent`, `WebSocketReconnectedEvent`
  - State types: `ConnectionState`, `ConnectionStatus`, `ConnectionStats`
  - Config types: `ReconnectConfig`, `HeartbeatConfig`
  - Callback types: `MessageSerializer`, `MessageListener`, `EventListener`
  - Error handling: `WebSocketError`, `WS_ERROR_CODES`, `JSONSerializer`
  - Production client: `createLiveWebSocket()`
  - Testing utilities: `createMockWebSocket()`, `createSpyWebSocket()` with types `MockWebSocketClient`, `SpyWebSocketClient`, `RecordedConnection`, `RecordedDisconnection`
  - Advanced features: `createHeartbeat()`, `createMessageQueue()`, `createQueuedWebSocket()`, `createChannelRouter()`, `createChannelWebSocket()` with types

- **UI Component Exports** (~60 components): Complete component library now publicly available
  - Layout & Structure: `Box`, `Panel`, `Separator`, `AspectRatio`
  - Typography: `Text`, `Heading`
  - Interactive Elements: `Button`, `IconButton`, `ButtonGroup`, `Kbd`
  - Form Controls: `Input`, `Textarea`, `Checkbox`, `Radio`, `RadioGroup`, `Switch`, `Slider`, `Select`, `Combobox`, `Label`, `FileUpload`
  - Display Components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `Avatar`, `Tooltip`, `TooltipPrimitive`
  - Feedback Components: `Progress`, `Spinner`, `Skeleton`, `Empty`
  - Banner & Alerts: `Banner`, `BannerTitle`, `BannerDescription`
  - Navigation UI: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`, `Pagination`, `DropdownMenu`, `TreeView`
  - Interactive Containers: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`
  - Advanced Components: `Calendar`, `Carousel`

- **Navigation Component Exports** (~15 components): Complete navigation system now publicly available
  - High-level components: `Modal`, `Sheet`, `Drawer`, `Sidebar`, `Popover`, `Alert`, `Tabs`, `NavigationStack`, `AnimatedNavigationStack`, `DestinationRouter`
  - Primitive components: `ModalPrimitive`, `SheetPrimitive`, `DrawerPrimitive`, `SidebarPrimitive`, `PopoverPrimitive`, `AlertPrimitive`, `TabsPrimitive`, `NavigationStackPrimitive`

### Changed
- **Organized Exports**: Created `components-exports.ts` for better code organization (separating 75+ component exports from main index)

### Fixed
- **Duplicate Export**: Removed duplicate `Unsubscribe` type export (now only exported from dependencies module, shared by WebSocket module)

### Migration Guide
All previously internal modules are now part of the public API. If you were importing from internal paths (not recommended), update to the main package export:

```typescript
// Before (v0.1.0 - internal imports, not officially supported)
import { createMockAPI } from '@composable-svelte/core/dist/api/mock-client.js';
import { Skeleton } from '@composable-svelte/core/dist/components/ui/skeleton/Skeleton.svelte';

// After (v0.2.0 - official public API)
import { createMockAPI, Skeleton } from '@composable-svelte/core';
```

## [0.1.0] - 2025-01-11

### Added

#### Core Architecture
- **Store System**: Reactive Svelte 5 store with `createStore()` API
- **Reducer Pattern**: Pure functions with `(state, action, deps) => [newState, effect]` signature
- **Effect System**: 11 effect types (none, run, fireAndForget, batch, cancellable, debounced, throttled, afterDelay, subscription, cancel, animated, transition, map)
- **Composition**: `scope()`, `scopeAction()`, `combineReducers()` for reducer composition
- **TestStore**: Exhaustive action testing with send/receive pattern

#### Navigation
- **Tree-Based Navigation**: State-driven navigation with optional/enum patterns
- **Navigation Operators**: `ifLet()`, `createDestinationReducer()`, `scopeToDestination()`
- **Navigation Components**: Modal, Sheet, Drawer, Alert, Sidebar, NavigationStack, Popover
- **Dismiss Dependency**: Child self-dismissal with `createDismissDependency()`
- **DestinationRouter**: Declarative routing component

#### DSL & Type Safety
- **createDestination()**: Generate destination reducers with template literal types
- **Matcher API**: Type-safe action matching with case paths (`Destination.is()`, `Destination.extract()`, `Destination.matchCase()`, `Destination.match()`, `Destination.on()`)
- **Fluent API**: `integrate()` builder for reducer composition, `scopeTo()` for store scoping

#### Animation
- **PresentationState**: Animation lifecycle management (idle → presenting → presented → dismissing)
- **Motion One Integration**: Spring physics and gesture-driven animations
- **Animation Helpers**: `animateModal()`, `animateSheet()`, `animateDrawer()`, `animateAlert()`, `animateAccordion()`
- **Timeout Fallbacks**: Graceful recovery from animation failures

#### Backend Integration
- **API Client**: HTTP/REST client with interceptors, retry logic, caching, deduplication
- **WebSocket**: Real-time communication with reconnection, channels, heartbeat, message queuing
- **Dependencies**: Clock (System/Mock), Storage (localStorage/sessionStorage/cookies)
- **Testing Utilities**: Mock/Spy clients for API and WebSocket

#### URL Routing
- **Browser History Sync**: Two-way synchronization with browser navigation
- **Pattern Matching**: URL pattern matching with path-to-regexp
- **Query Parameters**: Type-safe query parameter handling with Zod schemas
- **Deep Linking**: Support for app → URL and URL → app navigation

#### Component Library
- **73+ UI Components**: Full shadcn-svelte integration
- **Form Components**: Input, Textarea, Checkbox, Radio, Switch, Select, Combobox, File Upload
- **Data Components**: DataTable, Pagination, Calendar, Tree View, Carousel
- **Overlay Components**: Tooltip, Dropdown Menu, Command Palette, Toast
- **Layout Components**: Accordion, Collapsible, Tabs, Breadcrumb, Separator

#### Documentation
- **21 Documentation Files**: 20,000+ lines of professional-grade documentation
- **Getting Started Guide**: First app tutorial with counter example
- **Core Concepts**: Store, reducers, effects, composition, testing
- **Navigation Guides**: Tree-based navigation, components, dismiss patterns
- **DSL Reference**: Destinations, matchers, scope helpers
- **API Reference**: Complete API documentation with 500+ code examples
- **Troubleshooting**: Common issues and solutions
- **Migration Guide**: From Redux, TCA, MobX, Svelte stores

### Testing
- **1504 Tests**: Comprehensive test coverage across all modules
- **68 Test Files**: Unit, integration, and browser tests
- **100% Pass Rate**: All tests passing (5 skipped for browser-specific features)

### Infrastructure
- **TypeScript**: Strict mode with exactOptionalPropertyTypes
- **Build System**: Vite + tsc for optimized builds
- **Testing**: Vitest + Playwright for unit and browser tests
- **CI/CD**: GitHub Actions workflow for automated testing and building

### Fixed
- All 66+ TypeScript build errors (animation types, API cache, exactOptionalPropertyTypes)
- All 8 failing tests (accordion, sidebar, modal, alert, dropdown-menu)

[0.2.0]: https://github.com/jbelolo/composable-svelte/releases/tag/v0.2.0
[0.1.0]: https://github.com/jbelolo/composable-svelte/releases/tag/v0.1.0

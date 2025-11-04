# Changelog

All notable changes to `@composable-svelte/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

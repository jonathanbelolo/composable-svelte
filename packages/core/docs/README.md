# Composable Svelte Documentation

Welcome to the complete documentation for **@composable-svelte/core** - a Composable Architecture library for Svelte 5.

## 📚 Documentation Index

### Getting Started
- **[Getting Started](./getting-started.md)** - Installation, first app, and core concepts

### Core Concepts
- **[Store and Reducers](./core-concepts/store-and-reducers.md)** - State management fundamentals
- **[Effects](./core-concepts/effects.md)** - Declarative side effects system
- **[Composition](./core-concepts/composition.md)** - Composing reducers with `scope()` and `combineReducers()`
- **[Testing](./core-concepts/testing.md)** - TestStore and exhaustive testing patterns

### Navigation
- **[Tree-Based Navigation](./navigation/tree-based.md)** - State-driven navigation with `ifLet()` and `PresentationAction`
- **[Navigation Components](./navigation/components.md)** - Modal, Sheet, Drawer, Alert, NavigationStack
- **[Dismiss Dependency](./navigation/dismiss.md)** - Child self-dismissal patterns

### DSL & Advanced Patterns
- **[Destination DSL](./dsl/destinations.md)** - `createDestination()` for enum destinations
- **[Matcher API](./dsl/matchers.md)** - Type-safe action matching with case paths
- **[Scope Helpers](./dsl/scope-helpers.md)** - `scopeTo()` fluent API for views

### Animation
- **[Animation System](./animation/animated-navigation.md)** - PresentationState lifecycle and Motion One integration

### Backend Integration
- **[API Client](./backend/api-client.md)** - HTTP/REST client with effects, interceptors, retries
- **[WebSocket](./backend/websocket.md)** - Real-time communication with reconnection and channels
- **[Dependencies](./backend/dependencies.md)** - Clock, Storage (localStorage/cookies)

### URL Routing
- **[Browser History](./routing/url-sync.md)** - URL synchronization and pattern matching

### Reference
- **[API Reference](./api/reference.md)** - Complete API documentation
- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
- **[Migration Guide](./migration.md)** - Upgrading between versions

## 🎯 Quick Links

### By Use Case

**Building a Simple App?**
→ Start with [Getting Started](./getting-started.md)

**Adding Navigation?**
→ Check [Tree-Based Navigation](./navigation/tree-based.md) and [Navigation Components](./navigation/components.md)

**Need Backend Integration?**
→ See [API Client](./backend/api-client.md) or [WebSocket](./backend/websocket.md)

**Want Type-Safe Routing?**
→ Read [Matcher API](./dsl/matchers.md) and [Destination DSL](./dsl/destinations.md)

**Testing Your App?**
→ Follow [Testing Guide](./core-concepts/testing.md)

### By Experience Level

**Beginner** (New to Composable Architecture):
1. [Getting Started](./getting-started.md)
2. [Store and Reducers](./core-concepts/store-and-reducers.md)
3. [Effects](./core-concepts/effects.md)
4. [Testing](./core-concepts/testing.md)

**Intermediate** (Building Real Apps):
5. [Composition](./core-concepts/composition.md)
6. [Tree-Based Navigation](./navigation/tree-based.md)
7. [Navigation Components](./navigation/components.md)
8. [API Client](./backend/api-client.md)

**Advanced** (Mastering the DSL):
9. [Destination DSL](./dsl/destinations.md)
10. [Matcher API](./dsl/matchers.md)
11. [Animation System](./animation/animated-navigation.md)
12. [URL Routing](./routing/url-sync.md)

## 📖 Documentation Structure

```
packages/core/docs/
├── README.md (this file)
├── getting-started.md
│
├── core-concepts/
│   ├── store-and-reducers.md
│   ├── effects.md
│   ├── composition.md
│   └── testing.md
│
├── navigation/
│   ├── tree-based.md
│   ├── components.md
│   └── dismiss.md
│
├── dsl/
│   ├── destinations.md
│   ├── matchers.md
│   └── scope-helpers.md
│
├── animation/
│   └── animated-navigation.md
│
├── backend/
│   ├── api-client.md
│   ├── websocket.md
│   └── dependencies.md
│
├── routing/
│   └── url-sync.md
│
├── api/
│   └── reference.md
│
├── troubleshooting.md
└── migration.md
```

## 🎓 Learning Path

### Week 1: Fundamentals
- Day 1-2: [Getting Started](./getting-started.md) + Build a counter
- Day 3-4: [Store and Reducers](./core-concepts/store-and-reducers.md) + Build a todo list
- Day 5-7: [Effects](./core-concepts/effects.md) + Add async operations

### Week 2: Navigation & Testing
- Day 1-3: [Navigation](./navigation/tree-based.md) + Add modals/sheets
- Day 4-5: [Testing](./core-concepts/testing.md) + Write tests for your app
- Day 6-7: [Composition](./core-concepts/composition.md) + Refactor to nested features

### Week 3: Backend & Advanced
- Day 1-2: [API Client](./backend/api-client.md) + Integrate with backend
- Day 3-4: [WebSocket](./backend/websocket.md) (if needed)
- Day 5-7: [DSL](./dsl/destinations.md) + Type-safe routing

### Week 4: Polish
- Day 1-2: [Animation](./animation/animated-navigation.md) + Add transitions
- Day 3-4: [URL Routing](./routing/url-sync.md) + Browser history
- Day 5-7: Polish UI, write more tests, deploy

## 💡 Examples

Learn by example! Check out these complete applications:

### [Product Gallery](../../../examples/product-gallery/)
Full-featured e-commerce app with:
- Product browsing and filtering
- Add to cart functionality
- Modal/sheet navigation
- API integration
- URL routing

### [Styleguide](../../../examples/styleguide/)
Component showcase with:
- 73+ shadcn-svelte components
- All navigation patterns
- Animation examples
- Form validation with Zod

### [URL Routing](../../../examples/url-routing/)
Browser history integration with:
- Pattern matching (path-to-regexp)
- Query parameters
- Deep linking
- Back/forward navigation

## 🔧 API Overview

### Core

```typescript
// Store
createStore({ initialState, reducer, dependencies })
store.state // Reactive Svelte $state
store.dispatch(action)
store.subscribe(listener)

// Effects
Effect.none()
Effect.run(async (dispatch) => {})
Effect.fireAndForget(async () => {})
Effect.batch(...effects)
Effect.merge(...effects)
Effect.cancel(id)

// Testing
createTestStore({ initialState, reducer, dependencies })
testStore.send(action, assertion)
testStore.receive(action, assertion)
```

### Navigation

```typescript
// Operators
ifLet(/* lenses */)(state, action, deps)
createDestinationReducer({ addItem, editItem })

// Components
<Modal store={scopedStore}>
<Sheet store={scopedStore}>
<Drawer store={scopedStore}>
<Alert store={scopedStore}>
<NavigationStack store={scopedStore}>
```

### DSL

```typescript
// Destination DSL
const { reducer, Destination } = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// Matchers
Destination.is(action, 'addItem.saveButtonTapped')
Destination.extract(state, 'editItem')
Destination.matchCase(action, state, 'addItem.saveButtonTapped')

// Scope helpers
scopeTo(store).into('destination').case('addItem')
```

### Backend

```typescript
// API
const api = createLiveAPI({ baseURL: '...' });
await api.get('/users', { params, headers });

// WebSocket
const ws = createLiveWebSocket({ url: 'wss://...' });
ws.connect();
ws.send(message);
ws.on('message', handler);

// Dependencies
const clock = createSystemClock();
const storage = createLocalStorage<T>();
const cookies = createCookieStorage<T>();
```

## 🐛 Troubleshooting

Common issues? Check [Troubleshooting](./troubleshooting.md):

- **TypeScript Errors**: Type inference issues and solutions
- **Effect Not Running**: Common effect execution pitfalls
- **Navigation Not Working**: State/action mismatch debugging
- **Tests Failing**: TestStore patterns and common mistakes
- **Performance Issues**: Optimization strategies

## 🚀 Deployment

Ready to deploy? See:

- **[Build Configuration](#)** - Vite/SvelteKit setup
- **[Bundle Optimization](#)** - Tree-shaking and code splitting
- **[Production Checklist](#)** - Pre-deployment verification

## 📝 Contributing

Want to improve the docs? See [Contributing Guidelines](../../../CONTRIBUTING.md).

## 📜 License

MIT - see [LICENSE](../../../LICENSE).

## 🙏 Acknowledgments

Heavily inspired by [The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture) by Point-Free.

---

**Ready to get started?** → [Getting Started](./getting-started.md)

**Have questions?** → [GitHub Discussions](https://github.com/jonathanbelolo/composable-svelte/discussions)

**Found a bug?** → [GitHub Issues](https://github.com/jonathanbelolo/composable-svelte/issues)

# @composable-svelte/core

> A Composable Architecture for Svelte 5 - Type-safe state management with reducers, effects, and navigation

[![npm version](https://img.shields.io/npm/v/@composable-svelte/core.svg)](https://www.npmjs.com/package/@composable-svelte/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Svelte 5](https://img.shields.io/badge/Svelte-5-orange)](https://svelte.dev/)

Inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS, adapted for Svelte 5 and TypeScript.

## Features

- ✅ **Pure Reducers**: Predictable state management with `(state, action, deps) => [newState, effect]`
- ✅ **Declarative Effects**: Side effects as data structures (run, fireAndForget, batch, merge, cancel)
- ✅ **Composability**: Nest and scope reducers like Lego blocks
- ✅ **Collection Management**: `forEach` combinator for managing dynamic arrays of child features (92% less boilerplate)
- ✅ **Type-Safe Navigation**: State-driven navigation with Modal, Sheet, Drawer, Alert, NavigationStack
- ✅ **Internationalization**: Complete i18n with ICU MessageFormat, locale detection, framework formatters
- ✅ **Server-Side Rendering**: Production-ready SSR with Fastify, state hydration, security hardening
- ✅ **Static Site Generation**: Multi-locale SSG with dynamic routes and build-time optimization
- ✅ **Svelte 5 Runes**: Full integration with Svelte's reactivity system (\`$state\`, \`$derived\`)
- ✅ **TestStore**: Exhaustive action testing with send/receive pattern
- ✅ **Complete Backend**: API client, WebSocket, Storage, Clock dependencies
- ✅ **73+ Components**: shadcn-svelte integration with reducer-driven patterns
- ✅ **URL Routing**: Browser history sync with pattern matching
- ✅ **500+ Tests**: Comprehensive test coverage across all modules

## Installation

\`\`\`bash
npm install @composable-svelte/core
# or
pnpm add @composable-svelte/core
# or
yarn add @composable-svelte/core
\`\`\`

**Peer Dependencies**: Svelte 5.0.0 or higher

## Quick Start

### 1. Define Your State and Actions

\`\`\`typescript
import { createStore, Effect } from '@composable-svelte/core';

interface CounterState {
  count: number;
  isLoading: boolean;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'incrementAsync' }
  | { type: 'incrementCompleted' };
\`\`\`

### 2. Create a Reducer

\`\`\`typescript
const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

    case 'incrementAsync':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          dispatch({ type: 'incrementCompleted' });
        })
      ];

    case 'incrementCompleted':
      return [
        { ...state, count: state.count + 1, isLoading: false },
        Effect.none()
      ];
  }
};
\`\`\`

### 3. Create the Store

\`\`\`typescript
const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
\`\`\`

### 4. Use in Svelte Component

\`\`\`svelte
<script lang="ts">
  import { store } from './counter-store';
</script>

<div>
  <h1>Count: {store.state.count}</h1>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    +
  </button>
  <button onclick={() => store.dispatch({ type: 'decrement' })}>
    -
  </button>
  <button
    onclick={() => store.dispatch({ type: 'incrementAsync' })}
    disabled={store.state.isLoading}
  >
    Async +
  </button>
</div>
\`\`\`

## Documentation

Comprehensive documentation is available in the \`docs/\` directory:

- **[Getting Started](./docs/getting-started.md)** - First app tutorial
- **[Core Concepts](./docs/core-concepts/)** - Store, reducers, effects, composition, testing
- **[Navigation](./docs/navigation/)** - Tree-based navigation, components, dismiss patterns
- **[DSL](./docs/dsl/)** - Destinations, matchers, scope helpers
- **[Animation](./docs/animation/)** - Motion One integration
- **[Backend](./docs/backend/)** - API client, WebSocket, dependencies
- **[Routing](./docs/routing/)** - URL synchronization
- **[API Reference](./docs/api/)** - Complete API documentation
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions
- **[Migration](./docs/migration.md)** - From Redux, TCA, MobX, Svelte stores

## Examples

See the \`examples/\` directory for working examples:

- **[Styleguide](../../examples/styleguide)** - Component showcase with 73+ components
- **[Product Gallery](../../examples/product-gallery)** - Full-featured product browsing app
- **[URL Routing](../../examples/url-routing)** - Browser history integration examples

## Contributing

Contributions are welcome! This project follows a specification-first approach. See [CLAUDE.md](../../CLAUDE.md) for contributor guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Heavily inspired by [The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture) by Point-Free. Adapted for Svelte 5 and TypeScript with love.

## Links

- [Documentation](./docs/)
- [GitHub Repository](https://github.com/jbelolo/composable-svelte)
- [Issue Tracker](https://github.com/jbelolo/composable-svelte/issues)
- [Changelog](./CHANGELOG.md)

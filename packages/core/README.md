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
- ✅ **Component library**: shadcn-svelte integration with reducer-driven patterns — browse the full set in [the styleguide](../../examples/styleguide)
- ✅ **URL Routing**: Browser history sync with pattern matching
- ✅ **500+ Tests**: Comprehensive test coverage across all modules

## Installation

```bash
npm install @composable-svelte/core
# or
pnpm add @composable-svelte/core
# or
yarn add @composable-svelte/core
```

**Peer Dependencies**: Svelte 5.0.0 or higher. Tailwind CSS (v3 or v4) is an
optional peer dependency — required if you use the component library.

## Styling & Theming

The components are styled with Tailwind utility classes, not scoped CSS. Tailwind
therefore has to know two things: **where this package's classes live**, and **what
the design tokens resolve to**. Miss either and components render with no
background — the classic symptom is a popover or dropdown that shows its border
and shadow but is see-through.

Pick the section matching your Tailwind version.

### Tailwind v4

Add one import to your app stylesheet, after Tailwind itself:

```css
/* src/app.css */
@import 'tailwindcss';
@import '@composable-svelte/core/styles/tailwind.css';
```

That is the whole setup. It registers this package as a content source, defines
the `.dark` variant, and maps the tokens onto Tailwind's `--color-*` theme
variables. No `tailwind.config` file is needed.

### Tailwind v3

Extend the published preset, and import the token stylesheet:

```js
// tailwind.config.js
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';

export default {
  presets: [composableSvelte],
  content: ['./src/**/*.{html,js,svelte,ts}', contentGlob]
};
```

```css
/* src/app.css */
@import '@composable-svelte/core/styles/globals.css';
```

The preset supplies the colour map, `darkMode: 'class'` and the `.dark` safelist.

`contentGlob` must be listed explicitly: Tailwind v3 does not merge a preset's
own `content` into the resolved config, so a preset cannot register its source
files for you.

Using the export saves you hardcoding an install path that moves with hoisting,
workspace linking and custom install locations — and that does not exist under
Yarn PnP. A hand-written `./node_modules/@composable-svelte/core/dist/**` glob
does work under npm, yarn and pnpm's default layouts if you prefer it.

### Overriding the theme

Tokens are HSL triplets (no `hsl()` wrapper, so Tailwind can apply opacity
modifiers). Redefine any of them after importing our stylesheet:

```css
:root { --primary: 262 83% 58%; }
.dark { --primary: 263 70% 50%; }
```

Two details worth knowing on Tailwind v4, where our tokens sit in a real `@layer base`:

- Set **both** `:root` and `.dark`, even for a colour that does not change. An
  unlayered `:root` override beats everything layered, including our `.dark`
  block — so overriding only `:root` pins that colour in dark mode too.
- If you put your override inside `@layer base` yourself, it must come **after**
  the import; an earlier one loses to ours.

The full list is in `styles/tokens.css`. Every component colour ends in a literal
fallback, so a missing token degrades to the default light theme rather than to a
transparent surface. That safety net only applies once Tailwind is generating the
classes — if it is not scanning this package, nothing is emitted to fall back.

### Dark mode

Dark mode is class-based: put `dark` on `<html>`. `themeManager` does this for
you, including system-preference tracking and persistence:

```ts
import { themeManager } from '@composable-svelte/core/styles';

onMount(() => themeManager.initialize()); // call in onMount to avoid SSR mismatch
themeManager.setTheme('dark');
```

### Which stylesheet do I import?

| Entry | Use when |
|---|---|
| `styles/tailwind.css` | Tailwind v4 — the only import you need |
| `styles/globals.css` | Tailwind v3, with the preset |
| `styles/tokens.css` | You are wiring Tailwind yourself and want tokens only |
| `styles/theme.css` | Legacy. Declares the `--color-`-prefixed names shipped through v0.5.x; kept for back-compatibility |

**Import exactly one entry point.** `theme.css` and `globals.css` declare two
different token vocabularies (`--color-popover` vs `--popover`). Both are
understood, but importing *both* actively breaks branding: `globals.css` declares
the unprefixed names at our defaults, and since the resolution chain tries those
first, they shadow any `--color-*` override you had set. If you are upgrading from
v0.5.x with customised `--color-*` values, keep `theme.css` alone or move your
overrides to the unprefixed names.

### Troubleshooting transparent components

1. **Popover/dropdown/select is see-through** — Tailwind resolved `bg-popover` to
   an undefined variable. Confirm you imported one of the stylesheets above, and
   on v3 that `presets: [composableSvelte]` is present.
2. **Everything is unstyled** — Tailwind is not scanning this package. On v3,
   confirm `contentGlob` is in your `content` array. On v4, add an explicit
   `@source` — but note it resolves **relative to the CSS file, not the project
   root**, so from a conventional `src/app.css` it is:

   ```css
   @source "../node_modules/@composable-svelte/core/dist";
   ```

   Writing `./node_modules/...` there resolves to `src/node_modules/...` and
   silently matches nothing.
3. **Dark mode does nothing** — the `dark` class must be on `<html>`, and on v3
   your config needs the preset (it supplies both `darkMode` and the safelist that
   stops the dark token block being purged).

## Quick Start

### 1. Define Your State and Actions

```typescript
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
```

### 2. Create a Reducer

```typescript
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
```

### 3. Create the Store

```typescript
const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
```

### 4. Use in Svelte Component

```svelte
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
```

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

- **[Styleguide](../../examples/styleguide)** - Component showcase
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

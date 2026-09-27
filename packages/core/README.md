# @composable-svelte/core

> The architecture checker is completely optional and its use is discouraged. Its effectiveness on real agent-authored applications is untested as a reliability claim; it is not a reliable way to assess architectural correctness. It can miss violations and reject valid code. Agents must not treat a passing result, including `qualification: "passed"`, as architectural approval or a completion criterion. Follow the application contract, review the source, and test behavior and ownership directly. The checker has implementation tests, but those do not establish its practical reliability.

> A Composable Architecture for Svelte 5 - Type-safe state management with reducers, effects, and navigation

[![npm version](https://img.shields.io/npm/v/@composable-svelte/core.svg)](https://www.npmjs.com/package/@composable-svelte/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Svelte 5](https://img.shields.io/badge/Svelte-5-orange)](https://svelte.dev/)

Inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS, adapted for Svelte 5 and TypeScript.

## Upgrade 1 — core 0.14

Install `@composable-svelte/core` or pin `@composable-svelte/core@0.14.0`. 0.14.0 adds opt-in
[fluid layout motion and staged routing](./docs/fluid-motion.md); applications that do not import it are
unaffected. Read the [release scope and migration notes](./docs/prerelease.md) before upgrading from 0.12 or earlier.

## Start here

Start with the [application authoring contract](./docs/application-contract.md),
the authoritative architecture guide for application authors and AI agents.
Then read the [consumer guide](./docs/consumer.md) for a tested toolchain, lifecycle
rules, server boundaries and guidance for coding agents. A runnable
[Vite starter](./consumer/README.md) ships in this package: copy it out of
`node_modules`, install its dependencies, and run its checks. No repository
checkout or contributor skills are needed.

For implementation, read the [agent authoring patterns](./docs/agent-patterns.md),
copy from the [executable examples](./docs/examples/agent-patterns/README.md), and
use the [owned-work testing guide](./docs/testing-owned-work.md). These references
ship with the installed version and cover factoring, ownership and async correctness.

## Packages

| Package | Use for | Limits |
|---|---|---|
| [core](https://www.npmjs.com/package/@composable-svelte/core) | State, effects, navigation, UI, forms, networking, i18n, SSR | No built-in persistence or devtools |
| [auth](https://www.npmjs.com/package/@composable-svelte/auth) | Sessions and account flows | One HTTP contract; other backends need adapters |
| [charts](https://www.npmjs.com/package/@composable-svelte/charts) | Scatter, line, bar, area, histogram | Other chart types are deferred |
| [chat](https://www.npmjs.com/package/@composable-svelte/chat) | Streaming chat, presence, typing, cursors | No CRDT document collaboration |
| [code](https://www.npmjs.com/package/@composable-svelte/code) | CodeMirror, Prism, SvelteFlow | Wrappers around those engines |
| [media](https://www.npmjs.com/package/@composable-svelte/media) | Audio, video embeds, voice input | Transcription is application-provided; no streaming video player |
| [graphics](https://www.npmjs.com/package/@composable-svelte/graphics) | Babylon scenes and WebGL overlays | WebGL by default. Real WebGPU (introduced in graphics 0.4.0) only when requested explicitly (`renderer: 'webgpu'`), with no silent fallback |
| [maps](https://www.npmjs.com/package/@composable-svelte/maps) | MapLibre maps and optional Mapbox adapter | Clustering, geocoding, drawing and routing remain unbuilt |

Install the packages you need; their manifests declare compatible peers.
See the [component catalog](./docs/components.md) for public import paths.

The architecture checker is completely optional and use is discouraged. The starter does not install it. Do not use its results as architectural approval.
The runtime companion packages listed above declare `@composable-svelte/core ^0.14.0`
in their coordinated minor releases (auth, charts, maps and graphics 0.4.0; code, chat and media 0.6.0), minor rather than patch because their core peer floor rises. `@composable-svelte/architecture` stays at 0.13.1 and is not qualified against core 0.14. `@composable-svelte/code` requires Svelte `^5.30.0`,
so an application that includes it needs Svelte 5.30 or newer.

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
- ✅ **Component library**: shadcn-svelte integration with reducer-driven patterns — browse the full set in [the styleguide](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/styleguide)
- ✅ **URL Routing**: Browser history sync with pattern matching
- ✅ **Fluid layout motion** (opt-in; introduced in 0.14.0): staged route transitions and within-page choreography with representation providers, from `@composable-svelte/core/application/motion`. See [Fluid Layout Motion & Staged Routing](./docs/fluid-motion.md)
- ✅ **3,116 tests**: browser and node suites, measured at the R1 closure's exit (2026-09-05)

## Installation

```bash
npm install @composable-svelte/core@0.14.0
# or
pnpm add @composable-svelte/core@0.14.0
# or
yarn add @composable-svelte/core@0.14.0
```

**Peer Dependencies**: Svelte 5.20.0 or higher. Tailwind CSS (v3 or v4) is an
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

The four snippets form one browser-only demonstration. For reusable components
and SSR, use the packaged starter's per-owner stores and cleanup; do not share
a module-level store between server requests.

### 1. Define Your State and Actions

<!-- consumer-file: counter-store.ts -->
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

<!-- consumer-file: counter-store.ts -->
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

<!-- consumer-file: counter-store.ts -->
```typescript
export const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
```

### 4. Use in Svelte Component

<!-- consumer-file: Core.svelte -->
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

### Native commands in managed feature views

Components that own an editor, player or canvas can observe commands reduced by
their **own** managed child view with `observeChildActions` from
`@composable-svelte/core/application`. Use `isManagedChildView` to choose this
path when the same component also accepts a standalone `Store`. The complete
[typed bridge](./docs/examples/agent-patterns/src/native-commands.ts) is part of
the compiled agent-pattern examples; the [application contract](./docs/application-contract.md#native-commands-from-child-views)
explains delivery and cleanup.

Attach after the native engine is ready. Commands dispatched before attachment
are dropped, and a retired owner stops delivering without a final callback. A
child action that retires its own owner is not delivered. Use the parent reducer
for business results such as a saved document or completed transcript; the
observer is for local native commands such as focus or seek.

## Documentation

Comprehensive documentation is available in the \`docs/\` directory:

- **[Getting Started](./docs/getting-started.md)** - First app tutorial
- **[Core Concepts](./docs/core-concepts/store-and-reducers.md)** - Store, reducers, effects, composition, testing
- **[Navigation](./docs/navigation/tree-based.md)** - Tree-based navigation, components, dismiss patterns
- **[DSL](./docs/dsl/destinations.md)** - Destinations, matchers, scope helpers
- **[Animation](./docs/animation/animated-navigation.md)** - Motion One integration
- **[Fluid Layout Motion & Staged Routing](./docs/fluid-motion.md)** (0.14.0) - Cross-route and within-page choreography, providers, qualified limits
- **[Backend](./docs/backend/api-client.md)** - API client, WebSocket, dependencies
- **[Routing](./docs/routing/url-sync.md)** - URL synchronization
- **[API Reference](./docs/api/reference.md)** - Complete API documentation
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions
- **[Migration](./docs/migration.md)** - From Redux, TCA, MobX, Svelte stores

## Examples

See the \`examples/\` directory for working examples:

- **[Styleguide](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/styleguide)** - Component showcase
- **[Product Gallery](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/product-gallery)** - Full-featured product browsing app
- **[URL Routing](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/url-routing)** - Browser history integration examples

## Contributing

Contributions are welcome! This project follows a specification-first approach. See [CLAUDE.md](https://github.com/jonathanbelolo/composable-svelte/blob/main/CLAUDE.md) for contributor guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Heavily inspired by [The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture) by Point-Free. Adapted for Svelte 5 and TypeScript with love.

## Links

- [Documentation](./docs/README.md)
- [GitHub Repository](https://github.com/jonathanbelolo/composable-svelte)
- [Issue Tracker](https://github.com/jonathanbelolo/composable-svelte/issues)
- [Changelog](./CHANGELOG.md)

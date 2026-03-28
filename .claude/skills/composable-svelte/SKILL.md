---
name: composable-svelte
description: "Umbrella overview of the Composable Svelte library. Use when the user asks general questions about composable-svelte, wants to know which package or module to use, or needs the big-picture architecture before diving into a specific feature. Points to the 14 domain-specific skills for implementation details."
---

# Composable Svelte — Overview

Composable Svelte is a state management and UI architecture library for Svelte 5, inspired by The Composable Architecture (TCA) from Swift.

## Architecture: Store-Reducer-Effect

Every feature follows this flow:

```
User Action → store.dispatch(action)
                    ↓
              reducer(state, action, deps) → [newState, effect]
                    ↓                              ↓
              State updates (immutable)      Effect executes async
              UI re-renders automatically    May dispatch more actions
```

- **Reducer**: Pure function. No mutations, no side effects. Returns new state + an Effect.
- **Effect**: Data structure describing a side effect. Executed by the store *after* state updates.
- **Store**: Runtime that holds reactive state, dispatches actions, executes effects.

## Store Reactivity

The store uses `$state.raw()` internally. Both access patterns work:

```svelte
<!-- Rune-based (recommended) -->
const count = $derived(store.state.count);

<!-- Subscription-based (also works) -->
{$store.count}
```

## Packages and When to Use Each Skill

| Need | Package | Skill to load |
|------|---------|---------------|
| Store, reducers, effects, composition | `@composable-svelte/core` | `composable-svelte-core` |
| UI components (Button, Card, Input, 70+) | `@composable-svelte/core/components/ui` | `composable-svelte-components` |
| Forms with Zod validation | `@composable-svelte/core/components/form` | `composable-svelte-forms` |
| Modal, Sheet, Drawer, Alert, navigation | `@composable-svelte/core/navigation-components` | `composable-svelte-navigation` |
| URL routing, browser history | `@composable-svelte/core/routing` | `composable-svelte-core` |
| HTTP client, interceptors, retries | `@composable-svelte/core/api` | `composable-svelte-core` |
| WebSocket, reconnection, channels | `@composable-svelte/core/websocket` | `composable-svelte-core` |
| Internationalization (i18n) | `@composable-svelte/core/i18n` | `composable-svelte-i18n` |
| Server-side rendering, hydration | `@composable-svelte/core/ssr` | `composable-svelte-ssr` |
| Static site generation | `@composable-svelte/core/ssr/ssg` | `composable-svelte-ssr` |
| TestStore, send/receive testing | `@composable-svelte/core/test` | `composable-svelte-testing` |
| Charts and data visualization | `@composable-svelte/charts` | `composable-svelte-charts` |
| Streaming chat, LLM interfaces | `@composable-svelte/chat` | `composable-svelte-chat` |
| Code editor, syntax highlighting | `@composable-svelte/code` | `composable-svelte-code` |
| 3D graphics, WebGL/WebGPU | `@composable-svelte/graphics` | `composable-svelte-graphics` |
| Interactive maps, GeoJSON | `@composable-svelte/maps` | `composable-svelte-maps` |
| Audio, video, voice input | `@composable-svelte/media` | `composable-svelte-media` |
| Docker, Fly.io deployment | — | `composable-svelte-deployment` |

## Quick Patterns

### Create a feature

```typescript
// 1. Types
interface MyState { items: Item[]; isLoading: boolean; }
type MyAction = { type: 'load' } | { type: 'loaded'; items: Item[] };

// 2. Reducer (pure function)
const myReducer: Reducer<MyState, MyAction, MyDeps> = (state, action, deps) => {
  switch (action.type) {
    case 'load':
      return [{ ...state, isLoading: true }, Effect.run(async (dispatch) => {
        const items = await deps.fetchItems();
        dispatch({ type: 'loaded', items });
      })];
    case 'loaded':
      return [{ ...state, items: action.items, isLoading: false }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// 3. Store
const store = createStore({ initialState, reducer: myReducer, dependencies });
```

### Compose features

```typescript
import { scope, combineReducers } from '@composable-svelte/core';

// Embed child reducer into parent
const parentReducer = scope(
  s => s.child, (s, c) => ({ ...s, child: c }),  // state lens
  a => a.type === 'child' ? a.action : null,      // action prism
  ca => ({ type: 'child', action: ca }),           // action wrapper
  childReducer
);
```

### Test a feature

```typescript
const store = createTestStore({ initialState, reducer, dependencies: mockDeps });
await store.send({ type: 'load' }, s => expect(s.isLoading).toBe(true));
await store.receive({ type: 'loaded' }, s => expect(s.items).toHaveLength(3));
```

## Project Layout

```
packages/core/src/lib/     — Core library source (store, effects, composition, navigation, components, routing, api, websocket, i18n, ssr)
packages/{chat,charts,code,graphics,maps,media}/  — Satellite packages
examples/                  — 11 example applications
guides/                    — Architecture guides and tutorials
.claude/skills/            — This skill system (14 domain skills + this umbrella)
```

## Key Files

- `packages/core/src/lib/store.svelte.ts` — Store implementation ($state.raw)
- `packages/core/src/lib/effect.ts` — All 12 effect types
- `packages/core/src/lib/types.ts` — Core type definitions
- `packages/core/src/lib/test/test-store.ts` — TestStore for testing
- `guides/README.md` — Full tutorial and package reference

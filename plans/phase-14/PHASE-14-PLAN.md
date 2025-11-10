# Phase 14: Server-Side Rendering (SSR) Support

**Status**: Planning
**Priority**: High
**Estimated Duration**: 6-8 weeks
**Dependencies**: Phase 1-8 (Core architecture, Navigation, Backend integration)

---

## Overview

Add first-class Server-Side Rendering (SSR) support to Composable Svelte, enabling:
- SvelteKit integration with load functions
- State serialization and hydration
- Effect deferral (client-only execution)
- Zero breaking changes to existing API
- Opt-in SSR configuration

---

## Goals

### Primary Goals
1. ✅ **Isomorphic Store**: Single store implementation works on server and client
2. ✅ **Effect Deferral**: Effects don't execute on server by default (safe)
3. ✅ **State Hydration**: Server state transfers to client seamlessly
4. ✅ **SvelteKit Integration**: First-class support for load functions
5. ✅ **Backward Compatible**: Existing client-only code works unchanged

### Secondary Goals
6. ✅ Server-safe effects (data fetching) - Phase 15
7. ✅ State transformers (custom serialization) - Phase 15
8. ✅ Streaming SSR support - Phase 16

---

## Key Design Decisions

### Decision 1: Single Store Implementation
**Choice**: One `createStore()` that adapts to environment
**Alternative**: Separate `createServerStore()` and `createClientStore()`
**Rationale**: Simpler API, less code duplication, easier maintenance

### Decision 2: Effect Deferral by Default
**Choice**: All effects skipped on server unless explicitly marked safe
**Alternative**: Execute effects on server, track which APIs are used
**Rationale**: Safe by default, no risk of server crashes, predictable behavior

### Decision 3: Explicit Hydration
**Choice**: Developer calls `serializeStore()` and `hydrateStore()`
**Alternative**: Automatic hydration via magic comments
**Rationale**: Explicit is better than implicit, full control over data transfer

### Decision 4: SvelteKit-First Integration
**Choice**: Optimize for SvelteKit load functions
**Alternative**: Framework-agnostic SSR
**Rationale**: SvelteKit is the standard, can add other frameworks later

---

## Architecture

### New API Surface

```typescript
// 1. SSR Configuration (optional)
interface StoreConfig<State, Action, Dependencies> {
  // ... existing fields
  ssr?: {
    /**
     * If true, effects are never executed on server.
     * Default: true (safe by default)
     */
    deferEffects?: boolean;
  };
}

// 2. Hydration Helpers
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string;

export function hydrateStore<State, Action, Dependencies>(
  data: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action>;

// 3. Environment Detection
export const isServer: boolean;
export const isClient: boolean;
```

### Store Modifications

```typescript
// packages/core/src/lib/store.ts

export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  const isServer = typeof window === 'undefined';
  const deferEffects = config.ssr?.deferEffects ?? true;

  // ... existing setup

  function dispatchCore(action: Action): void {
    // ... existing reducer logic

    // NEW: Environment-aware effect execution
    if (effect._tag !== 'None') {
      if (isServer && deferEffects) {
        // Skip effects on server
        return;
      }
      executeEffect(effect);
    }
  }

  // ... rest of implementation
}
```

---

## Implementation Plan

### Milestone 1: Core Infrastructure (Week 1-2)

**Tasks**:
- [ ] Add `ssr` field to `StoreConfig` type
- [ ] Add environment detection (`isServer`, `isClient`) to `utils.ts`
- [ ] Modify `executeEffect()` to check environment and defer if needed
- [ ] Implement `serializeStore()` helper
- [ ] Implement `hydrateStore()` helper
- [ ] Write unit tests for SSR functionality

**Files**:
- `packages/core/src/lib/types.ts` (add `ssr` to `StoreConfig`)
- `packages/core/src/lib/store.ts` (modify `executeEffect`)
- `packages/core/src/lib/ssr.ts` (NEW: hydration helpers)
- `packages/core/src/lib/utils.ts` (add environment detection)
- `packages/core/tests/ssr/store.test.ts` (NEW)

**Acceptance Criteria**:
- ✅ Effects are skipped on server when `deferEffects: true`
- ✅ Effects execute normally on client
- ✅ `serializeStore()` creates JSON string with state
- ✅ `hydrateStore()` recreates store from JSON
- ✅ All tests pass (100% coverage for SSR paths)

### Milestone 2: Dependency Management (Week 3)

**Tasks**:
- [ ] Create `createNoOpStorage()` for server
- [ ] Create `createNoOpWebSocket()` for server
- [ ] Create `createServerAPI()` that uses Node fetch
- [ ] Document dependency injection patterns
- [ ] Add examples for server/client dependencies

**Files**:
- `packages/core/src/lib/dependencies/server-storage.ts` (NEW)
- `packages/core/src/lib/dependencies/server-websocket.ts` (NEW)
- `packages/core/src/lib/dependencies/README.md` (update with SSR patterns)
- `packages/core/tests/dependencies/server.test.ts` (NEW)

**Acceptance Criteria**:
- ✅ Server dependencies work without browser APIs
- ✅ Client dependencies work as before
- ✅ Documentation shows environment-aware dependency patterns

### Milestone 3: SvelteKit Integration (Week 4-5)

**Tasks**:
- [ ] Create example SvelteKit app with SSR
- [ ] Document load function patterns (+page.server.ts)
- [ ] Document universal load patterns (+page.ts)
- [ ] Test with various routing scenarios (dynamic routes, nested routes)
- [ ] Add prerendering examples (SSG)

**Files**:
- `examples/sveltekit-ssr/` (NEW example app)
- `docs/guides/SSR.md` (NEW documentation)
- `docs/guides/SvelteKit-Integration.md` (NEW)

**Example App Features**:
- [ ] Server-rendered counter (basic)
- [ ] Server data fetching (API client)
- [ ] Form with server validation
- [ ] Dynamic routes with params
- [ ] Prerendered blog posts (SSG)

**Acceptance Criteria**:
- ✅ Example app runs successfully (`pnpm dev`)
- ✅ Server renders initial HTML with state
- ✅ Client hydrates without flicker
- ✅ No console errors or warnings
- ✅ Lighthouse score > 90

### Milestone 4: Component Updates (Week 6-7)

**Tasks**:
- [ ] Audit navigation components for SSR compatibility
- [ ] Update Modal/Sheet/Drawer to skip animation on hydration
- [ ] Update ImageLightbox to defer preloading on server
- [ ] Update Form components for server validation
- [ ] Document SSR considerations for each component

**Files**:
- `packages/core/src/lib/navigation-components/primitives/ModalPrimitive.svelte`
- `packages/core/src/lib/navigation-components/primitives/SheetPrimitive.svelte`
- `packages/core/src/lib/components/image-gallery/ImageLightbox.svelte`
- `packages/core/src/lib/components/form/` (various)
- `docs/components/SSR-Compatibility.md` (NEW)

**Acceptance Criteria**:
- ✅ All components render correctly on server
- ✅ No animation flicker on hydration
- ✅ Client-only effects properly deferred
- ✅ Documentation lists SSR status for each component

### Milestone 5: Documentation & Polish (Week 8)

**Tasks**:
- [ ] Write comprehensive SSR guide
- [ ] Add troubleshooting section (common issues)
- [ ] Document performance best practices
- [ ] Add migration guide (client-only → SSR)
- [ ] Update CLAUDE.md with SSR information
- [ ] Create video tutorial (optional)

**Files**:
- `docs/guides/SSR-Guide.md` (comprehensive guide)
- `docs/guides/SSR-Troubleshooting.md` (common issues)
- `docs/guides/SSR-Performance.md` (optimization tips)
- `CLAUDE.md` (add SSR to implementation status)
- `README.md` (mention SSR support)

**Acceptance Criteria**:
- ✅ Documentation covers all SSR features
- ✅ Examples for common use cases (forms, data fetching, auth)
- ✅ Troubleshooting guide addresses common errors
- ✅ Migration guide helps existing users adopt SSR

---

## Technical Specifications

### Serialization Format

```typescript
interface HydrationData<State> {
  state: State;
  timestamp: number;  // Server render timestamp
  version?: string;   // Optional app version
}

// Serialized as JSON
{
  "state": { "count": 0, "user": { "id": 1, "name": "Alice" } },
  "timestamp": 1704916800000,
  "version": "1.0.0"
}
```

### Effect Execution Flow

**Server**:
```
Action → Reducer → [NewState, Effect]
                         ↓
                    Skip (deferEffects: true)
                         ↓
                    State updated
                         ↓
                    Serialize state
```

**Client**:
```
Hydration → Restore state → Mount component
                                  ↓
                            Re-dispatch actions
                                  ↓
                           Effects execute
```

### Environment Detection

```typescript
// packages/core/src/lib/utils.ts

/**
 * True if running on server (Node.js).
 */
export const isServer = typeof window === 'undefined';

/**
 * True if running in browser.
 */
export const isClient = typeof window !== 'undefined';
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('SSR Store', () => {
  it('should defer effects on server', () => {
    const spy = vi.fn();
    global.window = undefined;  // Simulate server

    const store = createStore({
      initialState: { count: 0 },
      reducer: (state, action) => [
        { count: state.count + 1 },
        Effect.run(spy)
      ],
      ssr: { deferEffects: true }
    });

    store.dispatch({ type: 'increment' });

    expect(store.state.count).toBe(1);
    expect(spy).not.toHaveBeenCalled();  // Effect deferred!
  });

  it('should serialize and hydrate', () => {
    const serverStore = createStore({
      initialState: { count: 0 },
      reducer: counterReducer
    });

    serverStore.dispatch({ type: 'increment' });

    const data = serializeStore(serverStore);
    const clientStore = hydrateStore(data, {
      initialState: { count: 0 },
      reducer: counterReducer
    });

    expect(clientStore.state.count).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe('SvelteKit SSR', () => {
  it('should render with server data', async () => {
    const { load } = await import('./+page.server.ts');
    const data = await load({ fetch: globalFetch });

    const { render } = await import('./+page.svelte');
    const html = render({ data });

    expect(html).toContain('Count: 1');
  });
});
```

### E2E Tests

```typescript
describe('SSR E2E', () => {
  it('should hydrate without flicker', async () => {
    await page.goto('/ssr-example');

    // Check server-rendered content
    const serverContent = await page.textContent('h1');
    expect(serverContent).toBe('Welcome');

    // Wait for hydration
    await page.waitForLoadState('networkidle');

    // Check hydrated content (should be same)
    const clientContent = await page.textContent('h1');
    expect(clientContent).toBe('Welcome');

    // Check no console errors
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    expect(errors).toHaveLength(0);
  });
});
```

---

## Performance Targets

### Server Performance
- Store creation: < 1ms
- Dispatch + reducer: < 0.1ms per action
- Serialization: < 1ms for typical state (< 10KB)
- Total render time: < 10ms for typical page

### Client Performance
- Hydration: < 5ms for typical state
- No blocking during hydration
- No layout shift (CLS = 0)

### Bundle Size
- SSR helpers: < 3KB (minified + gzip)
- Zero impact on client-only builds (tree-shaking)
- Total library: < 50KB (with SSR)

---

## Migration Guide (for existing users)

### Before (Client-Only)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createStore } from '@composable-svelte/core';

  const store = createStore({
    initialState: { items: [] },
    reducer
  });

  onMount(() => {
    store.dispatch({ type: 'loadItems' });
  });
</script>
```

### After (SSR-Enabled)

```typescript
// +page.server.ts
export async function load() {
  const store = createStore({
    initialState: { items: [] },
    reducer,
    ssr: { deferEffects: true }
  });

  store.dispatch({ type: 'loadItems' });

  return {
    hydrationData: serializeStore(store)
  };
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { hydrateStore } from '@composable-svelte/core';

  export let data;

  const store = hydrateStore(data.hydrationData, {
    initialState: { items: [] },
    reducer
  });
</script>
```

**Changes**:
1. ✅ Move store creation to load function
2. ✅ Add `ssr: { deferEffects: true }`
3. ✅ Use `serializeStore()` to transfer state
4. ✅ Use `hydrateStore()` on client
5. ✅ Remove `onMount()` dispatch (data already loaded)

---

## Success Criteria

### Must-Have (Phase 14)
- [ ] Store defers effects on server by default
- [ ] `serializeStore()` and `hydrateStore()` work correctly
- [ ] SvelteKit example app demonstrates SSR
- [ ] All existing tests pass (no regressions)
- [ ] Documentation covers SSR setup and usage
- [ ] Zero breaking changes to existing API

### Nice-to-Have (Phase 15)
- [ ] Server-safe effect metadata (Effect.runServer)
- [ ] State transformers (custom serialization)
- [ ] Dependency injection helpers
- [ ] Advanced examples (auth, real-time, forms)

### Future (Phase 16)
- [ ] Streaming SSR support
- [ ] Selective hydration (islands architecture)
- [ ] Edge runtime support (Vercel Edge, Cloudflare Workers)
- [ ] Static site generation (SSG) optimizations

---

## Risks & Mitigations

### Risk 1: Breaking Changes
**Mitigation**: Make SSR opt-in, existing code works unchanged

### Risk 2: Complex Hydration Bugs
**Mitigation**: Comprehensive testing, clear error messages, detailed docs

### Risk 3: Performance Regression
**Mitigation**: Benchmark before/after, optimize hot paths, lazy initialization

### Risk 4: Incomplete SvelteKit Support
**Mitigation**: Work closely with SvelteKit team, follow best practices

---

## Open Questions

1. **Streaming SSR**: Should we support out-of-order hydration in Phase 14?
   - **Answer**: No, defer to Phase 16 (Advanced SSR)

2. **State Validation**: Should we validate hydrated state matches expected schema?
   - **Answer**: Yes, but only in development mode (console warnings)

3. **Middleware**: Should middleware run on server?
   - **Answer**: Future enhancement (Phase 15), not critical for initial SSR

4. **Edge Runtimes**: Should we support Vercel Edge, Cloudflare Workers?
   - **Answer**: Future enhancement (Phase 16), focus on Node.js first

---

## References

- [SvelteKit SSR Documentation](https://kit.svelte.dev/docs/server-side-rendering)
- [Svelte 5 Runes in SSR](https://svelte.dev/docs/svelte/what-are-runes#Runes-on-the-server)
- [Phase 14 Ultrathink](./SSR-ULTRATHINK.md)
- [TCA Server-Side Rendering](https://github.com/pointfreeco/swift-composable-architecture/discussions/1937)

---

## Conclusion

Phase 14 will add production-ready SSR support to Composable Svelte with:
- ✅ Minimal API surface (3 new exports)
- ✅ Safe by default (effects deferred)
- ✅ Zero breaking changes
- ✅ SvelteKit-first integration
- ✅ Comprehensive documentation

**Timeline**: 8 weeks
**Effort**: ~200 hours
**Priority**: High (critical for production apps)

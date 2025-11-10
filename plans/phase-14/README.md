# Phase 14: Static Site Generation & Server-Side Rendering

**Status**: 📋 Ready for Implementation
**Duration**: 3-4 weeks
**Priority**: 🔥 High

---

## 📘 Current Plan

### [REVISED-PHASE-14-PLAN.md](./REVISED-PHASE-14-PLAN.md) ⭐ **START HERE**

**The definitive implementation plan** based on architectural discussions and decisions.

**Key Points**:
- ✅ SSG-first approach (Static Site Generation at build time)
- ✅ Data loading OUTSIDE store on server (injected as initial state)
- ✅ No server dependencies needed (effects deferred)
- ✅ Separate entry points (server.ts / client.ts)
- ✅ Effect deferral defaults to `true`
- ✅ 3 exports: `serializeStore`, `hydrateStore`, `renderToStaticHTML`

**Implementation Timeline**:
- Week 1: Serialization + Effect Deferral
- Week 2: Rendering Helper + Tests
- Week 3: Example + Documentation
- Week 4: Polish + Ship

---

## 📚 Architecture Documents

### [SSR-REVISED-ANALYSIS.md](./SSR-REVISED-ANALYSIS.md)

**Why this approach?** Answers key questions:
- Why no SvelteKit integration?
- Why separate server/client data loading?
- Why no server dependencies?
- What's the difference between SSG and SSR?
- How does this fit Composable Architecture philosophy?

**Read this** to understand the "why" behind the decisions.

---

## 📦 Deliverables

### Core Library Changes

1. **State Serialization/Hydration**
   ```typescript
   serializeStore(store) → JSON string
   hydrateStore(data, config) → Store
   ```

2. **Effect Deferral** (automatic)
   ```typescript
   // Server: effects skipped
   // Client: effects execute
   ```

3. **Rendering Helper**
   ```typescript
   renderToStaticHTML(Component, props) → HTML
   ```

### Example Implementation

4. **SSG Blog Example**
   - Build script (`build-ssg.ts`)
   - Client entry (`client.ts`)
   - Markdown content
   - Full documentation

### Testing

5. **Comprehensive Tests**
   - 50+ unit tests
   - 5+ integration tests
   - 3+ E2E tests (with browser)

### Documentation

6. **Complete Guides**
   - SSG setup guide
   - Architecture explanation
   - Example walkthrough
   - Migration guide (none needed - additive)

---

## 🎯 Success Criteria

- [ ] Serialize/hydrate roundtrip preserves state
- [ ] Effects automatically deferred on server
- [ ] Valid HTML generated with hydration script
- [ ] Example blog builds successfully
- [ ] Client hydration works in browser
- [ ] 95%+ test coverage
- [ ] Zero breaking changes
- [ ] Bundle size < 2KB

---

## 🗂️ Archive

These documents capture the evolution of thinking but are superseded by the revised plan:

- `SSR-ULTRATHINK.md` - Initial deep analysis (assumed SvelteKit integration)
- `PHASE-14-PLAN.md` - Original plan (load functions, SvelteKit-first)
- `ARCHITECTURE-DIAGRAM.md` - Visual diagrams (still useful for reference)

**For implementation, use [REVISED-PHASE-14-PLAN.md](./REVISED-PHASE-14-PLAN.md) only.**

---

## 🚀 Quick Start (After Implementation)

```bash
# 1. Create build script
# build-ssg.ts
import { renderToStaticHTML } from '@composable-svelte/core/ssr';

const store = createStore({
  initialState: await loadData(),
  reducer
});

const html = renderToStaticHTML(App, { store });
writeFileSync('dist/index.html', html);

# 2. Run build
node build-ssg.ts

# 3. Serve static files
npx serve dist
```

---

## 💬 Questions?

See [REVISED-PHASE-14-PLAN.md](./REVISED-PHASE-14-PLAN.md) for:
- Complete API design
- Example usage
- Testing strategy
- Implementation milestones

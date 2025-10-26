# Phase 2: Navigation System - Overview

**Duration**: 3 weeks (Week 3-5)
**Status**: ✅ Ready to start
**Last Updated**: October 26, 2025

---

## Executive Summary

Phase 2 implements a comprehensive navigation system for both mobile and desktop applications. The system provides state-driven navigation through tree-based and stack-based patterns, with components covering the full spectrum from mobile overlays to desktop persistent navigation.

**Key Innovation**: Two-layer component architecture (primitives + styled) allows users to choose their level of customization, from zero-config defaults to fully custom implementations.

---

## Component Inventory

### Mobile-First Components (5 components)

1. **Modal** - Centered overlay dialogs
   - Use case: Confirmations, forms, alerts
   - Primitive + Styled variant

2. **Sheet** - Bottom drawer presentations
   - Use case: Mobile action sheets, filters
   - Primitive + Styled variant

3. **Drawer** - Side panel overlays
   - Use case: Mobile menus, navigation
   - Primitive + Styled variant

4. **NavigationStack** - Multi-screen navigation
   - Use case: Wizard flows, drill-down
   - Primitive + Styled variant

5. **Alert** - Simple confirmation dialogs
   - Use case: Yes/No prompts, warnings
   - Primitive + Styled variant

### Desktop-First Components (3 components)

6. **Sidebar** - Persistent/collapsible navigation
   - Use case: Admin panels, dashboards, SaaS apps
   - Desktop: Fixed sidebar with collapse
   - Mobile: Transforms to Drawer overlay
   - Primitive + Styled variant

7. **Tabs** - Horizontal tabbed navigation
   - Use case: Settings pages, multi-view content
   - Keyboard navigation (arrows, Home/End)
   - Desktop: Fixed tabs, Mobile: Scrollable
   - Primitive + Styled variant

8. **Popover** - Contextual positioned overlays
   - Use case: Dropdown menus, user menus, notifications
   - Auto-positioning with flip logic
   - Anchor tracking on scroll/resize
   - Primitive + Styled variant

**Total**: 8 components × 2 variants = **16 component implementations**

---

## Architecture Decisions

### Two-Layer Component System

```
┌─────────────────────────────────────────┐
│         Styled Components               │
│  (Tailwind CSS, optional defaults)      │
│                                         │
│  • Quick starts                         │
│  • Good defaults                        │
│  • `unstyled` prop to bypass styling   │
└─────────────────────────────────────────┘
              ▲
              │ wraps
              │
┌─────────────────────────────────────────┐
│      Primitive Components               │
│  (Headless, logic-only)                 │
│                                         │
│  • Portal rendering                     │
│  • Keyboard/click handling              │
│  • NO styles                            │
│  • Maximum flexibility                  │
└─────────────────────────────────────────┘
```

### Customization Levels

Users can choose their approach:

1. **Level 1**: Use styled components as-is
   - Zero configuration
   - Good defaults
   - Fastest path

2. **Level 2**: Customize styled with Tailwind
   - Override classes
   - Adjust CSS variables
   - Moderate customization

3. **Level 3**: Use primitives with custom styles
   - Full styling control
   - Bring your own CSS/Tailwind
   - Advanced usage

4. **Level 4**: Build from scratch
   - Use store state directly
   - Complete control
   - Expert level

### Import Paths

```typescript
// Styled components (default)
import { Modal, Sidebar, Tabs, Popover } from '@composable-svelte/core/navigation-components';

// Primitives (for customization)
import {
  ModalPrimitive,
  SidebarPrimitive,
  TabsPrimitive,
  PopoverPrimitive
} from '@composable-svelte/core/navigation-components/primitives';
```

---

## Task Breakdown

### 2.1: Navigation Types (1.5 hours)
- PresentationAction (wraps child actions)
- StackAction (push/pop/setPath)
- Type exports

### 2.2: Navigation Operators (8-11 hours)
- `ifLet()` - Optional child state integration
- `createDestinationReducer()` - Enum-based routing
- `matchPresentationAction()` - Parent observation helpers
- `scopeToDestination()` - Scoped stores for components

### 2.3: Stack Navigation (4-5 hours)
- Stack state helpers (push, pop, popToRoot, setPath)
- `handleStackAction()` reducer helper
- Effect collection from stack operations

### 2.4: Component Styling Setup (1.5-2 hours)
- Copy shadcn/ui Tailwind configuration and CSS variables
- Create shared component utilities (clickOutside action, portal helpers)
- Install component dependencies (@floating-ui/dom, tailwindcss-animate)

### 2.5: Dismiss Dependency (2-3 hours)
- DismissDependency interface
- `createDismissDependency()` factory
- Child self-dismissal pattern

### 2.6: Navigation Components (28-32 hours)
**16 component tasks + 2 infrastructure tasks**

#### Mobile-First (10 tasks)
- 2.5.1-2.5.2: Modal (primitive + styled)
- 2.5.3-2.5.4: Sheet (primitive + styled)
- 2.5.5-2.5.6: Drawer (primitive + styled)
- 2.5.7-2.5.8: NavigationStack (primitive + styled)
- 2.5.9-2.5.10: Alert (primitive + styled)

#### Desktop-First (6 tasks)
- 2.5.11-2.5.12: Sidebar (primitive + styled)
- 2.5.13-2.5.14: Tabs (primitive + styled)
- 2.5.15-2.5.16: Popover (primitive + styled)

#### Infrastructure (2 tasks)
- 2.5.17: Component exports
- 2.5.18: Tailwind configuration guide

### 2.7: Testing (12-16 hours)
- ifLet() operator tests
- createDestinationReducer() tests
- Stack navigation tests
- Dismiss dependency tests
- Component tests (all 16 components)

### 2.8: Example Applications (9-12 hours)
- Inventory navigation example (modals)
- Stack navigation example (multi-screen)
- Desktop navigation example (sidebar + tabs + popover)

### 2.9: Documentation & Polish (3.5 hours)
- Navigation API docs
- Full test suite verification
- Phase 2 completion summary

---

## Timeline & Estimates

**Total Duration**: 3 weeks
**Total Estimated Time**: 69-87 hours
**Weekly Commitment**: 23-29 hours/week (requires upper range for completion)

### Week-by-Week Breakdown

**Week 1** (21-27 hours):
- Complete types, operators, stack utilities (2.1-2.3)
- Component styling setup (2.4)
- Implement dismiss dependency (2.5)
- Start component development (Modal + Sheet primitives/styled)

**Week 2** (24-30 hours):
- Complete mobile components (Drawer, NavigationStack, Alert)
- Implement desktop components (Sidebar, Tabs, Popover)
- Component exports and Tailwind guide

**Week 3** (24-30 hours):
- Complete all testing (2.7)
- Build example applications (2.8)
- Documentation and polish (2.9)
- Phase 2 completion verification

---

## Implementation Order (Recommended)

### Phase 1: Foundation (Week 1, Days 1-3)
1. Navigation types (2.1.x)
2. Navigation operators (2.2.x)
3. Stack utilities (2.3.x)
4. Component styling setup (2.4.x)
5. Dismiss dependency (2.5.x)

### Phase 2: Mobile Components (Week 1, Day 4 - Week 2, Day 2)
5. **Modal first** (establish pattern)
6. Sheet (similar to Modal)
7. Drawer (side variant)
8. Alert (simpler than Modal)

### Phase 3: Desktop Components (Week 2, Days 3-5)
9. Sidebar (persistent navigation)
10. Tabs (tabbed content)
11. Popover (contextual menus)

### Phase 4: Complex Components (Week 2, Day 5 - Week 3, Day 1)
12. NavigationStack (uses stack utilities)
13. Component exports and docs

### Phase 5: Testing & Examples (Week 3, Days 2-4)
14. Unit tests (all operators and components) (2.7.x)
15. Example applications (mobile + desktop) (2.8.x)

### Phase 6: Polish (Week 3, Day 5)
16. Documentation updates (2.9.x)
17. Full test suite verification (2.9.x)
18. Completion summary (2.9.x)

---

## Success Criteria

Phase 2 is complete when:

- ✅ All 8 components implemented (primitives + styled)
- ✅ Tree-based navigation works (optional child state)
- ✅ Stack-based navigation works (multi-screen flows)
- ✅ Desktop navigation patterns supported
- ✅ Mobile-first components responsive
- ✅ Children can dismiss themselves
- ✅ All navigation is state-driven and testable
- ✅ Primitives provide full styling control
- ✅ Styled components provide good defaults
- ✅ Examples demonstrate real-world usage
- ✅ All tests passing (50+ new tests expected)
- ✅ Documentation complete

---

## What's NOT in Phase 2

### Deferred to Phase 3 (DSL)
- `createDestination()` helper
- `integrate()` fluent API
- `scopeTo()` fluent store scoping
- Action builders

### Deferred to Phase 4 (Animations)
- PresentationState lifecycle
- Animation effects
- Transition timing
- Gesture-driven animations

### Deferred to Phase 5 (Polish)
- Middleware support
- Redux DevTools integration
- Focus management
- Advanced accessibility

### Deferred to Phase 6 (Optional)
- SvelteKit integration
- URL synchronization
- Browser back/forward handling

---

## Key Design Principles

1. **State-Driven Navigation**
   - Non-null state = show component
   - Null state = hide component
   - No imperative APIs

2. **Parent-Child Composition**
   - Parent observes child navigation events
   - Child can dismiss itself via dependency
   - Actions flow up, state flows down

3. **Maximum Flexibility**
   - Primitives for full control
   - Styled components for convenience
   - `unstyled` prop as escape hatch

4. **Testability First**
   - All navigation testable with TestStore
   - Deterministic state transitions
   - No hidden side effects

5. **Responsive by Default**
   - Mobile-first components work everywhere
   - Desktop components adapt to mobile (Sidebar → Drawer)
   - Tailwind responsive utilities

---

## Dependencies

**Peer Dependencies** (user-installed):
- `svelte: ^5.0.0` (required)
- `tailwindcss: ^3.4.0` (optional, for styled components)

**No New Dependencies**:
- No animation libraries in Phase 2
- No UI frameworks
- No additional runtime deps

---

## Risks & Mitigations

### Risk: Component complexity
**Mitigation**: Start with Modal to establish pattern, then replicate

### Risk: Timeline slip
**Mitigation**: Desktop components can be deferred to Phase 2.5 if needed

### Risk: Styling flexibility
**Mitigation**: Two-layer architecture + `unstyled` prop provides escape hatches

### Risk: Desktop patterns unfamiliar
**Mitigation**: Follow established UI patterns (Radix, shadcn, Melt UI)

---

## Phase 2 Completion Deliverables

1. **Code**:
   - 8 primitive components
   - 8 styled components
   - Navigation operators (ifLet, createDestinationReducer, etc.)
   - Stack utilities
   - Dismiss dependency

2. **Tests**:
   - 50+ new tests
   - All components tested
   - All operators tested
   - Example apps verified

3. **Documentation**:
   - Component API docs
   - Usage examples
   - Tailwind setup guide
   - Mobile/desktop patterns

4. **Examples**:
   - Inventory navigation (modals)
   - Stack navigation (multi-screen)
   - Desktop navigation (sidebar + tabs + popover)

5. **Package**:
   - `@composable-svelte/core@0.2.0`
   - Backward compatible with 0.1.0
   - Exported navigation types and components

---

## Next Steps After Phase 2

**Phase 3**: Navigation DSL (2 weeks)
- Ergonomic APIs for common patterns
- Reduce boilerplate
- Fluent interfaces

**Phase 4**: Animation Integration (2 weeks)
- PresentationState lifecycle
- Animated transitions
- Spring physics (Motion One)

**Phase 5**: Polish & Middleware (2 weeks)
- Middleware support
- DevTools integration
- Advanced features

---

**Ready to implement! 🚀**

All architectural decisions finalized.
All tasks scoped and estimated.
All success criteria defined.
Phase 1 complete and pristine.

Let's build comprehensive navigation for Svelte! 💪

# Design Principles for Composable Svelte

**Date**: November 4, 2025
**Context**: Learned from tree structures vs flat collections comparison

## Core Philosophy

**Composable architecture's value comes from predictability, testability, and powerful composition - not from uniformity at all costs.**

---

## Principles

### 1. Apply Abstraction Where Value is High

**Good Abstraction** (forEach + scopeToElement for flat collections):
- ✅ 92% boilerplate reduction
- ✅ Component isolation has high value
- ✅ Clear API that users love
- ✅ Complexity is hidden, but debugging is still clear

**Poor Abstraction** (scopeToTreeNode for recursive trees):
- ❌ High implementation complexity
- ❌ Marginal value over simple helpers
- ❌ Fighting against natural patterns
- ❌ More layers = harder debugging

**Guideline**: Abstract when the abstraction eliminates significant pain AND maintains clarity.

---

### 2. Different Structures Have Different Needs

**Not all data structures benefit equally from the same patterns.**

| Structure | Pattern | Why |
|-----------|---------|-----|
| Flat collections (counters, todos) | `forEach` + `scopeToElement` | Items are independent, isolation valuable |
| Recursive trees (folders, org charts) | Helper functions + `store + ID` | Relationships matter, structure is explicit |
| Nested navigation (modals, sheets) | `ifLet` + `PresentationState` | State-driven, temporary |
| Form sections | `scope()` + `combineReducers` | Permanent children, clear boundaries |

**Guideline**: Choose the right tool for the structure, not the same tool for everything.

---

### 3. Pragmatism Over Purity

**Pure Philosophy**: "Every component should be completely isolated, knowing nothing about its context."

**Pragmatic Reality**:
- For flat collections: Isolation has huge value ✅
- For trees: Knowing your ID is natural and useful ⚠️
- For forms: Knowing your field name is necessary ⚠️

**Guideline**: Apply principles where they provide value, not religiously.

---

### 4. Simple Helpers > Complex Abstractions

**When in doubt, provide helpers, not frameworks.**

**Good**:
```typescript
// Simple, clear, reusable
const updated = updateTreeNode(state.tree, id, node => ({ ...node, isExpanded: true }));
```

**Over-engineered**:
```typescript
// Too much magic, harder to debug
const scopedStore = scopeToTreeNode(rootStore, 'folder', s => s.tree, id);
scopedStore.dispatch({ type: 'toggle' });
```

**Guideline**: Prefer simple pure functions over complex abstraction layers.

---

### 5. Iterate in User Code First

**Process**:
1. Build feature in user demo with simple approach
2. Identify repeated patterns
3. Extract ONLY what provides clear value
4. Document both the pattern AND when to use it

**Don't**:
- Design full abstraction before trying simple approach
- Extract to library prematurely
- Create one abstraction that "does everything"

**Guideline**: Let patterns emerge from real usage, then extract judiciously.

---

### 6. Performance Matters

**Abstraction has costs:**
- Creating scoped stores for every tree node: O(n) overhead
- Extra subscription layers: Memory + CPU
- Complex diffing logic: Slower updates

**Simple approach has benefits:**
- Direct state access: O(1) lookups
- Single store: Minimal memory
- Pure helpers: Easy to optimize

**Guideline**: Consider performance implications of abstractions, especially for large datasets.

---

### 7. Developer Experience Includes Debugging

**Good DX isn't just "less code" - it's also:**
- Clear what's happening
- Easy to trace data flow
- Understandable error messages
- Visible in dev tools

**Example**:
```svelte
<!-- Clear: can see ID in dev tools -->
<Folder store={store} folderId="projects" />

<!-- Opaque: what's inside scopedStore? -->
<Folder store={scopedStore} />
```

**Guideline**: Explicit is better than implicit when it aids understanding.

---

### 8. Documentation Should Guide Choices

**Good documentation explains:**
- WHAT pattern to use
- WHEN to use it
- WHY one pattern over another
- TRADE-OFFS of each approach

**Not just**:
- How to use the API

**Guideline**: Document decision-making, not just APIs.

---

## What Makes Composable Svelte Valuable

### Core Value Props ✅

1. **Pure Reducers**
   - Predictable state updates
   - Easy to test
   - Easy to reason about

2. **Declarative Effects**
   - Side effects as data
   - Composable
   - Cancellable

3. **TestStore**
   - Exhaustive testing
   - `send/receive` pattern
   - Catch bugs before users do

4. **forEach + scopeToElement** (for flat collections)
   - Massive boilerplate reduction
   - Component isolation
   - Type-safe

5. **Navigation System**
   - State-driven navigation
   - `ifLet` for optional children
   - `PresentationState` for animations

6. **Backend Integration**
   - API client with effects
   - WebSocket with reconnection
   - Injectable dependencies

### Not the Goal ❌

1. ❌ Making every pattern feel identical
2. ❌ Maximum abstraction at all costs
3. ❌ Hiding all context from components
4. ❌ One abstraction to rule them all
5. ❌ Dogmatic purity over pragmatism

---

## Decision Framework

When considering a new feature or abstraction, ask:

### 1. Value Question
- Does this eliminate significant boilerplate?
- Does it prevent common bugs?
- Does it make the code clearer?

### 2. Complexity Question
- How many lines of library code?
- How many new concepts for users?
- How hard to debug when things go wrong?

### 3. Trade-off Question
- What do we gain?
- What do we lose?
- Is the trade-off worth it?

### 4. Alternative Question
- Could simple helpers achieve 80% of the value?
- Is there a simpler pattern?
- Are we solving the right problem?

### Decision Matrix

| Value | Complexity | Decision |
|-------|------------|----------|
| High | Low | ✅ ADD |
| High | High | ⚠️ Consider alternatives |
| Low | Low | ⚠️ Maybe add |
| Low | High | ❌ DON'T ADD |

---

## Examples

### ✅ forEach for Flat Collections

**Value**: High
- 92% boilerplate reduction
- Automatic effect mapping
- Immutable updates handled

**Complexity**: Medium
- ~160 lines of library code
- 1 new concept (element actions)
- Easy to debug (actions are explicit)

**Decision**: ✅ ADDED (v0.2.4)
**Result**: Users love it

---

### ✅ scopeToElement Simplification

**Value**: High
- Reduced type parameters from 5 to 1
- 80% less boilerplate
- Maintains type safety

**Complexity**: Low
- Small API change
- Inference handles types

**Decision**: ✅ ADDED (v0.2.6)
**Result**: Dramatically improved DX

---

### ❌ scopeToTreeNode + forEachTree

**Value**: Low
- Component doesn't know ID (marginal benefit for trees)
- Consistent API (not valuable if it's the wrong pattern)

**Complexity**: High
- ~500 lines of library code
- 3 new concepts (TreeNodeStore, forEachTree, scopeToTreeNode)
- Hard to debug (multiple layers)

**Decision**: ❌ NOT ADDED
**Alternative**: Simple helpers (~80 lines)
**Result**: Better DX, less complexity

---

### ✅ Tree Helper Functions (Future)

**Value**: Medium-High
- Eliminates recursive boilerplate
- Pure functions, reusable
- Prevents common bugs (immutability)

**Complexity**: Low
- ~100 lines of pure functions
- 0 new concepts (just utilities)
- Easy to understand

**Decision**: ✅ PLAN TO ADD
**Reason**: High value-to-complexity ratio

---

## Lessons for Future Development

### For v0.2.7+

1. **Add tree helpers** - simple utilities, high value
2. **Document patterns** - when to use each approach
3. **Resist over-abstraction** - if simple works, use simple
4. **Let patterns emerge** - iterate in examples first

### General

1. **Test in user code first** - before adding to library
2. **Measure value objectively** - lines saved, bugs prevented
3. **Consider the long term** - maintenance costs matter
4. **Stay pragmatic** - perfect is the enemy of good

---

## Conclusion

**Composable Svelte's strength is providing powerful tools where they matter most, and staying out of the way elsewhere.**

We don't need to abstract everything - just the parts that provide clear, measurable value.

**Better to have:**
- ✅ 5 powerful abstractions that users love
- ✅ Simple helpers for other cases

**Than:**
- ❌ 20 abstractions that cover every case but are hard to learn
- ❌ One mega-abstraction that tries to do everything

---

**Principle**: Be opinionated about what matters, pragmatic about what doesn't.

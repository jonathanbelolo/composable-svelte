# URL Routing Example

Complete example demonstrating URL synchronization and browser history integration with Composable Svelte.

**Phase 7: URL Synchronization (Browser History Integration)**

## Features

This example showcases:

✅ **Deep Linking** - Load app from any URL and restore full state
✅ **Browser Back/Forward** - Browser navigation buttons work seamlessly
✅ **URL Sync** - State changes automatically update the browser URL
✅ **Bookmarkable URLs** - Share links to specific items or views
✅ **Single-Level Navigation** - v1.0 scope (detail modal, add modal)

## What This Demonstrates

### 1. Deep Linking
```
http://localhost:3000/inventory/item/1
→ App loads with Item #1 detail modal open
```

### 2. Browser History
```
User clicks item → URL updates to /inventory/item/1
User clicks back → URL reverts to /inventory, modal closes
```

### 3. State → URL Sync
```typescript
// When state changes, URL automatically updates
store.dispatch({ type: 'itemSelected', itemId: '1' });
// URL becomes: /inventory/item/1
```

### 4. URL → State Sync
```typescript
// Browser navigation triggers actions
history.back();
// Dispatches: { type: 'closeDestination' }
// State updates, modal closes
```

## Running the Example

```bash
# From the example directory
npm install
npm run dev
```

Visit `http://localhost:3000/inventory`

## URL Routes

| URL | State |
|-----|-------|
| `/inventory` | Root view (no modal) |
| `/inventory/item/:id` | Item detail modal |
| `/inventory/add` | Add item modal |

## Code Structure

```
src/
├── types.ts              # State and action types
├── routing.ts            # URL serialization/parsing config
├── reducer.ts            # Business logic with URL sync
├── App.svelte            # Root component with store setup
└── components/
    ├── ItemList.svelte       # Grid of inventory items
    ├── ItemDetail.svelte     # Item detail modal
    └── AddItemModal.svelte   # Add item form modal
```

## Key Implementation Details

### 1. Deep Link Initialization

```typescript
// App.svelte
const defaultState = createInitialState();
const initialState = createInitialStateFromURL(
  defaultState,
  parseInventoryURL,
  (state, destination) => ({ ...state, destination })
);
```

### 2. Browser History Sync

```typescript
// App.svelte - onMount
cleanup = syncBrowserHistory(store, {
  parse: parseInventoryURL,
  serialize: (state) => serializeInventoryState(state.destination),
  destinationToAction
});
```

### 3. URL Sync Effect

```typescript
// reducer.ts
const urlSyncEffect = createURLSyncEffect<InventoryState, InventoryAction>(
  (state) => serializeInventoryState(state.destination)
);

// In reducer
case 'itemSelected': {
  const newState = {
    ...state,
    destination: { type: 'detail', state: { itemId: action.itemId } }
  };
  return [newState, urlSyncEffect(newState)];
}
```

### 4. Routing Configuration

```typescript
// routing.ts
export const serializerConfig: SerializerConfig<InventoryDestination> = {
  basePath: '/inventory',
  serializers: {
    detail: (state) => `/inventory/item/${state.itemId}`,
    add: () => '/inventory/add'
  }
};

export const parserConfig: ParserConfig<InventoryDestination> = {
  basePath: '/inventory',
  parsers: [
    (path) => {
      if (path === '/add') {
        return { type: 'add', state: {} };
      }
      return null;
    },
    (path) => {
      const params = matchPath('/item/:itemId', path);
      if (params) {
        return { type: 'detail', state: { itemId: params.itemId } };
      }
      return null;
    }
  ]
};
```

## Try These Scenarios

1. **Deep Link**
   - Visit `/inventory/item/3` directly
   - App loads with item #3 detail modal open

2. **Browser Back**
   - Click an item to open detail
   - Click browser back button
   - Modal closes, URL returns to `/inventory`

3. **Browser Forward**
   - After going back, click forward
   - Modal reopens, URL updates

4. **Bookmarking**
   - Open an item detail
   - Bookmark the URL
   - Visit bookmark later - state restored

5. **Manual URL Entry**
   - Type `/inventory/add` in address bar
   - Add modal opens immediately

6. **Filter + Navigate**
   - Filter items by search/category
   - Click an item
   - Use back button
   - Filters preserved (local UI state not in URL)

## Testing

The routing system is fully tested:

- **159 unit tests** for routing system
- **14 integration tests** for complete flows
- Tests cover:
  - Serialization/parsing
  - Deep linking
  - Browser history navigation
  - Loop prevention
  - Edge cases

## Architecture Notes

### Single-Level Navigation (v1.0)
This example uses **single-level destinations** only:
- One modal open at a time
- No nested modals
- Simpler state management

### What's NOT in URL
Some state is intentionally **not** synced to URL:
- Search query (local UI state)
- Category filter (local UI state)
- Form field values (ephemeral)

This keeps URLs clean and bookmarkable.

### Loop Prevention
The system prevents infinite loops:
```
Action → State → URL update (with metadata flag)
         ↑         ↓
         ←─ Browser navigation (checks flag, ignores own updates)
```

## Learn More

- [Phase 7 Plan](../../plans/phase-7/PHASE-7-PLAN.md)
- [Routing API Documentation](../../packages/core/src/routing/README.md)
- [Composable Svelte Specs](../../specs/)

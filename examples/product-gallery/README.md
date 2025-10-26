# Product Gallery Example

A comprehensive example application demonstrating the **Composable Svelte** navigation system in action. This example showcases all 8 navigation components (Modal, Sheet, Alert, Drawer, NavigationStack, Sidebar, Tabs, Popover) in a realistic product browsing application.

## 🎯 What This Example Demonstrates

### Navigation Patterns

1. **Tree-Based Navigation** (`ifLet` operator)
   - Modal/Sheet/Alert/Popover presentations
   - Optional child state (`destination: T | null`)
   - Parent observation of child actions

2. **Stack-Based Navigation** (`handleStackAction`)
   - Product list → Product detail drill-down
   - Browser-style back navigation
   - State-driven navigation stack

3. **Enum Destinations** (`createDestinationReducer`)
   - Multiple presentation types in single enum
   - Type-safe destination routing
   - Proper action scoping

4. **Parent-Child Communication**
   - Cart updates when AddToCart completes
   - Product deletion from detail view
   - Dismiss dependency usage

5. **Desktop Navigation Patterns**
   - Sidebar for category filtering
   - Tabs for view mode switching (Grid/List/Favorites)
   - Popover for product information

### Architecture Highlights

- ✅ **Button-Only Interactions** - No text inputs, demonstrating navigation without forms
- ✅ **State-Driven Everything** - All UI driven by state, fully testable
- ✅ **Proper Reducer Composition** - Parent observing child events
- ✅ **Type-Safe Actions** - Discriminated unions throughout
- ✅ **Effect Management** - Side effects properly handled
- ✅ **Responsive Design** - Sidebar transforms to Drawer on mobile

## 🏗️ Application Structure

```
src/
├── app/                      # Root application
│   ├── App.svelte           # Main component
│   ├── app.reducer.ts       # Root reducer with stack navigation
│   └── app.types.ts         # Root state/actions
│
├── features/
│   ├── product-list/        # Product grid/list view
│   │   ├── ProductList.svelte
│   │   └── ProductCard.svelte
│   │
│   ├── product-detail/      # Product detail with destinations
│   │   ├── ProductDetail.svelte
│   │   ├── product-detail.reducer.ts
│   │   └── __tests__/
│   │
│   ├── add-to-cart/         # Sheet with quantity stepper
│   │   ├── AddToCart.svelte
│   │   ├── add-to-cart.reducer.ts
│   │   └── __tests__/
│   │
│   ├── share/               # Sheet with method selection
│   │   ├── Share.svelte
│   │   ├── share.reducer.ts
│   │   └── __tests__/
│   │
│   ├── quick-view/          # Modal with large product image
│   │   ├── QuickView.svelte
│   │   └── quick-view.reducer.ts
│   │
│   └── category-filter/     # Sidebar content
│       └── CategoryFilter.svelte
│
└── models/
    ├── product.ts           # Product type + helpers
    ├── cart.ts              # Cart type + helpers
    └── sample-data.ts       # 12 sample products
```

## 📊 State Structure

### Root App State

```typescript
interface AppState {
  products: Product[];                  // Product catalog
  cart: CartState;                     // Shopping cart
  filters: FilterState;                // Category filters
  viewMode: 'grid' | 'list' | 'favorites';  // Active tab
  sidebarExpanded: boolean;            // Desktop sidebar state
  detailPath: ProductDetailState[];    // Navigation stack
}
```

###  ProductDetail State (Tree Navigation)

```typescript
interface ProductDetailState {
  productId: string;
  destination: ProductDetailDestination | null;  // Tree navigation
}

type ProductDetailDestination =
  | { type: 'addToCart'; state: AddToCartState }    // Sheet
  | { type: 'share'; state: ShareState }            // Sheet
  | { type: 'quickView'; state: QuickViewState }    // Modal
  | { type: 'delete'; productId: string }           // Alert
  | { type: 'info'; productId: string };            // Popover
```

## 🎮 Key User Flows

### Flow 1: Add Product to Cart

```
User on ProductDetail
  → Taps "Add to Cart" button
    → Sheet slides up with quantity stepper
      → User taps [+] button 3 times (quantity: 4)
      → User taps "Add" button
        → AddToCart reducer calls deps.dismiss()
        → ProductDetail observes 'addButtonTapped' action
        → ProductDetail dismisses destination (destination: null)
        → ProductDetail dispatches effect to notify app
        → App reducer updates cart state
        → Cart badge shows "4 items"
```

**Components Used**: Sheet, dismiss dependency, parent observation

### Flow 2: Share Product

```
User on ProductDetail
  → Taps "Share" button
    → Sheet slides up with share methods
      → User taps "Twitter" button
      → User taps "Share" button
        → Share reducer logs action and dismisses
        → ProductDetail observes 'shareButtonTapped'
        → ProductDetail dismisses destination
```

**Components Used**: Sheet, enum destination selection

### Flow 3: Delete Product

```
User on ProductDetail
  → Taps "Delete" button
    → Alert dialog appears
      → User taps "Delete" button
        → ProductDetail observes 'deleteConfirmed'
        → ProductDetail notifies app via effect
        → App reducer removes product and pops detail from stack
```

**Components Used**: Alert, stack navigation (pop)

### Flow 4: Filter by Category

```
User on desktop
  → Sidebar shows category buttons
    → User taps "Electronics"
      → App reducer adds to selectedCategories
      → ProductList filters products
    → User taps sidebar collapse button
      → App reducer toggles sidebarExpanded
      → Sidebar collapses to icon-only mode
```

**Components Used**: Sidebar, state-driven filtering

## 🔧 Pattern Deep Dives

### Pattern 1: Tree-Based Navigation with `ifLet`

**ProductDetail Reducer**:

```typescript
case 'destination': {
  // Use ifLet to integrate child destination reducer
  const [newState, effect] = ifLet(
    (s: ProductDetailState) => s.destination,
    (s: ProductDetailState, d: ProductDetailDestination | null) => ({ ...s, destination: d }),
    (a: ProductDetailAction) => (a.type === 'destination' ? a.action : null),
    (ca) => ({ type: 'destination' as const, action: ca }),
    destinationReducer
  )(state, action, deps);

  // Observe child actions for parent updates
  const presentedAction = action.action;

  // AddToCart completed
  if (
    presentedAction.type === 'presented' &&
    presentedAction.action.type === 'addToCart' &&
    presentedAction.action.action.type === 'addButtonTapped'
  ) {
    const addToCartState = state.destination;
    if (addToCartState?.type === 'addToCart') {
      const { productId, quantity } = addToCartState.state;

      // Notify parent and dismiss
      if (deps.onCartItemAdded) {
        return [
          { ...newState, destination: null },
          Effect.batch(
            effect,
            Effect.run((dispatch) => {
              deps.onCartItemAdded!(productId, quantity);
            })
          )
        ];
      }
    }
  }

  return [newState, effect];
}
```

**Key Points**:
- `ifLet` handles the optional child state
- Parent observes child actions via `PresentationAction` wrapping
- Dismissal sets `destination: null`
- Effects used to notify grandparent (app)

### Pattern 2: Stack-Based Navigation

**App Reducer**:

```typescript
case 'productClicked': {
  // Push product detail onto stack
  const detailState = createProductDetailState(action.productId);
  return [
    {
      ...state,
      detailPath: [...state.detailPath, detailState]
    },
    Effect.none()
  ];
}

case 'detailPath': {
  // Handle stack navigation with handleStackAction
  return handleStackAction(
    (s: AppState) => s.detailPath,
    (s: AppState, path) => ({ ...s, detailPath: path }),
    (a: AppAction) => (a.type === 'detailPath' ? a.action : null),
    (sa) => ({ type: 'detailPath' as const, action: sa }),
    productDetailReducer,
    {
      onCartItemAdded: (productId, quantity) => {
        return { type: 'cartItemAdded' as const, productId, quantity };
      },
      onProductDeleted: (productId) => {
        return { type: 'productDeleted' as const, productId };
      }
    }
  )(state, action, deps);
}
```

**Key Points**:
- Stack is just an array of screen states
- `handleStackAction` manages push/pop/setPath
- Dependencies passed to child reducers
- Child actions properly scoped

### Pattern 3: Scoped Stores in Components

**ProductDetail.svelte**:

```svelte
<script lang="ts">
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const addToCartStore = $derived(
    scopeToDestination(store)
      .into('destination')
      .case('addToCart')
  );

  const shareStore = $derived(
    scopeToDestination(store)
      .into('destination')
      .case('share')
  );
</script>

<!-- AddToCart Sheet -->
<Sheet store={addToCartStore}>
  {#snippet children({ store: childStore })}
    <AddToCart store={childStore} {product} />
  {/snippet}
</Sheet>

<!-- Share Sheet -->
<Sheet store={shareStore}>
  {#snippet children({ store: childStore })}
    <Share store={childStore} {product} />
  {/snippet}
</Sheet>
```

**Key Points**:
- `scopeToDestination()` creates scoped stores for children
- `.case()` extracts specific enum variant
- Store is `null` when destination doesn't match
- Component shows/hides automatically based on store

### Pattern 4: Dismiss Dependency

**AddToCart Reducer**:

```typescript
export interface AddToCartDependencies {
  dismiss: () => void;
}

case 'addButtonTapped':
  try {
    deps.dismiss();
  } catch (error) {
    console.error('[AddToCart] Failed to dismiss:', error);
  }
  return [state, Effect.none()];
```

**Sheet Component**:

```svelte
<Sheet store={addToCartStore}>
  {#snippet children({ store: childStore })}
    <!-- childStore has built-in dismiss() method -->
    <AddToCart store={childStore} {product} />
  {/snippet}
</Sheet>
```

**Key Points**:
- Child features can dismiss themselves
- No need for explicit parent actions
- Error handling prevents crashes
- Dismiss handled by navigation components

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with UI
pnpm test:ui
```

### Test Examples

**AddToCart Reducer Test**:

```typescript
it('increments quantity by 1', () => {
  const initialState: AddToCartState = { productId: 'prod-1', quantity: 1 };
  const [newState] = addToCartReducer(
    initialState,
    { type: 'incrementQuantity' },
    mockDeps
  );

  expect(newState.quantity).toBe(2);
});

it('calls dismiss dependency', () => {
  let dismissCalled = false;
  const deps: AddToCartDependencies = {
    dismiss: () => { dismissCalled = true; }
  };

  addToCartReducer(initialState, { type: 'addButtonTapped' }, deps);

  expect(dismissCalled).toBe(true);
});
```

**ProductDetail Reducer Test**:

```typescript
it('observes addToCart completion and dismisses', () => {
  const state: ProductDetailState = {
    productId: 'prod-1',
    destination: {
      type: 'addToCart',
      state: { productId: 'prod-1', quantity: 3 }
    }
  };

  let cartAdded = false;
  const deps: ProductDetailDependencies = {
    onCartItemAdded: (productId, quantity) => {
      cartAdded = true;
      expect(productId).toBe('prod-1');
      expect(quantity).toBe(3);
    }
  };

  const [newState] = productDetailReducer(
    state,
    {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addToCart',
          action: { type: 'addButtonTapped' }
        }
      }
    },
    deps
  );

  expect(newState.destination).toBeNull();
});
```

## 🚀 Running the Example

### Install Dependencies

```bash
cd examples/product-gallery
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
pnpm build
```

### Type Check

```bash
pnpm typecheck
```

## 📱 Features

### Products
- 12 sample products across 4 categories
- Grid, list, and favorites views
- Category filtering
- Stock status tracking
- Favorite toggling

### Shopping Cart
- Add products with quantity selection
- Stepper buttons (+/-)
- Cart badge showing total items
- Persistent cart state

### Navigation
- Product list → Detail drill-down
- Back navigation (browser-style)
- Multiple modal overlays
- Responsive sidebar/drawer

### UI Components Used
1. **Sheet** - AddToCart, Share
2. **Modal** - QuickView
3. **Alert** - Delete confirmation
4. **Popover** - Product info
5. **Sidebar** - Category filters (desktop)
6. **Drawer** - Category filters (mobile)
7. **Tabs** - View mode switching
8. **NavigationStack** - Product detail (conceptually, implemented via simple array)

## 🎓 Learning Outcomes

After studying this example, you'll understand:

1. **How to structure navigation state** - Optional fields for tree, arrays for stacks
2. **How to use `ifLet` for tree-based navigation** - Integrating optional child features
3. **How to use `handleStackAction` for stack navigation** - Multi-screen flows
4. **How to observe child actions in parent reducers** - Cross-feature communication
5. **How to implement self-dismissing features** - Dismiss dependency pattern
6. **How to compose multiple navigation patterns** - Tree + Stack in single app
7. **How to test navigation with pure reducers** - TestStore usage
8. **When to use each navigation component** - Modal vs Sheet vs Alert etc.

## 💡 Key Takeaways

### State-Driven Navigation
All navigation is controlled by state. No imperative `showModal()` or `navigate()` calls. This makes navigation:
- **Testable** - Just test state changes
- **Reproducible** - Same state always renders same UI
- **Debuggable** - State snapshots show exact navigation state
- **Persistent** - Can save/restore navigation state

### Reducer Composition
Reducers compose via `ifLet` (optional children) and `handleStackAction` (stack children). This enables:
- **Isolation** - Each feature is self-contained
- **Reusability** - Features work in any parent
- **Type Safety** - Actions properly scoped
- **Testability** - Test features in isolation

### Parent Observation
Parents can observe child actions via `PresentationAction` wrapping. This enables:
- **Cross-Feature Communication** - Cart updates from AddToCart
- **Coordinated Actions** - Delete product + pop stack
- **Side Effects** - Trigger effects based on child events
- **Clean Architecture** - Children don't know about parents

### Dismiss Dependency
Children can dismiss themselves via `deps.dismiss()`. This enables:
- **Self-Contained Features** - Children control their own lifecycle
- **Cancel Actions** - User can cancel without parent knowledge
- **Error Handling** - Graceful failure if dismiss not available
- **Flexibility** - Same feature works in different contexts

## 📚 Further Reading

- [Navigation Spec](../../specs/frontend/navigation-spec.md) - Full navigation system specification
- [Composable Svelte Spec](../../specs/frontend/composable-svelte-spec.md) - Core architecture
- [Phase 2 Progress](../../plans/phase-2/PHASE-2-PROGRESS.md) - Implementation status

## 🤝 Contributing

This example is part of the Composable Svelte library. See the main repository for contribution guidelines.

## 📄 License

MIT - See LICENSE file in repository root.

---

**Built with ❤️ using [Composable Svelte](https://github.com/jonathanbelolo/composable-svelte)**

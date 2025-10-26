# Example Application Design: Product Gallery

**Status**: Design Phase
**Created**: October 26, 2025
**Complexity**: Non-trivial but focused on navigation, not forms

---

## 🎯 Design Goals

Create an example that:
1. **Demonstrates all 8 navigation components** in realistic context
2. **Requires ZERO form inputs** (buttons/clicks only)
3. **Shows all key patterns**: tree navigation, stack navigation, enum destinations
4. **Is complex enough to be realistic** but simple enough to understand
5. **Uses only what we have** - no unbuilt components

---

## 📱 Application Concept: Product Gallery

A simple product browsing application where users can:
- Browse products in a grid or list
- View product details
- Add products to cart (via stepper buttons, not text input)
- Share products (select share method via buttons)
- Delete products (with confirmation alert)
- Filter by category (sidebar on desktop)
- Switch view modes (tabs: Grid/List/Favorites)

**Key Insight**: All interactions are button-based. No text inputs, no complex forms.

---

## 🏗️ Architecture Overview

### State Structure

```typescript
// Root app state
interface AppState {
  products: Product[];           // Static product data
  cart: CartState;              // Shopping cart
  filters: FilterState;         // Category filters
  viewMode: 'grid' | 'list' | 'favorites';  // Active tab
  sidebarExpanded: boolean;     // Desktop sidebar state

  // Navigation state
  detailPath: ProductDetailState[];  // Stack navigation
}

// Product detail screen state
interface ProductDetailState {
  productId: string;
  destination: ProductDetailDestination | null;  // Tree navigation
}

// Enum destinations for detail screen
type ProductDetailDestination =
  | { type: 'addToCart'; state: AddToCartState }
  | { type: 'share'; state: ShareState }
  | { type: 'quickView'; state: QuickViewState }
  | { type: 'delete'; productId: string }
  | { type: 'info'; productId: string };

// Add to cart state (Sheet)
interface AddToCartState {
  productId: string;
  quantity: number;  // Changed via +/- buttons
}

// Share state (Sheet)
interface ShareState {
  productId: string;
  selectedMethod: 'email' | 'twitter' | 'facebook' | 'link' | null;
}

// Quick view state (Modal)
interface QuickViewState {
  productId: string;
}

// Cart state (updated by parent observing child actions)
interface CartState {
  items: Array<{ productId: string; quantity: number }>;
}

// Filter state (Sidebar)
interface FilterState {
  selectedCategories: string[];  // Toggle via buttons
}
```

### Action Structure

```typescript
// Root app actions
type AppAction =
  | { type: 'productClicked'; productId: string }
  | { type: 'categoryToggled'; category: string }
  | { type: 'viewModeChanged'; mode: 'grid' | 'list' | 'favorites' }
  | { type: 'sidebarToggled' }
  | { type: 'detailPath'; action: StackAction<ProductDetailState, ProductDetailAction> };

// Product detail actions
type ProductDetailAction =
  | { type: 'addToCartButtonTapped' }
  | { type: 'shareButtonTapped' }
  | { type: 'quickViewButtonTapped' }
  | { type: 'deleteButtonTapped' }
  | { type: 'infoButtonTapped' }
  | { type: 'destination'; action: PresentationAction<ProductDetailDestinationAction> };

// Destination actions (child feature actions)
type ProductDetailDestinationAction =
  | { type: 'addToCart'; action: AddToCartAction }
  | { type: 'share'; action: ShareAction }
  | { type: 'quickView'; action: QuickViewAction }
  | { type: 'delete'; action: DeleteAction }
  | { type: 'info'; action: InfoAction };

// Add to cart actions (Sheet with stepper)
type AddToCartAction =
  | { type: 'incrementQuantity' }
  | { type: 'decrementQuantity' }
  | { type: 'addButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Share actions (Sheet with method selection)
type ShareAction =
  | { type: 'methodSelected'; method: 'email' | 'twitter' | 'facebook' | 'link' }
  | { type: 'shareButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Quick view action (Modal, read-only)
type QuickViewAction =
  | { type: 'closeButtonTapped' };

// Delete action (Alert)
type DeleteAction =
  | { type: 'confirmButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Info action (Popover)
type InfoAction =
  | { type: 'closeButtonTapped' };
```

---

## 🎨 Component Usage Mapping

### All 8 Components Demonstrated

1. **Modal** (`QuickView`) - Full-screen product preview
2. **Sheet** (`AddToCart`, `Share`) - Bottom drawer for actions
3. **Alert** (`Delete`) - Confirmation dialog
4. **Drawer** (Mobile sidebar fallback) - Category filters on mobile
5. **NavigationStack** (`ProductDetail`) - Drill-down from grid to detail
6. **Sidebar** (Desktop) - Category filters
7. **Tabs** (`Grid/List/Favorites`) - View mode switcher
8. **Popover** (`Info`) - Product info tooltip

### Navigation Patterns Demonstrated

#### Tree-Based Navigation (ifLet)
```typescript
// In ProductDetail reducer
case 'addToCartButtonTapped':
  return [{
    ...state,
    destination: {
      type: 'addToCart',
      state: { productId: state.productId, quantity: 1 }
    }
  }, Effect.none()];

case 'destination':
  return ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'destination' ? a.action : null,
    (ca) => ({ type: 'destination', action: ca }),
    destinationReducer
  )(state, action, deps);
```

#### Stack-Based Navigation (handleStackAction)
```typescript
// In App reducer
case 'productClicked':
  return [{
    ...state,
    detailPath: [...state.detailPath, {
      productId: action.productId,
      destination: null
    }]
  }, Effect.none()];

case 'detailPath':
  return handleStackAction(
    (s) => s.detailPath,
    (s, p) => ({ ...s, detailPath: p }),
    (a) => a.type === 'detailPath' ? a.action : null,
    (ca) => ({ type: 'detailPath', action: ca }),
    productDetailReducer
  )(state, action, deps);
```

#### Enum Destinations (createDestinationReducer)
```typescript
const destinationReducer = createDestinationReducer<
  ProductDetailDestination,
  ProductDetailDestinationAction,
  Dependencies
>({
  addToCart: {
    extractState: (dest) => dest.type === 'addToCart' ? dest.state : null,
    extractAction: (action) => action.type === 'addToCart' ? action.action : null,
    reducer: addToCartReducer
  },
  share: {
    extractState: (dest) => dest.type === 'share' ? dest.state : null,
    extractAction: (action) => action.type === 'share' ? action.action : null,
    reducer: shareReducer
  },
  // ... other destinations
});
```

#### Parent Observing Child Actions
```typescript
// In ProductDetail reducer observing AddToCart child
case 'destination': {
  const [newState, effect] = ifLet(...)(state, action, deps);

  // Observe child save action
  if (action.action.type === 'presented' &&
      action.action.action.type === 'addToCart' &&
      action.action.action.action.type === 'addButtonTapped') {

    // Child saved! Dismiss and notify parent
    return [
      { ...newState, destination: null },
      Effect.batch(
        effect,
        Effect.run((dispatch) => {
          // Notify parent app to update cart
          dispatch({ type: 'cartItemAdded', productId: state.productId });
        })
      )
    ];
  }

  return [newState, effect];
}
```

#### Dismiss Dependency
```typescript
// AddToCart child can dismiss itself
const addToCartReducer: Reducer<AddToCartState, AddToCartAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'cancelButtonTapped':
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[AddToCart] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    case 'addButtonTapped':
      // Save and dismiss
      try {
        deps.dismiss();
      } catch (error) {
        console.error('[AddToCart] Failed to dismiss:', error);
      }
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

---

## 📂 File Structure

```
examples/product-gallery/
├── src/
│   ├── app/
│   │   ├── App.svelte                    # Root view
│   │   ├── app.reducer.ts                # Root reducer
│   │   └── app.types.ts                  # Root state/actions
│   │
│   ├── features/
│   │   ├── product-list/
│   │   │   ├── ProductList.svelte        # Grid/List view
│   │   │   ├── ProductCard.svelte        # Product card component
│   │   │   ├── product-list.reducer.ts   # List logic (minimal)
│   │   │   └── product-list.types.ts
│   │   │
│   │   ├── product-detail/
│   │   │   ├── ProductDetail.svelte      # Detail screen
│   │   │   ├── product-detail.reducer.ts # Detail + destinations
│   │   │   └── product-detail.types.ts
│   │   │
│   │   ├── add-to-cart/
│   │   │   ├── AddToCart.svelte          # Sheet with stepper
│   │   │   ├── add-to-cart.reducer.ts
│   │   │   └── add-to-cart.types.ts
│   │   │
│   │   ├── share/
│   │   │   ├── Share.svelte              # Sheet with share options
│   │   │   ├── share.reducer.ts
│   │   │   └── share.types.ts
│   │   │
│   │   ├── quick-view/
│   │   │   ├── QuickView.svelte          # Modal with image
│   │   │   ├── quick-view.reducer.ts
│   │   │   └── quick-view.types.ts
│   │   │
│   │   └── category-filter/
│   │       ├── CategoryFilter.svelte     # Sidebar content
│   │       ├── category-filter.reducer.ts
│   │       └── category-filter.types.ts
│   │
│   ├── models/
│   │   ├── product.ts                    # Product type
│   │   ├── cart.ts                       # Cart type
│   │   └── sample-data.ts                # Static product data
│   │
│   ├── lib/
│   │   └── styles.css                    # App styles
│   │
│   └── main.ts                           # Entry point
│
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── README.md                             # Pattern explanations
```

---

## 🎬 User Flows

### Flow 1: Browse and View Product
1. User sees grid of products (Tabs: Grid mode active)
2. User clicks product card
3. NavigationStack pushes ProductDetail view
4. User sees product details
5. User clicks back (NavigationStack pops)

**Components Used**: Tabs, NavigationStack

---

### Flow 2: Add to Cart
1. User on ProductDetail view
2. User clicks "Add to Cart" button
3. Sheet slides up from bottom with:
   - Product image/name
   - Quantity stepper (- [1] + buttons)
   - "Add to Cart" and "Cancel" buttons
4. User clicks + to increase quantity to 3
5. User clicks "Add to Cart"
6. Sheet dismisses
7. Cart badge updates to show 3 items
8. ProductDetail observes child action and updates parent state

**Components Used**: Sheet, parent observation, dismiss dependency

---

### Flow 3: Share Product
1. User on ProductDetail view
2. User clicks "Share" button
3. Sheet slides up with share method buttons:
   - Email
   - Twitter
   - Facebook
   - Copy Link
4. User clicks "Twitter"
5. Selected method highlights
6. User clicks "Share" button
7. Sheet dismisses
8. (Simulated share - just dismisses)

**Components Used**: Sheet, enum destination selection

---

### Flow 4: Quick View
1. User on ProductDetail view
2. User clicks "Quick View" button
3. Modal fades in with:
   - Large product image
   - Product name and price
   - "Close" button
4. User clicks outside modal or presses Escape
5. Modal dismisses

**Components Used**: Modal, click-outside, keyboard handling

---

### Flow 5: Delete Product
1. User on ProductDetail view
2. User clicks "Delete" button
3. Alert dialog appears:
   - "Are you sure you want to delete this product?"
   - "Cancel" and "Delete" buttons
4. User clicks "Delete"
5. Alert dismisses
6. ProductDetail pops from stack
7. Product removed from list

**Components Used**: Alert, NavigationStack

---

### Flow 6: Product Info (Popover)
1. User on ProductDetail view
2. User clicks "Info" icon button
3. Popover appears near button with:
   - Product specifications
   - Stock status
   - Shipping info
4. User clicks outside or presses Escape
5. Popover dismisses

**Components Used**: Popover, positioning

---

### Flow 7: Filter by Category (Desktop)
1. User on desktop (sidebar visible)
2. Sidebar shows category buttons:
   - Electronics ✓
   - Clothing
   - Home & Garden
   - Sports
3. User clicks "Clothing"
4. Product grid filters to show only clothing
5. Sidebar "Clothing" button now checked
6. User clicks sidebar collapse button
7. Sidebar collapses to icon-only mode

**Components Used**: Sidebar, state-driven filtering

---

### Flow 8: Switch View Mode
1. User on product list
2. Tabs show: Grid | List | Favorites
3. User clicks "List" tab
4. Products re-render in list view (vertical cards)
5. List tab now active

**Components Used**: Tabs, keyboard navigation

---

### Flow 9: Mobile Category Filter
1. User on mobile device (< 1024px)
2. Sidebar transforms to Drawer (off-screen)
3. User clicks hamburger menu button
4. Drawer slides in from left with categories
5. User selects "Electronics"
6. Drawer auto-dismisses
7. Products filtered

**Components Used**: Drawer (Sidebar mobile fallback)

---

## 🧪 Testing Strategy

### Unit Tests (TestStore)

**ProductDetail Reducer Tests**:
```typescript
describe('ProductDetail reducer', () => {
  it('shows add to cart sheet when button tapped', async () => {
    const store = TestStore(productDetailReducer, initialState, mockDeps);

    await store.send({ type: 'addToCartButtonTapped' }, (state) => {
      expect(state.destination?.type).toBe('addToCart');
      expect(state.destination?.state.quantity).toBe(1);
    });
  });

  it('observes child add action and dismisses', async () => {
    const store = TestStore(productDetailReducer, stateWithAddToCart, mockDeps);

    await store.send({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addToCart',
          action: { type: 'addButtonTapped' }
        }
      }
    }, (state) => {
      expect(state.destination).toBeNull();
    });

    // Verify effect dispatched cart update
    await store.receive({ type: 'cartItemAdded', productId: 'prod-1' });
  });
});
```

**AddToCart Reducer Tests**:
```typescript
describe('AddToCart reducer', () => {
  it('increments quantity', async () => {
    const store = TestStore(addToCartReducer, { productId: 'p1', quantity: 1 }, mockDeps);

    await store.send({ type: 'incrementQuantity' }, (state) => {
      expect(state.quantity).toBe(2);
    });
  });

  it('decrements quantity with minimum of 1', async () => {
    const store = TestStore(addToCartReducer, { productId: 'p1', quantity: 1 }, mockDeps);

    await store.send({ type: 'decrementQuantity' }, (state) => {
      expect(state.quantity).toBe(1); // Can't go below 1
    });
  });

  it('dismisses when cancel tapped', async () => {
    let dismissCalled = false;
    const deps = { dismiss: () => { dismissCalled = true; } };
    const store = TestStore(addToCartReducer, { productId: 'p1', quantity: 2 }, deps);

    await store.send({ type: 'cancelButtonTapped' }, () => {
      expect(dismissCalled).toBe(true);
    });
  });
});
```

### Component Tests (Vitest Browser Mode)

**ProductDetail Component Tests**:
```typescript
describe('ProductDetail component', () => {
  it('renders product details', async () => {
    const { container } = render(ProductDetail, { props: { store } });

    expect(container.querySelector('h1')?.textContent).toBe('Wireless Headphones');
    expect(container.querySelector('.price')?.textContent).toBe('$99.99');
  });

  it('shows add to cart sheet when button clicked', async () => {
    const { container } = render(ProductDetail, { props: { store } });

    await userEvent.click(container.querySelector('[data-testid="add-to-cart"]')!);

    // Sheet should appear
    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
  });
});
```

---

## 📊 Data Model

### Product Type
```typescript
interface Product {
  id: string;
  name: string;
  price: number;
  category: 'electronics' | 'clothing' | 'home' | 'sports';
  image: string;  // URL or placeholder
  description: string;
  specs: Record<string, string>;
  stock: number;
  isFavorite: boolean;
}
```

### Sample Data
```typescript
const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Wireless Headphones',
    price: 99.99,
    category: 'electronics',
    image: '/products/headphones.jpg',
    description: 'Premium wireless headphones with noise cancellation',
    specs: {
      'Battery Life': '30 hours',
      'Connectivity': 'Bluetooth 5.0',
      'Weight': '250g'
    },
    stock: 15,
    isFavorite: false
  },
  {
    id: 'prod-2',
    name: 'Running Shoes',
    price: 79.99,
    category: 'sports',
    image: '/products/shoes.jpg',
    description: 'Lightweight running shoes for optimal performance',
    specs: {
      'Material': 'Mesh fabric',
      'Sole': 'Rubber',
      'Weight': '200g per shoe'
    },
    stock: 42,
    isFavorite: true
  },
  // ... more products
];
```

---

## 🎯 Key Patterns Demonstrated

### 1. Tree-Based Navigation (Optional State)
- ✅ `destination: DestinationState | null` pattern
- ✅ `ifLet()` operator for child feature integration
- ✅ `PresentationAction` wrapping child actions
- ✅ Modal, Sheet, Alert, Popover usage

### 2. Stack-Based Navigation
- ✅ `path: ScreenState[]` pattern
- ✅ `handleStackAction()` for push/pop
- ✅ NavigationStack component
- ✅ Back navigation

### 3. Enum Destinations
- ✅ Multiple presentation types in single enum
- ✅ `createDestinationReducer()` for routing
- ✅ Type-safe destination extraction

### 4. Parent-Child Communication
- ✅ Parent observing child actions (cart updates)
- ✅ Child self-dismissal via `deps.dismiss()`
- ✅ Action wrapping with PresentationAction

### 5. Desktop Navigation Patterns
- ✅ Sidebar for persistent navigation
- ✅ Tabs for view mode switching
- ✅ Popover for contextual info
- ✅ Responsive sidebar → drawer on mobile

### 6. State-Driven Everything
- ✅ All navigation driven by state
- ✅ No imperative show/hide calls
- ✅ Fully testable with TestStore
- ✅ Predictable, reproducible

---

## 🚀 Implementation Phases

### Phase 1: Core Structure (1 hour)
- Set up project structure
- Create data models and sample data
- Define all types (State, Action, Destination)
- Set up Vite + TypeScript config

### Phase 2: List and Stack Navigation (1.5 hours)
- Implement ProductList component (grid/list views)
- Implement ProductDetail component (basic)
- Wire up NavigationStack
- Test push/pop navigation

### Phase 3: Tree Navigation - Sheets (1.5 hours)
- Implement AddToCart feature (Sheet with stepper)
- Implement Share feature (Sheet with options)
- Wire up ifLet for destinations
- Test dismiss and parent observation

### Phase 4: Tree Navigation - Modal/Alert/Popover (1 hour)
- Implement QuickView (Modal)
- Implement Delete confirmation (Alert)
- Implement ProductInfo (Popover)
- Test all presentation types

### Phase 5: Desktop Patterns (1 hour)
- Implement CategoryFilter (Sidebar content)
- Wire up Sidebar with collapse/expand
- Implement Tabs for view mode
- Test responsive behavior

### Phase 6: Polish and Testing (1 hour)
- Add Tailwind styling
- Write comprehensive tests
- Create README with pattern explanations
- Verify all flows work end-to-end

**Total Estimated Time**: 7-8 hours

---

## 📝 README Content

The example README will explain:

1. **Architecture Overview**
   - State structure diagram
   - Reducer composition pattern
   - Navigation flow diagram

2. **Pattern Explanations**
   - How tree navigation works (with code)
   - How stack navigation works (with code)
   - How parent observation works (with code)
   - How dismiss dependency works (with code)

3. **Component Usage**
   - When to use Modal vs Sheet vs Drawer
   - When to use NavigationStack vs tree navigation
   - Desktop patterns (Sidebar, Tabs, Popover)

4. **Testing Approach**
   - TestStore examples
   - Component test examples
   - How to test navigation patterns

5. **Running the Example**
   - Installation steps
   - Development server
   - Available scripts

---

## ✅ Success Criteria

This example successfully demonstrates composable-svelte navigation if:

1. **All 8 components used** in realistic scenarios
2. **All key patterns shown** (tree, stack, enum, observation, dismiss)
3. **Zero form inputs required** (buttons/clicks only)
4. **Fully testable** with TestStore
5. **Well-documented** with clear pattern explanations
6. **Runs smoothly** with good UX
7. **Code is clear** and serves as learning material

---

## 🎓 Learning Outcomes

After studying this example, developers will understand:

1. How to structure navigation state (optional fields + stack arrays)
2. How to use `ifLet()` for tree-based navigation
3. How to use `handleStackAction()` for stack navigation
4. How to observe child actions in parent reducers
5. How to implement self-dismissing child features
6. How to compose multiple navigation patterns
7. How to test navigation with TestStore
8. When to use each navigation component

---

**Next Steps**: Approve this design, then implement in phases.

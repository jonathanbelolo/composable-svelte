import type { StackAction } from '@composable-svelte/core/navigation';
import type { Product, ProductCategory } from '../models/product.js';
import type { CartState } from '../models/cart.js';
import type {
  ProductDetailState,
  ProductDetailAction
} from '../features/product-detail/product-detail.types.js';

// ============================================================================
// App State
// ============================================================================

export type ViewMode = 'grid' | 'list' | 'favorites';

export interface AppState {
  products: Product[];
  cart: CartState;
  filters: FilterState;
  viewMode: ViewMode;
  sidebarExpanded: boolean;
  detailPath: ProductDetailState[];
}

export interface FilterState {
  selectedCategories: ProductCategory[];
}

// ============================================================================
// App Actions
// ============================================================================

export type AppAction =
  | { type: 'productClicked'; productId: string }
  | { type: 'categoryToggled'; category: ProductCategory }
  | { type: 'viewModeChanged'; mode: ViewMode }
  | { type: 'sidebarToggled' }
  | { type: 'cartItemAdded'; productId: string; quantity: number }
  | { type: 'productDeleted'; productId: string }
  | { type: 'favoriteToggled'; productId: string }
  | { type: 'detailPath'; action: StackAction<ProductDetailState, ProductDetailAction> };

// ============================================================================
// Factory Functions
// ============================================================================

export function createInitialAppState(products: Product[]): AppState {
  return {
    products,
    cart: { items: [] },
    filters: {
      selectedCategories: []
    },
    viewMode: 'grid',
    sidebarExpanded: true,
    detailPath: []
  };
}

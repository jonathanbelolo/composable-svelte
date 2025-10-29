import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
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
  productDetail: ProductDetailState | null;  // Tree-based navigation (what to show)
  presentation: PresentationState<ProductDetailState>;  // Animation lifecycle
}

export interface FilterState {
  selectedCategories: ProductCategory[];
}

// ============================================================================
// App Actions
// ============================================================================

export type PresentationEvent =
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };

export type AppAction =
  | { type: 'productClicked'; productId: string }
  | { type: 'categoryToggled'; category: ProductCategory }
  | { type: 'viewModeChanged'; mode: ViewMode }
  | { type: 'sidebarToggled' }
  | { type: 'cartItemAdded'; productId: string; quantity: number }
  | { type: 'productDeleted'; productId: string }
  | { type: 'favoriteToggled'; productId: string }
  | { type: 'productDetail'; action: PresentationAction<ProductDetailAction> }
  | { type: 'presentation'; event: PresentationEvent };

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
    productDetail: null,
    presentation: { status: 'idle' }
  };
}

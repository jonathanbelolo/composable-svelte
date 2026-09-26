import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
import type { Product, ProductCategory } from '../models/product.js';
import type { CartState } from '../models/cart.js';
import type {
  ProductDetailState,
  ProductDetailAction
} from '../features/product-detail/product-detail.types.js';
import { createProductDetailState } from '../features/product-detail/product-detail.types.js';

export type ViewMode = 'grid' | 'list' | 'favorites';

export interface AppState {
  products: Product[];
  cart: CartState;
  filters: FilterState;
  viewMode: ViewMode;
  sidebarExpanded: boolean;
  productDetail: ProductDetailState | null;
  presentation: PresentationState<ProductDetailState>;
}

export interface FilterState {
  selectedCategories: ProductCategory[];
}

export type PresentationEvent = { type: 'dismissalRequested' };

export type AppAction =
  | { type: 'productClicked'; productId: string }
  | { type: 'filtersCleared' }
  | { type: 'categoryToggled'; category: ProductCategory }
  | { type: 'viewModeChanged'; mode: ViewMode }
  | { type: 'sidebarToggled' }
  | { type: 'favoriteToggled'; productId: string }
  | { type: 'productDetail'; action: PresentationAction<ProductDetailAction> }
  | { type: 'presentation'; event: PresentationEvent };

export interface AppInitialInput {
  readonly products: readonly Product[];
  readonly url: string;
}

export function createInitialAppState(
  products: readonly Product[],
  productId: string | null = null
): AppState {
  const selected = productId && products.some((product) => product.id === productId)
    ? productId
    : null;
  const productDetail = selected ? createProductDetailState(selected) : null;
  return {
    products: [...products],
    cart: { items: [] },
    filters: { selectedCategories: [] },
    viewMode: 'grid',
    sidebarExpanded: true,
    productDetail,
    presentation: productDetail
      ? { status: 'presented', content: productDetail }
      : { status: 'idle' }
  };
}

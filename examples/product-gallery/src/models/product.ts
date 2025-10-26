// ============================================================================
// Product Model
// ============================================================================

export type ProductCategory = 'electronics' | 'clothing' | 'home' | 'sports';

export interface Product {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  image: string;
  description: string;
  specs: Record<string, string>;
  stock: number;
  isFavorite: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function isInStock(product: Product): boolean {
  return product.stock > 0;
}

export function getStockStatus(product: Product): string {
  if (product.stock === 0) return 'Out of Stock';
  if (product.stock < 5) return 'Low Stock';
  return 'In Stock';
}

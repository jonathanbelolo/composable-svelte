// ============================================================================
// Cart Model
// ============================================================================

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
}

// ============================================================================
// Helper Functions
// ============================================================================

export function createEmptyCart(): CartState {
  return { items: [] };
}

export function addToCart(cart: CartState, productId: string, quantity: number): CartState {
  const existingItem = cart.items.find((item) => item.productId === productId);

  if (existingItem) {
    return {
      items: cart.items.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item
      )
    };
  }

  return {
    items: [...cart.items, { productId, quantity }]
  };
}

export function getTotalItems(cart: CartState): number {
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

export function getCartItemQuantity(cart: CartState, productId: string): number {
  const item = cart.items.find((i) => i.productId === productId);
  return item?.quantity ?? 0;
}

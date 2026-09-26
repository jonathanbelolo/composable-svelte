export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
}

/** Accepted page decision. Both list URLs are valid and survive browser traversal. */
export type InventoryRoute =
  | { type: 'list'; path: '/' | '/inventory' }
  | { type: 'detail'; itemId: string }
  | { type: 'add' }
  | { type: 'notFound'; path: string };

export interface InventoryState {
  route: InventoryRoute;
  items: InventoryItem[];
  searchQuery: string;
  selectedCategory: string | null;
}

export type InventoryAction =
  | { type: 'routeRequested'; route: InventoryRoute }
  | { type: 'itemSelected'; itemId: string }
  | { type: 'addTapped' }
  | { type: 'closeDestination' }
  | { type: 'itemAdded'; item: InventoryItem }
  | { type: 'itemUpdated'; itemId: string; updates: Partial<InventoryItem> }
  | { type: 'itemDeleted'; itemId: string }
  | { type: 'searchChanged'; query: string }
  | { type: 'categorySelected'; category: string | null };

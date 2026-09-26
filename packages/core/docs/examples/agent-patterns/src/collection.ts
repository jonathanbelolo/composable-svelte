// Example policy, not a framework-wide cache: the service supplies monotonically
// increasing revisions. A tombstone participates in revision ordering too.
export interface Item { readonly id: string; readonly revision: number; readonly text: string; readonly flagged: boolean; readonly deleted?: boolean }
export interface Collection {
  readonly entities: Readonly<Record<string, Item>>;
  readonly order: readonly string[];
  readonly membership: readonly string[];
  readonly acceptedQuery: string | null;
  readonly request: number;
  readonly pendingQuery: string | null;
}
export const emptyCollection = (): Collection => ({ entities: {}, order: [], membership: [], acceptedQuery: null, request: 0, pendingQuery: null });
export function merge(state: Collection, incoming: readonly Item[]): Collection {
  const entities = { ...state.entities };
  const order = [...state.order];
  const known = new Set(order);
  for (const item of incoming) {
    const old = Object.hasOwn(entities, item.id) ? entities[item.id] : undefined;
    if (!old || item.revision > old.revision) {
      Object.defineProperty(entities, item.id, { value: item, enumerable: true, configurable: true, writable: true });
    }
    if (!known.has(item.id)) { known.add(item.id); order.push(item.id); }
  }
  return { ...state, entities, order };
}
export function beginSearch(state: Collection, query: string): Collection {
  return { ...state, request: state.request + 1, pendingQuery: query };
}
export function acceptSearch(state: Collection, request: number, query: string, items: readonly Item[]): Collection {
  if (request !== state.request || query !== state.pendingQuery) return state;
  return { ...merge(state, items), membership: [...new Set(items.map(item => item.id))], acceptedQuery: query, pendingQuery: null };
}
export function displayed(state: Collection, flaggedOnly = false): readonly Item[] {
  const members = new Set(state.membership);
  return state.order.flatMap(id => {
    const item = Object.hasOwn(state.entities, id) ? state.entities[id] : undefined;
    return members.has(id) && item && !item.deleted && (!flaggedOnly || item.flagged) ? [item] : [];
  });
}
export function move(state: Collection, id: string, direction: -1 | 1, flaggedOnly = false): Collection {
  const visible = displayed(state, flaggedOnly);
  const from = visible.findIndex(item => item.id === id);
  const neighbor = visible[from + direction];
  if (from < 0 || !neighbor) return state;
  return { ...state, order: state.order.map(key => key === id ? neighbor.id : key === neighbor.id ? id : key) };
}

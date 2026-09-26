import type { InventoryRoute } from './types';

/** Pure URL decisions; the framework owns history and event lifetimes. */
export function parseInventoryURL(input: string): InventoryRoute {
  const {pathname, search} = new URL(input.startsWith('/') ? `https://inventory.example${input}` : input);
  if (pathname === '/' || pathname === '/inventory') return {type:'list',path:pathname};
  if (pathname === '/inventory/add') return {type:'add'};
  const match = /^\/inventory\/item\/([^/]+)$/.exec(pathname);
  if (match?.[1]) {
    try { return {type:'detail',itemId:decodeURIComponent(match[1])}; }
    catch { /* Malformed encoding is an ordinary not-found route. */ }
  }
  return {type:'notFound',path:pathname + search};
}
export function serializeInventoryState(route: InventoryRoute): string {
  switch (route.type) {
    case 'list': return route.path;
    case 'detail': return `/inventory/item/${encodeURIComponent(route.itemId)}`;
    case 'add': return '/inventory/add';
    case 'notFound': return route.path.startsWith('//') ? '/not-found' : route.path;
  }
}

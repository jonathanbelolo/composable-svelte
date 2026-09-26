import { matchPath } from '@composable-svelte/core/routing';
import type { ApplicationRouting } from '@composable-svelte/core/application';
import type { AppAction, AppState } from './app.types.js';

function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0] || '/';
}

export function serializeAppState(state: AppState): string {
  return state.productDetail ? `/product/${state.productDetail.productId}` : '/';
}

export function parseAppURL(url: string): string | null {
  const path = pathOf(url);
  if (path === '/') return null;
  return matchPath('/product/:productId', path)?.productId ?? null;
}

export const appRouting: ApplicationRouting<AppState, AppAction> = {
  fragment: 'native',
  serialize: serializeAppState,
  request: (url) => {
    const path = pathOf(url);
    if (path === '/') {
      return {
        action: { type: 'presentation', event: { type: 'dismissalRequested' } },
        expectedURL: '/'
      };
    }
    const productId = parseAppURL(path);
    return productId
      ? { action: { type: 'productClicked', productId }, expectedURL: `/product/${productId}` }
      : undefined;
  }
};

export function productIdToAction(productId: string | null): AppAction {
  return productId
    ? { type: 'productClicked', productId }
    : { type: 'presentation', event: { type: 'dismissalRequested' } };
}

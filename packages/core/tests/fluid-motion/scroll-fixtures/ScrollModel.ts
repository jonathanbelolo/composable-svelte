import { defineApplication } from '../../../src/lib/application/index.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import type { ScrollPolicy } from '../../../src/lib/application/routing.js';

export type ScrollState = { readonly url: string; readonly visits: number };
export type ScrollAction = { readonly type: 'navigate'; readonly url: string; readonly replace?: boolean };
export const scrollReducer: Reducer<ScrollState, ScrollAction> = (state, action) =>
  [{ url: action.url, visits: state.visits + 1 }, Effect.none()];

/** Routed definition with scroll ownership; `/frag…` pushes use the explicit fragment-target policy. */
export function scrollDefinition(options: { readonly scroll?: boolean; readonly policy?: (next: ScrollState, cause: string) => ScrollPolicy | undefined } = {}) {
  return defineApplication(scrollReducer, {
    initialState: (url: string) => ({ url, visits: 0 }),
    routing: {
      fragment: 'native',
      serialize: state => state.url,
      request: url => ({ action: { type: 'navigate', url }, expectedURL: url }),
      writePolicy: (_previous, next) => next.url.includes('replace') ? 'replace' : 'push',
      ...(options.scroll === false ? {} : {
        scroll: {
          containers: ['panel'],
          policy: ({ next, cause }) => options.policy?.(next, cause) ?? (cause === 'push' && next.url.includes('/frag') ? 'fragment' : undefined)
        }
      })
    }
  });
}

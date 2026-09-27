import { defineChoreography } from '@composable-svelte/core/application/motion';

// Catalog card → detail heading. The route commits at cueMs; tracks continue after it.
export const openDetail = (id: string) =>
  defineChoreography({
    cueMs: 200,
    durationMs: 520,
    tracks: [
      {
        participant: `item-${id}`,
        side: 'shared',
        startMs: 0,
        durationMs: 520,
        easing: 'ease-in-out',
        radius: { from: 12, to: 0 },
        path: [{ atMs: 200, pose: { relativeTo: 'source', dy: -24 } }]
      },
      { participant: 'catalog-list', side: 'outgoing', startMs: 0, durationMs: 180, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'catalog-mark', side: 'outgoing', startMs: 0, durationMs: 180, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      // The real incoming body slides up 24px while it fades in (timed from the destination render).
      {
        participant: 'detail-body',
        side: 'incoming',
        startMs: 0,
        durationMs: 300,
        easing: 'ease-out',
        opacity: { from: 0, to: 1 },
        slide: { dx: 0, dy: 24 }
      }
    ]
  });

// Detail heading → catalog card: an ordinary forward request with its own plan.
export const closeDetail = (id: string) =>
  defineChoreography({
    cueMs: 160,
    durationMs: 420,
    tracks: [
      { participant: `item-${id}`, side: 'shared', startMs: 0, durationMs: 420, easing: 'ease-in-out', radius: { from: 0, to: 12 } },
      { participant: 'detail-body', side: 'outgoing', startMs: 0, durationMs: 140, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'catalog-list', side: 'incoming', startMs: 0, durationMs: 260, easing: 'ease-out', opacity: { from: 0, to: 1 } }
    ]
  });

// Within-page: the list surface resizes while its content crossfades; removed items fade out.
export const filterCatalog = (leaving: readonly string[]) =>
  defineChoreography({
    cueMs: 0,
    durationMs: 300,
    tracks: [
      { participant: 'catalog-list', side: 'shared', startMs: 0, durationMs: 300, easing: 'ease-out' },
      ...leaving.map(id => ({ participant: `item-${id}`, side: 'outgoing' as const, startMs: 0, durationMs: 200, easing: 'ease-in' as const, opacity: { from: 1, to: 0 } }))
    ]
  });

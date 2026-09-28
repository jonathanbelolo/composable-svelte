import { defineChoreography, type OverlayScopeRef } from '@composable-svelte/core/application/motion';

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

// Overlay plans for the notes dialog (bound with useOverlayMotion in DetailView). A plain string names a
// participant of the page; `overlay.select(key)` names one inside this dialog instance.
export const notesOpen = (overlay: OverlayScopeRef, id: string) =>
  defineChoreography({
    cueMs: 0,
    durationMs: 480,
    tracks: [
      // The page heading flies into the dialog's title. `from` resolves before the open, `to` after it renders.
      {
        participant: 'notes-heading',
        side: 'shared',
        from: `item-${id}`,
        to: overlay.select('notes-title'),
        startMs: 0,
        durationMs: 480,
        easing: { cubicBezier: [0.2, 0, 0, 1] },
        // This waypoint's easing governs the segment that ends at it. The final segment to the measured destination is a
        // continuation curve, not the track easing.
        path: [{ atMs: 200, pose: { relativeTo: 'source', dy: -16 }, easing: 'ease-out' }]
      },
      // The page rests dimmed while the dialog is open: held for this dialog instance until its next accepted transition.
      { participant: 'detail-body', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0.6 }, scale: { from: 1, to: 0.98 }, lifetime: 'overlay' },
      { participant: overlay.select('backdrop'), side: 'incoming', startMs: 0, durationMs: 300, opacity: { from: 0, to: 1 } },
      // An overshooting CSS curve: scale may overshoot; opacity is clamped to [0, 1].
      { participant: overlay.select('content'), side: 'incoming', startMs: 60, durationMs: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', scale: { from: 0.94, to: 1 }, opacity: { from: 0, to: 1 } }
    ]
  });

export const notesClose = (overlay: OverlayScopeRef, id: string) =>
  defineChoreography({
    cueMs: 0,
    durationMs: 400,
    tracks: [
      { participant: 'notes-heading', side: 'shared', from: overlay.select('notes-title'), to: `item-${id}`, startMs: 0, durationMs: 400, easing: 'ease-in-out' },
      // The leaving dialog content slides down and shrinks while it fades.
      { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 260, opacity: { from: 1, to: 0 }, slide: { dy: 24 }, scale: { from: 1, to: 0.96 } },
      { participant: overlay.select('backdrop'), side: 'outgoing', startMs: 60, durationMs: 300, opacity: { from: 1, to: 0 } },
      // The close starts from the page's displayed resting values and returns it to stable.
      { participant: 'detail-body', side: 'incoming', startMs: 0, durationMs: 300, opacity: { from: 0.6, to: 1 }, scale: { from: 0.98, to: 1 } }
    ]
  });

// An explicit one-off close that replaces the default close plan for that transition only.
export const notesQuickClose = (overlay: OverlayScopeRef) =>
  defineChoreography({
    cueMs: 0,
    durationMs: 160,
    tracks: [{ participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 160, opacity: { from: 1, to: 0 }, scale: { from: 1, to: 0.9 } }]
  });

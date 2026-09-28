/**
 * Horizon Gallery — stacked overlay choreography plans.
 *
 * Implements declarative overlay motion plans (implementation-interface §1–§3):
 * - Page/backdrop/content together on one timeline
 * - Shared card -> modal hero on open, and modal hero -> card on close
 * - Waypoint override and typed custom cubicBezier curves
 * - Custom overshoot curves ([0.34, 1.56, 0.64, 1])
 * - Drawer slide with page push/dim
 * - Explicit transition plans for the Close button and for Save & Close (bound to the accepted close after the save)
 * - Reduced motion: fades, plus the page's full resting pose reached immediately (no intermediate geometry)
 * - Overlay-lifetime page reactions: the catalog rests dimmed/contracted (modal) or pushed (drawer) while open
 */
import {
  defineChoreography,
  type ChoreographyPlan,
  type OverlayScopeRef
} from '@composable-svelte/core/application/motion';
import { cardKey } from './motion.js';

/** Declarative open and close plans for the Curator & Specification Modal. */
export function curatorModalPlans(
  overlay: OverlayScopeRef,
  workId: string,
  reduced: boolean
): { readonly open: ChoreographyPlan; readonly close: ChoreographyPlan } {
  if (reduced) {
    return {
      open: defineChoreography({
        cueMs: 0,
        durationMs: 140,
        tracks: [
          {
            participant: overlay.select('backdrop'),
            side: 'incoming',
            startMs: 0,
            durationMs: 140,
            easing: 'linear',
            opacity: { from: 0, to: 1 }
          },
          {
            participant: overlay.select('content'),
            side: 'incoming',
            startMs: 0,
            durationMs: 140,
            easing: 'linear',
            opacity: { from: 0, to: 1 }
          },
          // The same full resting pose as the full plan, reached immediately (no intermediate geometry).
          {
            participant: 'catalog',
            side: 'outgoing',
            startMs: 0,
            durationMs: 0,
            opacity: { from: 1, to: 0.88 },
            scale: { from: 1, to: 0.98 },
            lifetime: 'overlay'
          }
        ]
      }),
      close: defineChoreography({
        cueMs: 0,
        durationMs: 120,
        tracks: [
          {
            participant: overlay.select('content'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 120,
            easing: 'linear',
            opacity: { from: 1, to: 0 }
          },
          {
            participant: overlay.select('backdrop'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 120,
            easing: 'linear',
            opacity: { from: 1, to: 0 }
          },
          {
            participant: 'catalog',
            side: 'incoming',
            anchor: 'timeline',
            startMs: 0,
            durationMs: 0,
            opacity: { from: 0.88, to: 1 },
            scale: { from: 0.98, to: 1 }
          }
        ]
      })
    };
  }

  return {
    open: defineChoreography({
      cueMs: 0,
      durationMs: 440,
      tracks: [
        // Shared track: card in page grid -> modal hero plate
        {
          participant: cardKey(workId),
          side: 'shared',
          from: cardKey(workId),
          to: overlay.select('hero'),
          startMs: 0,
          durationMs: 440,
          easing: { cubicBezier: [0.2, 0, 0, 1] },
          content: 'crossfade',
          radius: { from: 12, to: 16 },
          path: [
            {
              atMs: 180,
              pose: { relativeTo: 'source', dy: -12, dw: 24, dh: 12 },
              radius: 16,
              easing: { cubicBezier: [0.25, 1, 0.5, 1] }
            }
          ]
        },
        // Backdrop fades in
        {
          participant: overlay.select('backdrop'),
          side: 'incoming',
          startMs: 0,
          durationMs: 320,
          easing: 'ease-out',
          opacity: { from: 0, to: 1 }
        },
        // Content panel zooms in with overshoot curve
        {
          participant: overlay.select('content'),
          side: 'incoming',
          startMs: 40,
          durationMs: 400,
          easing: { cubicBezier: [0.34, 1.56, 0.64, 1] },
          opacity: { from: 0, to: 1 },
          scale: { from: 0.94, to: 1 }
        },
        // The page catalog dims and slightly contracts, and rests there while this modal is open (overlay lifetime).
        // The close plans' incoming catalog tracks return it from that resting state.
        {
          participant: 'catalog',
          side: 'outgoing',
          startMs: 0,
          durationMs: 320,
          easing: 'ease-out',
          opacity: { from: 1, to: 0.88 },
          scale: { from: 1, to: 0.98 },
          lifetime: 'overlay'
        }
      ]
    }),
    close: defineChoreography({
      cueMs: 0,
      durationMs: 380,
      tracks: [
        // Shared track: modal hero plate -> card in page grid
        {
          participant: cardKey(workId),
          side: 'shared',
          from: overlay.select('hero'),
          to: cardKey(workId),
          startMs: 0,
          durationMs: 380,
          easing: { cubicBezier: [0.25, 1, 0.5, 1] },
          content: 'crossfade',
          radius: { from: 16, to: 12 }
        },
        // Content panel fades and scales out
        {
          participant: overlay.select('content'),
          side: 'outgoing',
          startMs: 0,
          durationMs: 240,
          easing: 'ease-in',
          opacity: { from: 1, to: 0 },
          scale: { from: 1, to: 0.95 }
        },
        // Backdrop fades out
        {
          participant: overlay.select('backdrop'),
          side: 'outgoing',
          startMs: 60,
          durationMs: 320,
          easing: 'ease-in',
          opacity: { from: 1, to: 0 }
        },
        // Page catalog returns to full scale and brightness
        {
          participant: 'catalog',
          side: 'incoming',
          anchor: 'timeline',
          startMs: 80,
          durationMs: 300,
          easing: 'ease-out',
          opacity: { from: 0.88, to: 1 },
          scale: { from: 0.98, to: 1 }
        }
      ]
    })
  };
}

/**
 * Explicit plan for the Close button, also used by Save & Close. `transition()` applies it only when the
 * synchronous commit is accepted: a clean Close, or `commitSavedClose` after a successful save. A dirty
 * draft's refused close acquires nothing and opens the discard alert.
 */
export function curatorClosePlan(
  overlay: OverlayScopeRef,
  workId: string,
  reduced: boolean
): ChoreographyPlan {
  if (reduced) {
    return defineChoreography({
      cueMs: 0,
      durationMs: 100,
      tracks: [
        {
          participant: overlay.select('content'),
          side: 'outgoing',
          startMs: 0,
          durationMs: 100,
          opacity: { from: 1, to: 0 }
        },
        {
          participant: overlay.select('backdrop'),
          side: 'outgoing',
          startMs: 0,
          durationMs: 100,
          opacity: { from: 1, to: 0 }
        },
        {
          participant: 'catalog',
          side: 'incoming',
          anchor: 'timeline',
          startMs: 0,
          durationMs: 0,
          opacity: { from: 0.88, to: 1 },
          scale: { from: 0.98, to: 1 }
        }
      ]
    });
  }

  return defineChoreography({
    cueMs: 0,
    durationMs: 240,
    tracks: [
      {
        participant: cardKey(workId),
        side: 'shared',
        from: overlay.select('hero'),
        to: cardKey(workId),
        startMs: 0,
        durationMs: 240,
        easing: 'ease-out',
        content: 'crossfade',
        radius: { from: 16, to: 12 }
      },
      {
        participant: overlay.select('content'),
        side: 'outgoing',
        startMs: 0,
        durationMs: 160,
        easing: 'ease-in',
        opacity: { from: 1, to: 0 },
        scale: { from: 1, to: 0.94 }
      },
      {
        participant: overlay.select('backdrop'),
        side: 'outgoing',
        startMs: 40,
        durationMs: 200,
        opacity: { from: 1, to: 0 }
      },
      {
        participant: 'catalog',
        side: 'incoming',
        anchor: 'timeline',
        startMs: 40,
        durationMs: 200,
        easing: 'ease-out',
        opacity: { from: 0.88, to: 1 },
        scale: { from: 0.98, to: 1 }
      }
    ]
  });
}

/**
 * Explicit plan for Save & Close. The view binds it to the accepted close that follows a successful save
 * (`commitSavedClose`), a synchronous commit. It never wraps the async save itself.
 */
export function curatorSaveClosePlan(overlay: OverlayScopeRef, workId: string, reduced: boolean): ChoreographyPlan {
  return curatorClosePlan(overlay, workId, reduced);
}

/** Declarative open and close plans for the technical specifications Drawer. */
export function drawerPlans(
  overlay: OverlayScopeRef,
  reduced: boolean
): { readonly open: ChoreographyPlan; readonly close: ChoreographyPlan } {
  if (reduced) {
    return {
      open: defineChoreography({
        cueMs: 0,
        durationMs: 140,
        tracks: [
          {
            participant: overlay.select('backdrop'),
            side: 'incoming',
            startMs: 0,
            durationMs: 140,
            opacity: { from: 0, to: 1 }
          },
          {
            participant: overlay.select('content'),
            side: 'incoming',
            startMs: 0,
            durationMs: 140,
            opacity: { from: 0, to: 1 }
          },
          // The same resting push as the full plan, reached immediately.
          {
            participant: 'catalog',
            side: 'outgoing',
            startMs: 0,
            durationMs: 0,
            opacity: { from: 1, to: 1 },
            slide: { dx: -32, dy: 0 },
            lifetime: 'overlay'
          }
        ]
      }),
      close: defineChoreography({
        cueMs: 0,
        durationMs: 120,
        tracks: [
          {
            participant: overlay.select('content'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 120,
            opacity: { from: 1, to: 0 }
          },
          {
            participant: overlay.select('backdrop'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 120,
            opacity: { from: 1, to: 0 }
          },
          {
            participant: 'catalog',
            side: 'incoming',
            anchor: 'timeline',
            startMs: 0,
            durationMs: 0,
            opacity: { from: 1, to: 1 },
            slide: { dx: -32, dy: 0 }
          }
        ]
      })
    };
  }

  return {
    open: defineChoreography({
      cueMs: 0,
      durationMs: 380,
      tracks: [
        {
          participant: overlay.select('backdrop'),
          side: 'incoming',
          startMs: 0,
          durationMs: 280,
          opacity: { from: 0, to: 1 },
          easing: 'ease-out'
        },
        {
          participant: overlay.select('content'),
          side: 'incoming',
          startMs: 0,
          durationMs: 380,
          easing: { cubicBezier: [0.2, 0, 0, 1] },
          opacity: { from: 0, to: 1 },
          slide: { dx: 360, dy: 0 }
        },
        // The drawer pushes the page aside; it stays there while the drawer is open (overlay lifetime).
        {
          participant: 'catalog',
          side: 'outgoing',
          startMs: 0,
          durationMs: 360,
          easing: { cubicBezier: [0.2, 0, 0, 1] },
          // A push only moves the page: keep it painted (an outgoing track otherwise fades 1 -> 0, and would rest hidden).
          opacity: { from: 1, to: 1 },
          slide: { dx: -32, dy: 0 },
          lifetime: 'overlay'
        }
      ]
    }),
    close: defineChoreography({
      cueMs: 0,
      durationMs: 320,
      tracks: [
        {
          participant: overlay.select('content'),
          side: 'outgoing',
          startMs: 0,
          durationMs: 280,
          easing: 'ease-in',
          opacity: { from: 1, to: 0 },
          slide: { dx: 360, dy: 0 }
        },
        {
          participant: overlay.select('backdrop'),
          side: 'outgoing',
          startMs: 40,
          durationMs: 280,
          opacity: { from: 1, to: 0 }
        },
        // The page slides back from its resting push.
        {
          participant: 'catalog',
          side: 'incoming',
          anchor: 'timeline',
          startMs: 40,
          durationMs: 280,
          easing: 'ease-out',
          opacity: { from: 1, to: 1 },
          slide: { dx: -32, dy: 0 }
        }
      ]
    })
  };
}

/** Declarative open and close plans for the nested discard confirmation alert. */
export function nestedAlertPlans(
  overlay: OverlayScopeRef,
  reduced: boolean
): { readonly open: ChoreographyPlan; readonly close: ChoreographyPlan } {
  if (reduced) {
    return {
      open: defineChoreography({
        cueMs: 0,
        durationMs: 100,
        tracks: [
          {
            participant: overlay.select('backdrop'),
            side: 'incoming',
            startMs: 0,
            durationMs: 100,
            opacity: { from: 0, to: 1 }
          },
          {
            participant: overlay.select('content'),
            side: 'incoming',
            startMs: 0,
            durationMs: 100,
            opacity: { from: 0, to: 1 }
          }
        ]
      }),
      close: defineChoreography({
        cueMs: 0,
        durationMs: 100,
        tracks: [
          {
            participant: overlay.select('content'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 100,
            opacity: { from: 1, to: 0 }
          },
          {
            participant: overlay.select('backdrop'),
            side: 'outgoing',
            startMs: 0,
            durationMs: 100,
            opacity: { from: 1, to: 0 }
          }
        ]
      })
    };
  }

  return {
    open: defineChoreography({
      cueMs: 0,
      durationMs: 220,
      tracks: [
        {
          participant: overlay.select('backdrop'),
          side: 'incoming',
          startMs: 0,
          durationMs: 180,
          opacity: { from: 0, to: 1 }
        },
        {
          participant: overlay.select('content'),
          side: 'incoming',
          startMs: 0,
          durationMs: 220,
          easing: { cubicBezier: [0.34, 1.56, 0.64, 1] },
          opacity: { from: 0, to: 1 },
          scale: { from: 0.9, to: 1 }
        }
      ]
    }),
    close: defineChoreography({
      cueMs: 0,
      durationMs: 160,
      tracks: [
        {
          participant: overlay.select('content'),
          side: 'outgoing',
          startMs: 0,
          durationMs: 140,
          easing: 'ease-in',
          opacity: { from: 1, to: 0 },
          scale: { from: 1, to: 0.95 }
        },
        {
          participant: overlay.select('backdrop'),
          side: 'outgoing',
          startMs: 20,
          durationMs: 140,
          opacity: { from: 1, to: 0 }
        }
      ]
    })
  };
}

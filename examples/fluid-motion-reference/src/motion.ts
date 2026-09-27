/**
 * Horizon Gallery — choreography plans (visual data only).
 *
 * Route plans are passed to staged route requests; the framework commits the route at `cueMs`,
 * measures the real destination and retargets shared tracks to it. Layout plans are passed to
 * `useLayoutChoreography().transition`, which commits the business change immediately.
 *
 * Reduced motion: route plans drop every geometry track and keep one short opacity handoff for the
 * incoming content; layout changes commit without a transition (see the views). The OS
 * `prefers-reduced-motion` setting is honoured by the framework itself.
 */
import { defineChoreography, type ChoreographyPlan } from '@composable-svelte/core/application/motion';
import { works } from './model.js';

/** Card participant key for one work; shared by the grid card and the study surface. */
export const cardKey = (id: string) => `card-${id}`;

const handoff = (participant: string): ChoreographyPlan =>
  defineChoreography({
    cueMs: 0,
    durationMs: 160,
    tracks: [{ participant, side: 'incoming', anchor: 'timeline', startMs: 0, durationMs: 160, easing: 'linear', opacity: { from: 0, to: 1 } }]
  });

/**
 * Home → dossier. The title plate leaves `main` and settles as the dossier `header`: it rises and
 * narrows through a source-relative pose, the route commits mid-flight at 280 ms, and the dossier
 * introduction fades in from 300 ms while the plate is still travelling (until 760 ms).
 */
export function toDossier(reduced: boolean): ChoreographyPlan {
  if (reduced) return handoff('intro');
  return defineChoreography({
    cueMs: 280,
    durationMs: 900,
    tracks: [
      {
        participant: 'hero',
        side: 'shared',
        startMs: 0,
        durationMs: 760,
        easing: 'ease-in-out',
        content: 'crossfade',
        radius: { from: 20, to: 12 },
        path: [{ atMs: 280, pose: { relativeTo: 'source', dy: -40, dw: -160, dh: -70 }, radius: 16 }]
      },
      { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 220, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'nav', side: 'outgoing', startMs: 40, durationMs: 240, easing: 'linear', opacity: { from: 1, to: 0 } },
      // The catalogue is not animated here: it holds controls, so it would hold-then-fade from the commit, and a
      // nested figure inherits that fade. It leaves at the commit; the pavilion figure alone lingers, still live.
      // The pavilion figure (artwork and live model, no controls) lingers in place after the commit, then leaves.
      { participant: 'pavilion-art', side: 'outgoing', startMs: 700, durationMs: 200, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'reading-list', side: 'outgoing', startMs: 60, durationMs: 220, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'intro', side: 'incoming', anchor: 'timeline', startMs: 300, durationMs: 420, easing: 'ease-out', opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } },
      { participant: 'status', side: 'incoming', anchor: 'timeline', startMs: 380, durationMs: 360, easing: 'ease-out', opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } }
    ]
  });
}

/** Dossier → home: the header plate descends back into `main`; the catalogue returns in staggered tracks. */
export function fromDossier(reduced: boolean): ChoreographyPlan {
  if (reduced) return handoff('catalog');
  return defineChoreography({
    cueMs: 220,
    durationMs: 900,
    tracks: [
      {
        participant: 'hero',
        side: 'shared',
        startMs: 0,
        durationMs: 680,
        easing: 'ease-in-out',
        content: 'crossfade',
        radius: { from: 12, to: 20 },
        path: [{ atMs: 220, pose: { relativeTo: 'source', dy: 32, dh: 40 } }]
      },
      { participant: 'intro', side: 'outgoing', startMs: 0, durationMs: 200, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      // The airflow loop lingers in place, still playing, well after the commit, then leaves.
      { participant: 'airflow', side: 'outgoing', startMs: 780, durationMs: 120, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'status', side: 'outgoing', startMs: 0, durationMs: 160, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'body', side: 'incoming', anchor: 'timeline', startMs: 260, durationMs: 340, easing: 'ease-out', opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } },
      { participant: 'catalog', side: 'incoming', anchor: 'timeline', startMs: 300, durationMs: 380, easing: 'ease-out', opacity: { from: 0, to: 1 } },
      { participant: 'reading-list', side: 'incoming', anchor: 'timeline', startMs: 360, durationMs: 320, easing: 'ease-out', opacity: { from: 0, to: 1 } }
    ]
  });
}

/**
 * Card → half-page surface → study. The card swells to a viewport-relative half-page pose before the
 * cue, the study route commits at 300 ms, and the surface settles onto the measured study container
 * while the study tools fade in.
 */
export function openStudy(id: string, reduced: boolean): ChoreographyPlan {
  if (reduced) return handoff('study-tools');
  return defineChoreography({
    cueMs: 300,
    durationMs: 820,
    tracks: [
      {
        participant: cardKey(id),
        side: 'shared',
        startMs: 0,
        durationMs: 820,
        easing: 'ease-in-out',
        content: 'crossfade',
        radius: { from: 12, to: 20 },
        path: [{ atMs: 300, pose: { relativeTo: 'viewport', x: 0.12, y: 0.16, width: 0.76, height: 0.5 }, radius: 28 }]
      },
      { participant: 'hero', side: 'outgoing', startMs: 0, durationMs: 240, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'nav', side: 'outgoing', startMs: 0, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0 } },
      { participant: 'reading-list', side: 'outgoing', startMs: 40, durationMs: 240, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'study-tools', side: 'incoming', anchor: 'timeline', startMs: 420, durationMs: 400, easing: 'ease-out', opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } }
    ]
  });
}

/** Study → card: a new, user-requested collapse. The surface contracts through a smaller pose back into the grid. */
export function closeStudy(id: string, reduced: boolean): ChoreographyPlan {
  if (reduced) return handoff('catalog');
  return defineChoreography({
    cueMs: 240,
    durationMs: 720,
    tracks: [
      {
        participant: cardKey(id),
        side: 'shared',
        startMs: 0,
        durationMs: 720,
        easing: 'ease-in-out',
        content: 'crossfade',
        radius: { from: 20, to: 12 },
        path: [{ atMs: 240, pose: { relativeTo: 'viewport', x: 0.22, y: 0.24, width: 0.56, height: 0.36 }, radius: 24 }]
      },
      { participant: 'study-tools', side: 'outgoing', startMs: 0, durationMs: 180, easing: 'ease-in', opacity: { from: 1, to: 0 } },
      { participant: 'hero', side: 'incoming', anchor: 'timeline', startMs: 280, durationMs: 360, easing: 'ease-out', opacity: { from: 0, to: 1 } },
      { participant: 'nav', side: 'incoming', anchor: 'timeline', startMs: 320, durationMs: 300, easing: 'ease-out', opacity: { from: 0, to: 1 } },
      { participant: 'reading-list', side: 'incoming', anchor: 'timeline', startMs: 380, durationMs: 340, easing: 'ease-out', opacity: { from: 0, to: 1 } }
    ]
  });
}

/**
 * Within-page: feature a work. The chosen card expands through a half-page pose and recontracts into
 * its new first grid slot; the other cards slide to their new slots on their own staggered tracks.
 */
export function featureWork(id: string): ChoreographyPlan {
  const others = works.filter(work => work.id !== id);
  return defineChoreography({
    cueMs: 0,
    durationMs: 900,
    tracks: [
      {
        participant: cardKey(id),
        side: 'shared',
        startMs: 0,
        durationMs: 900,
        easing: 'ease-in-out',
        content: 'crossfade',
        radius: { from: 12, to: 12 },
        path: [{ atMs: 380, pose: { relativeTo: 'viewport', x: 0.14, y: 0.2, width: 0.72, height: 0.5 }, radius: 28 }]
      },
      ...others.map((work, index) => ({
        participant: cardKey(work.id),
        side: 'shared' as const,
        startMs: 160 + index * 90,
        durationMs: 460,
        easing: 'ease-out' as const,
        content: 'translate' as const
      }))
    ]
  });
}

/** Within-page: category filter. Remaining cards travel to their new slots. */
export function filterCatalog(): ChoreographyPlan {
  return defineChoreography({
    cueMs: 0,
    durationMs: 520,
    tracks: works.map((work, index) => ({
      participant: cardKey(work.id),
      side: 'shared' as const,
      startMs: index * 40,
      durationMs: 400,
      easing: 'ease-in-out' as const,
      content: 'translate' as const
    }))
  });
}

/**
 * Within-page whole-layout reconfiguration (gallery ⇄ reading room). The reading list expands into the
 * main column, the catalogue contracts into a side column, the title plate compacts, the subtitle
 * leaves and the reading-room note enters — each on its own timing.
 */
export function reconfigure(toReading: boolean): ChoreographyPlan {
  return defineChoreography({
    cueMs: 0,
    durationMs: 820,
    tracks: [
      { participant: 'hero', side: 'shared', startMs: 0, durationMs: 520, easing: 'ease-in-out', content: 'crossfade' },
      { participant: 'catalog', side: 'shared', startMs: 90, durationMs: 600, easing: 'ease-in-out', content: 'translate' },
      { participant: 'reading-list', side: 'shared', startMs: 0, durationMs: 760, easing: 'ease-in-out', content: 'crossfade', radius: { from: 12, to: toReading ? 20 : 12 } },
      ...(toReading
        ? [
            { participant: 'body', side: 'outgoing' as const, startMs: 0, durationMs: 180, easing: 'ease-in' as const, opacity: { from: 1, to: 0 } },
            { participant: 'reading-note', side: 'incoming' as const, anchor: 'timeline' as const, startMs: 380, durationMs: 440, easing: 'ease-out' as const, opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } }
          ]
        : [
            { participant: 'reading-note', side: 'outgoing' as const, startMs: 0, durationMs: 160, easing: 'ease-in' as const, opacity: { from: 1, to: 0 } },
            { participant: 'body', side: 'incoming' as const, anchor: 'timeline' as const, startMs: 360, durationMs: 400, easing: 'ease-out' as const, opacity: { from: 0, to: 1 }, slide: { dx: 0, dy: 24 } }
          ])
    ]
  });
}

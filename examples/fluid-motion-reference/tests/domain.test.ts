/** Pure domain, routing and plan-construction tests (Node, no Svelte compiler needed). */
import { describe, expect, it } from 'vitest';
import { Effect } from '@composable-svelte/core';
import {
  appRouting, createInitialAppState, rootReducer, homeReducer, normalizeURL, pageFor, studyReducer, visibleWorks,
  type HomePageState
} from '../src/model.js';
import { movesAfterEnd } from './support/timeline.js';
import { cardKey, closeStudy, featureWork, filterCatalog, fromDossier, openStudy, reconfigure, toDossier } from '../src/motion.js';

const home: HomePageState = { category: 'all', featured: 'pavilion', layout: 'gallery', applause: 42 };

describe('domain', () => {
  it('normalizes unknown URLs to the catalogue and builds the matching page', () => {
    expect(normalizeURL('/nowhere?x=1')).toBe('/');
    const dossier = createInitialAppState('/dossier#facts');
    expect(dossier).toMatchObject({ url: '/dossier', page: pageFor('/dossier'), reducedMotion: false });
    expect(dossier.scene?.sceneId).toBe('pavilion-model');
    expect(pageFor('/dossier', true)).toMatchObject({ type: 'detail', state: { airflow: 'paused' } });
    expect(createInitialAppState('/study').page?.type).toBe('study');
  });

  it('filtering and featuring really change the grid order', () => {
    expect(visibleWorks(home).map(work => work.id)).toEqual(['pavilion', 'lattice', 'origami', 'cloud']);
    const [kinetic] = homeReducer(home, { type: 'setCategory', category: 'kinetic' }, {});
    expect(visibleWorks(kinetic).map(work => work.id)).toEqual(['lattice', 'origami']);
    const [featured, effect] = homeReducer(home, { type: 'feature', id: 'cloud' }, {});
    expect(visibleWorks(featured).map(work => work.id)).toEqual(['cloud', 'pavilion', 'lattice', 'origami']);
    expect(effect).toEqual(Effect.none());
  });

  it('study notes become unsaved when edited again', () => {
    const study = pageFor('/study');
    if (study.type !== 'study') throw new Error('study page');
    const [saved] = studyReducer({ ...study.state, notes: 'a' }, { type: 'save' }, {});
    expect(studyReducer(saved, { type: 'editNotes', notes: 'ab' }, {})[0].saved).toBe(false);
  });

  it('staged commits map intents to one navigate action with the expected URL', () => {
    expect(appRouting.staging!.commit({ to: '/study' })).toEqual({ action: { type: 'navigate', url: '/study' }, expectedURL: '/study' });
    expect(appRouting.request('/bogus')).toEqual({ action: { type: 'navigate', url: '/' }, expectedURL: '/' });
  });
});

describe('plans (public defineChoreography)', () => {
  it('route commit lands mid-flight and incoming text overlaps the shared movement', () => {
    const plan = toDossier(false);
    const hero = plan.tracks.find(track => track.participant === 'hero')!;
    const intro = plan.tracks.find(track => track.participant === 'intro')!;
    expect(plan.cueMs).toBeGreaterThan(0);
    expect(plan.cueMs).toBeLessThan(hero.startMs + hero.durationMs);
    expect(intro.anchor).toBe('timeline');
    expect(intro.startMs).toBeLessThan(hero.startMs + hero.durationMs);
    expect(plan.diagnostics).toEqual([]);
  });

  it('card plans pass through a viewport-relative half-page pose', () => {
    for (const plan of [openStudy('pavilion', false), closeStudy('pavilion', false), featureWork('cloud')]) {
      const card = plan.tracks.find(track => track.side === 'shared' && track.path)!;
      expect(card.path![0]!.pose.relativeTo).toBe('viewport');
    }
    expect(featureWork('cloud').tracks[0]!.participant).toBe(cardKey('cloud'));
  });

  it('whole-layout reconfiguration has several independently timed tracks', () => {
    for (const plan of [reconfigure(true), reconfigure(false)]) {
      const timings = new Set(plan.tracks.map(track => `${track.startMs}/${track.durationMs}`));
      expect(timings.size).toBe(plan.tracks.length);
      expect(plan.tracks.filter(track => track.side === 'shared').length).toBe(3);
    }
    expect(filterCatalog().tracks).toHaveLength(4);
  });

  it('reduced route plans contain no geometry tracks', () => {
    for (const plan of [toDossier(true), fromDossier(true), openStudy('pavilion', true), closeStudy('pavilion', true)]) {
      expect(plan.tracks.every(track => track.side !== 'shared')).toBe(true);
      expect(plan.durationMs).toBeLessThanOrEqual(160);
    }
  });
});

describe('dynamic reduced-motion preference', () => {
  it('pauses an already playing dossier loop in state, and leaves other pages alone', () => {
    const dossier = createInitialAppState('/dossier');
    const [reduced] = rootReducer(dossier, { type: 'setReducedMotion', enabled: true }, {});
    expect(reduced.page).toMatchObject({ type: 'detail', state: { airflow: 'paused' } });
    const home = createInitialAppState('/');
    expect(rootReducer(home, { type: 'setReducedMotion', enabled: true }, {})[0].page).toBe(home.page);
    // Turning the preference off does not restart the loop by itself.
    expect(rootReducer(reduced, { type: 'setReducedMotion', enabled: false }, {})[0].page).toMatchObject({ state: { airflow: 'paused' } });
  });
});

describe('ordered-endings predicate (negative controls for scenario 3)', () => {
  const frame = (time: number, moved: Record<string, boolean>) => [time, moved] as const;
  it('rejects rest before B started and endings on the same frame', () => {
    // A rests before it starts while B moves (the reviewer's pre-start case), then both end on the same frame.
    const together = [frame(0, { a: false, b: true }), frame(16, { a: false, b: true }), frame(32, { a: true, b: true }), frame(48, { a: true, b: true }), frame(64, { a: false, b: false })];
    expect(movesAfterEnd(together, 'a', 'b')).toEqual([]);
    // A never moves at all.
    expect(movesAfterEnd([frame(0, { a: false, b: true }), frame(16, { a: false, b: true })], 'a', 'b')).toEqual([]);
  });
  it('accepts B still moving strictly after A last moved', () => {
    const ordered = [frame(0, { a: true, b: true }), frame(16, { a: true, b: true }), frame(32, { a: false, b: true }), frame(48, { a: false, b: false })];
    expect(movesAfterEnd(ordered, 'a', 'b')).toEqual([32]);
  });
});

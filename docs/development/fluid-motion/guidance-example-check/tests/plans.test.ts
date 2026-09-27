import { describe, expect, it } from 'vitest';
import { defineChoreography, fluidMotion } from '@composable-svelte/core/application/motion';
import { closeDetail, filterCatalog, openDetail } from '../src/motion.js';

describe('documented plan rules', () => {
  it('the example plans validate without diagnostics', () => {
    for (const plan of [openDetail('pavilion'), closeDetail('pavilion'), filterCatalog([]), filterCatalog(['harbour'])]) expect(plan.diagnostics).toEqual([]);
    expect(openDetail('pavilion').tracks.find(track => track.side === 'incoming')?.slide).toEqual({ dx: 0, dy: 24 });
  });
  it('slide is incoming-only, finite and within ±4096px', () => {
    const track = { participant: 'p', startMs: 0, durationMs: 100 } as const;
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'shared', slide: { dy: 24 } }] })).toThrow(/Only incoming/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'outgoing', slide: { dy: 24 } }] })).toThrow(/Only incoming/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'incoming', slide: { dy: 5000 } }] })).toThrow(/4096/);
  });
  it('plans need a track and a keyword easing', () => {
    expect(() => defineChoreography({ cueMs: 0, durationMs: 0, tracks: [] })).toThrow(/at least one track/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ participant: 'p', side: 'incoming', startMs: 0, durationMs: 100, easing: 'cubic-bezier(0,0,1,1)' as never }] })).toThrow(/easing/);
  });
});

describe('documented visual configuration rules', () => {
  const provider = { name: 'custom', represent: () => undefined };
  it('the example configurations are accepted', async () => {
    const { visual, embedVisual } = await import('../src/visual.js');
    expect(visual.providers.map(entry => entry.name)).toEqual(['pulse']);
    expect(visual.preparationBudgetMs).toBe(250);
    expect(visual.nativeSnapshot).toBe('off');
    expect(embedVisual.nativeSnapshot).toBe('namedParticipants');
    expect(fluidMotion().preparationBudgetMs).toBe(600);
  });
  it('provider names are lowercase and unique; budgets are finite, 16–5000 ms', () => {
    expect(() => fluidMotion({ providers: [{ ...provider, name: 'Custom' }] })).toThrow(/lowercase/);
    expect(() => fluidMotion({ providers: [provider, provider] })).toThrow(/Duplicate/);
    expect(() => fluidMotion({ preparationBudgetMs: 10 })).toThrow(/16–5000/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, preparationBudgetMs: 6000, tracks: [{ participant: 'p', side: 'incoming', startMs: 0, durationMs: 100 }] })).toThrow(/16–5000/);
    expect(defineChoreography({ cueMs: 0, durationMs: 100, preparationBudgetMs: 400, tracks: [{ participant: 'p', side: 'incoming', startMs: 0, durationMs: 100 }] }).preparationBudgetMs).toBe(400);
  });
});

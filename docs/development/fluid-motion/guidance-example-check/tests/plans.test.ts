import { describe, expect, it } from 'vitest';
import { defineChoreography, fluidMotion, type OverlayScopeRef } from '@composable-svelte/core/application/motion';
import { closeDetail, filterCatalog, notesClose, notesOpen, notesQuickClose, openDetail } from '../src/motion.js';

describe('documented plan rules', () => {
  it('the example plans validate without diagnostics', () => {
    for (const plan of [openDetail('pavilion'), closeDetail('pavilion'), filterCatalog([]), filterCatalog(['harbour'])]) expect(plan.diagnostics).toEqual([]);
    expect(openDetail('pavilion').tracks.find(track => track.side === 'incoming')?.slide).toEqual({ dx: 0, dy: 24 });
  });
  it('slide and scale are for incoming and outgoing tracks; slide is finite and within ±4096px', () => {
    const track = { participant: 'p', startMs: 0, durationMs: 100 } as const;
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'shared', slide: { dy: 24 } }] })).toThrow(/slide/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'shared', scale: { from: 1, to: 0.9 } }] })).toThrow(/scale/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'incoming', slide: { dy: 5000 } }] })).toThrow(/4096/);
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'outgoing', scale: { from: 1, to: -1 } }] })).toThrow(/scale/);
    const outgoing = defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'outgoing', slide: { dy: 24 }, scale: { from: 1, to: 0.96 } }] });
    expect(outgoing.tracks[0]?.slide).toEqual({ dy: 24 });
    // An incoming scale that does not end at 1 is released at settlement (reported).
    const released = defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, side: 'incoming', scale: { from: 0.9, to: 1.1 } }] });
    expect((released.diagnostics ?? []).some(entry => entry.startsWith('scaleReleasedAtSettle'))).toBe(true);
  });
  it('plans need a track; easing is a keyword, control points or a CSS cubic-bezier string', () => {
    const track = { participant: 'p', side: 'incoming', startMs: 0, durationMs: 100 } as const;
    expect(() => defineChoreography({ cueMs: 0, durationMs: 0, tracks: [] })).toThrow(/at least one track/);
    for (const easing of ['ease-out', { cubicBezier: [0.2, 0, 0, 1] }, 'cubic-bezier(0.34, 1.56, 0.64, 1)'] as const)
      expect(defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, easing }] }).diagnostics).toEqual([]);
    // x1/x2 outside [0, 1], non-finite values and unknown names throw.
    for (const easing of [{ cubicBezier: [1.2, 0, 0, 1] }, 'cubic-bezier(0, NaN, 1, 1)', 'bounce'] as const)
      expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ ...track, easing: easing as never }] })).toThrow();
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

describe('documented overlay plans', () => {
  // Plans receive the overlay reference from useOverlayMotion. Validation only checks the selector's shape; the
  // engine verifies the reference itself when the plan runs. This stand-in is for plan validation only.
  const overlay = { select(key: string) { return { key, scope: overlay }; } } as unknown as OverlayScopeRef;
  it('the notes dialog plans validate', () => {
    for (const plan of [notesOpen(overlay, 'pavilion'), notesClose(overlay, 'pavilion'), notesQuickClose(overlay)]) expect(plan.tracks.length).toBeGreaterThan(0);
    const heading = notesOpen(overlay, 'pavilion').tracks.find(track => track.side === 'shared');
    expect(heading?.from).toBe('item-pavilion');
    expect(heading?.to).toEqual({ key: 'notes-title', scope: overlay });
  });
  it('from and to are for shared tracks only', () => {
    expect(() => defineChoreography({ cueMs: 0, durationMs: 100, tracks: [{ participant: 'p', side: 'incoming', startMs: 0, durationMs: 100, from: 'q' } as never] })).toThrow();
  });
});

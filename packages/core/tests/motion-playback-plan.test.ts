import { it, expect, vi } from 'vitest';
import * as compiler from '../src/lib/application/motion/compiler';
import { defineMotionRecipe, stableProjection, serializeStableStyle } from '../src/lib/application/motion/compiler';
import { planPlayback, planMotionPlayback } from '../src/lib/application/motion/playback-plan';

const baseDefinition = {
  targets: {
    panel: { properties: ['opacity', 'width'] },
    label: { properties: ['opacity'], optional: true }
  },
  states: {
    closed: { panel: { opacity: 0, width: 0 }, label: { opacity: 0 } },
    open: { panel: { opacity: 1, width: 100 }, label: { opacity: 1 } }
  },
  graph: {
    kind: 'sequence',
    steps: [
      { kind: 'track', target: 'panel', properties: ['opacity'], durationMs: 20 },
      { kind: 'track', target: 'label', properties: ['opacity'], durationMs: 30 }
    ]
  },
  interruption: 'replace'
} as const;

it('omitted availability produces a frozen full publishable set with exact stable references (P1)', () => {
  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipe, { from: 'A', to: 'B' });
  expect(Object.keys(decision.publishable).sort()).toEqual(['badge', 'box']);
  expect(Object.getPrototypeOf(decision.publishable)).toBeNull();
  expect(Object.isFrozen(decision.publishable)).toBe(true);

  expect(decision.publishable.box).toBe(decision.stable.box);
  expect(decision.publishable.badge).toBe(decision.stable.badge);
  expect(Object.isFrozen(decision.publishable.box)).toBe(true);
  expect(Object.isFrozen(decision.publishable.badge)).toBe(true);
});

it('supplied availability produces exact subset while stable and SSR remain full (P2, P5)', () => {
  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipe, { from: 'A', to: 'B', availableTargets: ['box'] });
  expect(Object.keys(decision.publishable)).toEqual(['box']);
  expect(Object.keys(decision.stable).sort()).toEqual(['badge', 'box']);
  expect(decision.publishable.box).toBe(decision.stable.box);

  // SSR control: pure destination projection remains complete
  expect(Object.hasOwn(decision.stable, 'badge')).toBe(true);
  expect(Object.hasOwn(decision.publishable, 'badge')).toBe(false);
  expect(stableProjection(recipe, 'B').badge).toEqual({ opacity: '0.5' });
  expect(serializeStableStyle(recipe, 'B', 'badge')).toBe('opacity:0.5');
});

it('play and each representative stable-only class share the supplied subset (P2 table-driven)', () => {
  const twoTargetDef = {
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  } as const;

  const playRecipe = defineMotionRecipe(twoTargetDef);

  const missingReqRecipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'] },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const allOptRecipe = defineMotionRecipe({
    targets: {
      frame: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { frame: { opacity: 0 }, badge: { opacity: 0 } },
      B: { frame: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'badge', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const zeroDurationRecipe = defineMotionRecipe({
    ...twoTargetDef,
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 0 },
  });

  const emptyTracksRecipe = defineMotionRecipe({
    ...twoTargetDef,
    graph: { kind: 'sequence', steps: [] },
  });

  const cases = [
    {
      name: 'play',
      decision: planPlayback(playRecipe, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedKind: 'play',
      expectedReason: undefined,
      expectedPublishable: ['box'],
    },
    {
      name: 'missing-required',
      decision: planPlayback(missingReqRecipe, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedKind: 'stable-only',
      expectedReason: 'missing-required',
      expectedPublishable: ['box'],
    },
    {
      name: 'all-optional-skipped',
      decision: planPlayback(allOptRecipe, { from: 'A', to: 'B', availableTargets: ['frame'] }),
      expectedKind: 'stable-only',
      expectedReason: 'all-optional-skipped',
      expectedPublishable: ['frame'],
    },
    {
      name: 'disabled',
      decision: planPlayback(playRecipe, { from: 'A', to: 'B', availableTargets: ['box'], instance: { disabled: true } }),
      expectedKind: 'stable-only',
      expectedReason: 'disabled',
      expectedPublishable: ['box'],
    },
    {
      name: 'reduced',
      decision: planPlayback(playRecipe, { from: 'A', to: 'B', availableTargets: ['box'], reducedMotion: true }),
      expectedKind: 'stable-only',
      expectedReason: 'reduced',
      expectedPublishable: ['box'],
    },
    {
      name: 'zero-duration',
      decision: planPlayback(zeroDurationRecipe, { from: 'A', to: 'B', availableTargets: ['box'] }),
      expectedKind: 'stable-only',
      expectedReason: 'zero-duration',
      expectedPublishable: ['box'],
    },
    {
      name: 'empty-tracks',
      decision: planPlayback(emptyTracksRecipe, { from: 'A', to: 'B', availableTargets: ['box', 'badge'] }),
      expectedKind: 'stable-only',
      expectedReason: 'empty-tracks',
      expectedPublishable: ['box', 'badge'],
    },
  ];

  for (const c of cases) {
    expect(c.decision.kind, `${c.name} kind`).toBe(c.expectedKind);
    if (c.decision.kind === 'stable-only') {
      expect(c.decision.reason, `${c.name} reason`).toBe(c.expectedReason);
    }
    expect(Object.keys(c.decision.publishable), `${c.name} publishable keys`).toEqual(c.expectedPublishable);
    expect(Object.keys(c.decision.stable).length, `${c.name} full stable keys`).toBe(2);

    const missingOrSkipped = new Set<string>([
      ...(c.decision.compiled?.missingRequired ?? []),
      ...(c.decision.compiled?.skippedOptional ?? []),
    ]);
    const targets = Object.keys(c.decision.stable);
    const expectedFromFormula = targets.filter((t) => !missingOrSkipped.has(t));
    expect(Object.keys(c.decision.publishable).sort(), `${c.name} invariant keys`).toEqual(expectedFromFormula.sort());
  }
});

it('compile-rejected with invalid from retains supplied subset (P3)', () => {
  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipe, {
    from: 'invalidFrom' as any,
    to: 'B',
    availableTargets: ['box'],
  });

  expect(decision.kind).toBe('stable-only');
  if (decision.kind === 'stable-only') {
    expect(decision.reason).toBe('compile-rejected');
    expect(decision.compiled).toBeUndefined();
    expect(decision.diagnostic).toBeDefined();
    expect(decision.diagnostic!.name).toBe('TypeError');
    expect(decision.diagnostic!.message).toContain('Unknown transition state');
    expect(Object.keys(decision.publishable)).toEqual(['box']);
    expect(Object.keys(decision.stable).sort()).toEqual(['badge', 'box']);
    expect(decision.publishable.box).toBe(decision.stable.box);
  }
});

it('unknown available name is excluded from publishable but remains a compile-rejected diagnostic (P4)', () => {
  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipe, {
    from: 'A',
    to: 'B',
    availableTargets: ['box', 'ghost'] as any,
  });

  expect(decision.kind).toBe('stable-only');
  if (decision.kind === 'stable-only') {
    expect(decision.reason).toBe('compile-rejected');
    expect(decision.diagnostic).toBeDefined();
    expect(decision.diagnostic!.name).toBe('TypeError');
    expect(decision.diagnostic!.message).toContain('Unknown available target ghost');
    expect(Object.keys(decision.publishable)).toEqual(['box']);
    expect(Object.hasOwn(decision.publishable, 'ghost')).toBe(false);
    expect(Object.hasOwn(decision.stable, 'ghost')).toBe(false);
  }
});

it('malformed non-iterable availability preserves accepted full-subset compile-rejected behavior (P7)', () => {
  const recipe = defineMotionRecipe({
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      A: { box: { opacity: 0 }, badge: { opacity: 0 } },
      B: { box: { opacity: 1 }, badge: { opacity: 0.5 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 50 },
    interruption: 'replace',
  });

  const decision = planPlayback(recipe, {
    from: 'A',
    to: 'B',
    availableTargets: { invalid: true } as any,
  });

  expect(decision.kind).toBe('stable-only');
  if (decision.kind === 'stable-only') {
    expect(decision.reason).toBe('compile-rejected');
    expect(decision.diagnostic).toBeDefined();
    expect(decision.diagnostic!.name).toBe('TypeError');
    expect(decision.diagnostic!.message).toContain('iterable');
    expect(Object.keys(decision.publishable).sort()).toEqual(['badge', 'box']);
    expect(decision.publishable.box).toBe(decision.stable.box);
    expect(decision.publishable.badge).toBe(decision.stable.badge);
  }
});

it('valid same-property parallel with delayed nonoverlap under defaults becomes compile-rejected when runtime duration expands', () => {
  const recipe = defineMotionRecipe({
    targets: {
      panel: { properties: ['opacity'] }
    },
    states: {
      closed: { panel: { opacity: 0 } },
      open: { panel: { opacity: 1 } }
    },
    graph: {
      kind: 'parallel',
      steps: [
        { kind: 'track', target: 'panel', properties: ['opacity'] }, // default tokens: durationMs 180
        { kind: 'track', target: 'panel', properties: ['opacity'], delayMs: 200, durationMs: 100 } // starts at 200, ends at 300
      ]
    },
    interruption: 'replace'
  });

  const defaultPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
  expect(defaultPlan.kind).toBe('play');
  if (defaultPlan.kind === 'play') {
    expect(defaultPlan.compiled.tracks).toHaveLength(2);
    expect(defaultPlan.compiled.durationMs).toBe(300);
    expect(defaultPlan.stable.panel.opacity).toBe('1');
  }

  const expandedPlan = planPlayback(recipe, {
    from: 'closed',
    to: 'open',
    instance: { durationMs: 500 }
  });
  expect(expandedPlan.kind).toBe('stable-only');
  if (expandedPlan.kind === 'stable-only') {
    expect(expandedPlan.reason).toBe('compile-rejected');
    expect(expandedPlan.diagnostic?.name).toBe('TypeError');
    expect(expandedPlan.diagnostic?.message).toContain('Overlapping motion property tracks');
    expect(expandedPlan.error?.name).toBe('TypeError');
    expect(expandedPlan.error?.message).toContain('Overlapping motion property tracks');
    expect(expandedPlan.stable).toEqual(stableProjection(recipe, 'open'));
    expect(expandedPlan.compiled).toBeUndefined();
  }
});

it('overflow override yields compile-rejected stable-only fallback with RangeError diagnostic', () => {
  const recipe = defineMotionRecipe({
    targets: {
      panel: { properties: ['opacity'] }
    },
    states: {
      closed: { panel: { opacity: 0 } },
      open: { panel: { opacity: 1 } }
    },
    graph: {
      kind: 'sequence',
      steps: [
        { kind: 'track', target: 'panel', properties: ['opacity'] },
        { kind: 'track', target: 'panel', properties: ['opacity'] }
      ]
    },
    interruption: 'replace'
  });

  const plan = planPlayback(recipe, {
    from: 'closed',
    to: 'open',
    instance: { durationMs: 2_000_000_000 }
  });
  expect(plan.kind).toBe('stable-only');
  if (plan.kind === 'stable-only') {
    expect(plan.reason).toBe('compile-rejected');
    expect(plan.diagnostic?.name).toBe('RangeError');
    expect(plan.diagnostic?.message).toContain('timer range');
    expect(plan.stable).toEqual(stableProjection(recipe, 'open'));
  }
});

it('classifies reduced, disabled, missing-required, all-optional-skipped and zero duration explicitly', () => {
  const recipe = defineMotionRecipe(baseDefinition);

  const reducedPlan = planPlayback(recipe, { from: 'closed', to: 'open', reducedMotion: true });
  expect(reducedPlan.kind).toBe('stable-only');
  if (reducedPlan.kind === 'stable-only') {
    expect(reducedPlan.reason).toBe('reduced');
    expect(reducedPlan.compiled?.durationMs).toBe(0);
    expect(reducedPlan.stable.panel.opacity).toBe('1');
  }

  const disabledPlan = planPlayback(recipe, { from: 'closed', to: 'open', instance: { disabled: true } });
  expect(disabledPlan.kind).toBe('stable-only');
  if (disabledPlan.kind === 'stable-only') {
    expect(disabledPlan.reason).toBe('disabled');
    expect(disabledPlan.compiled?.durationMs).toBe(0);
  }

  const missingPlan = planPlayback(recipe, { from: 'closed', to: 'open', availableTargets: ['label'] });
  expect(missingPlan.kind).toBe('stable-only');
  if (missingPlan.kind === 'stable-only') {
    expect(missingPlan.reason).toBe('missing-required');
    expect(missingPlan.compiled?.missingRequired).toEqual(['panel']);
  }

  const optRecipe = defineMotionRecipe({
    targets: { label: { properties: ['opacity'], optional: true } },
    states: { closed: { label: { opacity: 0 } }, open: { label: { opacity: 1 } } },
    graph: { kind: 'track', target: 'label', properties: ['opacity'], durationMs: 40 },
    interruption: 'replace'
  });
  const allOptPlan = planPlayback(optRecipe, { from: 'closed', to: 'open', availableTargets: [] });
  expect(allOptPlan.kind).toBe('stable-only');
  if (allOptPlan.kind === 'stable-only') {
    expect(allOptPlan.reason).toBe('all-optional-skipped');
    expect(allOptPlan.compiled?.tracks).toHaveLength(0);
    expect(allOptPlan.compiled?.durationMs).toBe(0);
  }

  const zeroRecipe = defineMotionRecipe({
    targets: { panel: { properties: ['opacity'] } },
    states: { closed: { panel: { opacity: 0 } }, open: { panel: { opacity: 1 } } },
    graph: { kind: 'track', target: 'panel', properties: ['opacity'], durationMs: 0 },
    interruption: 'replace'
  });
  const zeroPlan = planPlayback(zeroRecipe, { from: 'closed', to: 'open' });
  expect(zeroPlan.kind).toBe('stable-only');
  if (zeroPlan.kind === 'stable-only') {
    expect(zeroPlan.reason).toBe('zero-duration');
    expect(zeroPlan.compiled?.durationMs).toBe(0);
    expect(zeroPlan.compiled?.tracks).toHaveLength(1);
  }
});

it('reduced motion plus invalid overlap still produces diagnostic compile rejection', () => {
  const parallelRecipe = defineMotionRecipe({
    targets: { panel: { properties: ['opacity'] } },
    states: { closed: { panel: { opacity: 0 } }, open: { panel: { opacity: 1 } } },
    graph: {
      kind: 'parallel',
      steps: [
        { kind: 'track', target: 'panel', properties: ['opacity'] },
        { kind: 'track', target: 'panel', properties: ['opacity'], delayMs: 200, durationMs: 100 }
      ]
    },
    interruption: 'replace'
  });

  const plan = planPlayback(parallelRecipe, {
    from: 'closed',
    to: 'open',
    instance: { durationMs: 500 },
    reducedMotion: true
  });
  expect(plan.kind).toBe('stable-only');
  if (plan.kind === 'stable-only') {
    expect(plan.reason).toBe('compile-rejected');
    expect(plan.diagnostic?.name).toBe('TypeError');
    expect(plan.diagnostic?.message).toContain('Overlapping motion property tracks');
    expect(plan.stable).toEqual(stableProjection(parallelRecipe, 'open'));
  }
});

it('unknown destination throws immediately as programmer error outside catch', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  expect(() => planPlayback(recipe, { from: 'closed', to: 'unknown' as any })).toThrow('Unknown motion state unknown');
});

it('rejects hostile accessors without invocation and isolates request snapshot', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  const getterSpy = vi.fn(() => 'open');
  const hostileRequest = {
    from: 'closed',
    get to() { return getterSpy(); }
  };
  expect(() => planPlayback(recipe, hostileRequest as any)).toThrow('Motion data cannot contain accessors');
  expect(getterSpy).not.toHaveBeenCalled();

  const mutableRequest = { from: 'closed' as const, to: 'open' as const, instance: { durationMs: 25 } };
  const plan = planMotionPlayback(recipe, mutableRequest);
  mutableRequest.instance.durationMs = 999;
  expect(plan.kind).toBe('play');
  if (plan.kind === 'play') {
    expect(plan.compiled.tokens.durationMs).toBe(25);
  }
  expect(Object.isFrozen(plan)).toBe(true);
});

it('keeps valid disjoint parallel and native=false tracks intact in play decision', () => {
  const customRecipe = defineMotionRecipe({
    numericProperties: { '--progress': { unit: 'number', interpolation: 'number' } },
    targets: { bar: { properties: ['opacity', '--progress'] } },
    states: {
      closed: { bar: { opacity: 0, '--progress': 0 } },
      open: { bar: { opacity: 1, '--progress': 100 } }
    },
    graph: {
      kind: 'parallel',
      steps: [
        { kind: 'track', target: 'bar', properties: ['opacity'], durationMs: 40 },
        { kind: 'track', target: 'bar', properties: ['--progress'], durationMs: 50 }
      ]
    },
    interruption: 'replace'
  });

  const plan = planPlayback(customRecipe, { from: 'closed', to: 'open' });
  expect(plan.kind).toBe('play');
  if (plan.kind === 'play') {
    expect(plan.compiled.tracks).toHaveLength(2);
    const progressProp = plan.compiled.tracks[1]!.properties[0]!;
    expect(progressProp.property).toBe('--progress');
    expect(progressProp.interpolation.native).toBe(false);
    expect(progressProp.interpolation.ticker).toBe(true);
  }
});

it('rejects unsupported keys on playback request at runtime', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  expect(() => planPlayback(recipe, { from: 'closed', to: 'open', unsupportedKey: true } as any)).toThrow(
    'playback request: unsupported option unsupportedKey'
  );
});

it('classifies empty composition steps as empty-tracks reason', () => {
  const emptyRecipe = defineMotionRecipe({
    targets: { panel: { properties: ['opacity'] } },
    states: { closed: { panel: { opacity: 0 } }, open: { panel: { opacity: 1 } } },
    graph: { kind: 'sequence', steps: [] },
    interruption: 'replace'
  });
  const plan = planPlayback(emptyRecipe, { from: 'closed', to: 'open' });
  expect(plan.kind).toBe('stable-only');
  if (plan.kind === 'stable-only') {
    expect(plan.reason).toBe('empty-tracks');
    expect(plan.compiled?.tracks).toHaveLength(0);
    expect(plan.compiled?.durationMs).toBe(0);
    expect(plan.compiled?.skippedOptional).toHaveLength(0);
  }
});

it('invalid from with valid to produces compile-rejected stable-only fallback, preserving destination stable state', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  const plan = planPlayback(recipe, { from: 'invalid' as any, to: 'open' });
  expect(plan.kind).toBe('stable-only');
  if (plan.kind === 'stable-only') {
    expect(plan.reason).toBe('compile-rejected');
    expect(plan.diagnostic?.name).toBe('TypeError');
    expect(plan.diagnostic?.message).toContain('Unknown transition state');
    expect(plan.stable).toEqual(stableProjection(recipe, 'open'));
    expect(plan.compiled).toBeUndefined();
  }
});

it('delayed zero-duration tracks classify as play (scheduled instant pose) rather than blindly stable-only', () => {
  const delayedZeroRecipe = defineMotionRecipe({
    targets: { panel: { properties: ['opacity'] } },
    states: { closed: { panel: { opacity: 0 } }, open: { panel: { opacity: 1 } } },
    graph: { kind: 'track', target: 'panel', properties: ['opacity'], delayMs: 50, durationMs: 0 },
    interruption: 'replace'
  });
  const plan = planPlayback(delayedZeroRecipe, { from: 'closed', to: 'open' });
  expect(plan.kind).toBe('play');
  if (plan.kind === 'play') {
    expect(plan.compiled.durationMs).toBe(50);
    expect(plan.compiled.tracks).toHaveLength(1);
    expect(plan.compiled.tracks[0]?.startMs).toBe(50);
    expect(plan.compiled.tracks[0]?.durationMs).toBe(0);
    expect(plan.stable.panel.opacity).toBe('1');
  }
});

it('bounds diagnostics to 128 name and 1024 message, deeply freezes diagnostic, and safely handles hostile/non-object throws', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  const spy = vi.spyOn(compiler, 'compileMotion');

  try {
    const oversizedError = new Error('M'.repeat(2000));
    oversizedError.name = 'N'.repeat(200);
    spy.mockImplementationOnce(() => { throw oversizedError; });

    const boundedPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(boundedPlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (boundedPlan.kind === 'stable-only' && boundedPlan.reason === 'compile-rejected') {
      expect(boundedPlan.reason).toBe('compile-rejected');
      expect(boundedPlan.diagnostic.name).toHaveLength(128);
      expect(boundedPlan.diagnostic.name).toBe('N'.repeat(128));
      expect(boundedPlan.diagnostic.message).toHaveLength(1024);
      expect(boundedPlan.diagnostic.message).toBe('M'.repeat(1024));
      expect(Object.isFrozen(boundedPlan.diagnostic)).toBe(true);
      expect(Object.isFrozen(boundedPlan.error)).toBe(true);
      expect(boundedPlan.diagnostic).toBe(boundedPlan.error);
    }

    spy.mockImplementationOnce(() => { throw 42; });
    const numberPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(numberPlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (numberPlan.kind === 'stable-only' && numberPlan.reason === 'compile-rejected') {
      expect(numberPlan.diagnostic.name).toBe('Error');
      expect(numberPlan.diagnostic.message).toBe('Motion compilation rejected');
      expect(Object.isFrozen(numberPlan.diagnostic)).toBe(true);
    }

    spy.mockImplementationOnce(() => { throw null; });
    const nullPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(nullPlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (nullPlan.kind === 'stable-only' && nullPlan.reason === 'compile-rejected') {
      expect(nullPlan.diagnostic.name).toBe('Error');
      expect(nullPlan.diagnostic.message).toBe('Motion compilation rejected');
    }

    spy.mockImplementationOnce(() => { throw 'S'.repeat(1500); });
    const stringPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(stringPlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (stringPlan.kind === 'stable-only' && stringPlan.reason === 'compile-rejected') {
      expect(stringPlan.diagnostic.name).toBe('Error');
      expect(stringPlan.diagnostic.message).toHaveLength(1024);
      expect(stringPlan.diagnostic.message).toBe('S'.repeat(1024));
    }

    const hostileError = {
      get name(): string { throw new Error('trap name accessor'); },
      get message(): string { throw new Error('trap message accessor'); }
    };
    spy.mockImplementationOnce(() => { throw hostileError; });
    const hostilePlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(hostilePlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (hostilePlan.kind === 'stable-only' && hostilePlan.reason === 'compile-rejected') {
      expect(hostilePlan.diagnostic.name).toBe('Error');
      expect(hostilePlan.diagnostic.message).toBe('Motion compilation rejected');
      expect(hostilePlan.stable).toEqual(stableProjection(recipe, 'open'));
    }

    const throwingToStringError = {
      toString(): string { throw new Error('trap toString'); }
    };
    spy.mockImplementationOnce(() => { throw throwingToStringError; });
    const hostileToStringPlan = planPlayback(recipe, { from: 'closed', to: 'open' });
    expect(hostileToStringPlan).toMatchObject({kind: 'stable-only', reason: 'compile-rejected'});
    if (hostileToStringPlan.kind === 'stable-only' && hostileToStringPlan.reason === 'compile-rejected') {
      expect(hostileToStringPlan.diagnostic.name).toBe('Error');
      expect(hostileToStringPlan.diagnostic.message).toBe('Motion compilation rejected');
      expect(hostileToStringPlan.stable).toEqual(stableProjection(recipe, 'open'));
    }
    expect(spy).toHaveBeenCalledTimes(6);
  } finally {
    spy.mockRestore();
  }
});

 it('missing required target classification precedes disabled and reduced motion', () => {
  const recipe = defineMotionRecipe(baseDefinition);
  for (const policy of [{instance: {disabled: true}}, {reducedMotion: true}]) {
    const decision = planPlayback(recipe, {from: 'closed', to: 'open', availableTargets: ['label'], ...policy});
    expect(decision).toMatchObject({kind: 'stable-only', reason: 'missing-required'});
    expect(decision.stable).toEqual(stableProjection(recipe, 'open'));
  }
});

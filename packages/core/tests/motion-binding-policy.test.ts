import { describe, it, expect } from 'vitest';
import { bindingPolicy } from '../src/lib/application/motion/binding-policy.js';
import {
  defineMotionRecipe,
  compileMotion,
  type MotionRecipe,
  type TargetSchema,
} from '../src/lib/application/motion/compiler.js';
import type { BindingPolicy as RegistryBindingPolicy } from '../src/lib/application/renderer/target-registry.js';

describe('motion-binding-policy', () => {
  const defaultRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity'] },
    },
    states: {
      a: { box: { opacity: 0 } },
      b: { box: { opacity: 1 } },
    },
    graph: {
      kind: 'track',
      target: 'box',
      properties: ['opacity'],
    },
  });

  const explicitRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity'] },
    },
    states: {
      a: { box: { opacity: 0 } },
      b: { box: { opacity: 1 } },
    },
    graph: {
      kind: 'track',
      target: 'box',
      properties: ['opacity'],
      channel: 'expressive',
      priority: 5,
    },
  });

  const sequenceRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
          channel: 'expressive',
          priority: 5,
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'expressive',
          priority: 5,
        },
      ],
    },
  });

  const parallelRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'parallel',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
          channel: 'expressive',
          priority: 5,
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'expressive',
          priority: 5,
        },
      ],
    },
  });

  const staggerRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'stagger',
      gapMs: 40,
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
          channel: 'expressive',
          priority: 5,
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'expressive',
          priority: 5,
        },
      ],
    },
  });

  const nestedCompositionRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'parallel',
          steps: [
            {
              kind: 'track',
              target: 'box',
              properties: ['opacity'],
              channel: 'nested-channel',
              priority: 4,
            },
            {
              kind: 'track',
              target: 'box',
              properties: ['transform'],
              channel: 'nested-channel',
              priority: 4,
            },
          ],
        },
        {
          kind: 'stagger',
          gapMs: 25,
          steps: [
            {
              kind: 'track',
              target: 'box',
              properties: ['opacity'],
              channel: 'nested-channel',
              priority: 4,
            },
          ],
        },
      ],
    },
  });

  const multiTargetRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity'], optional: true },
      badge: { properties: ['transform'], optional: true },
    },
    states: {
      a: { box: { opacity: 0 }, badge: { transform: 'none' } },
      b: { box: { opacity: 1 }, badge: { transform: 'scale(1)' } },
    },
    graph: {
      kind: 'parallel',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
        },
        {
          kind: 'track',
          target: 'badge',
          properties: ['transform'],
          channel: 'badge-channel',
          priority: 8,
        },
      ],
    },
  });

  const partialTrackRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity'] },
      badge: { properties: ['transform'], optional: true },
    },
    states: {
      a: { box: { opacity: 0 }, badge: { transform: 'none' } },
      b: { box: { opacity: 1 }, badge: { transform: 'scale(1)' } },
    },
    graph: {
      kind: 'track',
      target: 'box',
      properties: ['opacity'],
      channel: 'box-channel',
      priority: 3,
    },
  });

  const mixedDefaultExplicitChannelRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'expressive',
        },
      ],
    },
  });

  const mixedDefaultExplicitPriorityRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'default',
          priority: 5,
        },
      ],
    },
  });

  const twoExplicitChannelsRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
          channel: 'channel-one',
          priority: 2,
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'channel-two',
          priority: 2,
        },
      ],
    },
  });

  const twoExplicitPrioritiesRecipe = defineMotionRecipe({
    interruption: 'replace',
    targets: {
      box: { properties: ['opacity', 'transform'] },
    },
    states: {
      a: { box: { opacity: 0, transform: 'none' } },
      b: { box: { opacity: 1, transform: 'scale(1)' } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        {
          kind: 'track',
          target: 'box',
          properties: ['opacity'],
          channel: 'shared-channel',
          priority: 1,
        },
        {
          kind: 'track',
          target: 'box',
          properties: ['transform'],
          channel: 'shared-channel',
          priority: 3,
        },
      ],
    },
  });

  describe('default track policy', () => {
    it('returns compiler default channel and priority when omitted', () => {
      const policy = bindingPolicy(defaultRecipe, ['box']);
      const registryPolicy: RegistryBindingPolicy = policy;
      expect(policy).toEqual({ channel: 'default', priority: 0 });
      expect(registryPolicy).toBe(policy);
      expect(Object.isFrozen(policy)).toBe(true);
    });

    it('treats omitted and explicitly defaulted track fields as one normalized policy', () => {
      const recipe = defineMotionRecipe({
        interruption: 'replace',
        targets: { box: { properties: ['opacity', 'transform'] } },
        states: {
          a: { box: { opacity: 0, transform: 'none' } },
          b: { box: { opacity: 1, transform: 'scale(1)' } },
        },
        graph: {
          kind: 'parallel',
          steps: [
            { kind: 'track', target: 'box', properties: ['opacity'] },
            {
              kind: 'track',
              target: 'box',
              properties: ['transform'],
              channel: 'default',
              priority: 0,
            },
          ],
        },
      });

      const policy = bindingPolicy(recipe, ['box']);
      const compiled = compileMotion(recipe, {
        from: 'a',
        to: 'b',
        availableTargets: ['box'],
      });

      expect(policy).toEqual({ channel: 'default', priority: 0 });
      expect(compiled.tracks).toHaveLength(2);
      expect(compiled.tracks.every((track) => track.channel === policy.channel)).toBe(true);
      expect(compiled.tracks.every((track) => track.priority === policy.priority)).toBe(true);
    });

    it('ties the no-track default to the compiler-backed default-track policy', () => {
      expect(bindingPolicy(partialTrackRecipe, ['badge'])).toEqual(
        bindingPolicy(defaultRecipe, ['box']),
      );
    });
  });

  describe('explicit track policy and nested traversal', () => {
    it('returns explicit channel and priority for single track', () => {
      const policy = bindingPolicy(explicitRecipe, ['box']);
      expect(policy).toEqual({ channel: 'expressive', priority: 5 });
    });

    it('traverses nested sequence with identical explicit pairs', () => {
      const policy = bindingPolicy(sequenceRecipe, ['box']);
      expect(policy).toEqual({ channel: 'expressive', priority: 5 });
    });

    it('traverses nested parallel with identical explicit pairs', () => {
      const policy = bindingPolicy(parallelRecipe, ['box']);
      expect(policy).toEqual({ channel: 'expressive', priority: 5 });
    });

    it('traverses nested stagger with identical explicit pairs', () => {
      const policy = bindingPolicy(staggerRecipe, ['box']);
      expect(policy).toEqual({ channel: 'expressive', priority: 5 });
    });

    it('traverses deeply nested sequence/parallel/stagger compositions', () => {
      const policy = bindingPolicy(nestedCompositionRecipe, ['box']);
      expect(policy).toEqual({ channel: 'nested-channel', priority: 4 });
    });
  });

  describe('target selection and unselected targets', () => {
    it('ignores tracks on unselected targets', () => {
      const boxPolicy = bindingPolicy(multiTargetRecipe, ['box']);
      expect(boxPolicy).toEqual({ channel: 'default', priority: 0 });

      const badgePolicy = bindingPolicy(multiTargetRecipe, ['badge']);
      expect(badgePolicy).toEqual({ channel: 'badge-channel', priority: 8 });
    });

    it('returns default policy when selected target has no tracks in graph', () => {
      const policy = bindingPolicy(partialTrackRecipe, ['badge']);
      expect(policy).toEqual({ channel: 'default', priority: 0 });
    });

    it('returns the pure default when no target is selected; the lifecycle still skips empty bindings', () => {
      const policy = bindingPolicy(explicitRecipe, []);
      expect(policy).toEqual({ channel: 'default', priority: 0 });
    });

    it('does not let a selected target with no tracks replace the tracked target policy', () => {
      expect(bindingPolicy(partialTrackRecipe, ['box', 'badge'])).toEqual({
        channel: 'box-channel',
        priority: 3,
      });
    });

    it('accepts multiple selected targets when their tracks share one policy', () => {
      const recipe = defineMotionRecipe({
        interruption: 'replace',
        targets: {
          box: { properties: ['opacity'], optional: true },
          badge: { properties: ['transform'], optional: true },
        },
        states: {
          a: { box: { opacity: 0 }, badge: { transform: 'none' } },
          b: { box: { opacity: 1 }, badge: { transform: 'scale(1)' } },
        },
        graph: {
          kind: 'parallel',
          steps: [
            {
              kind: 'track',
              target: 'box',
              properties: ['opacity'],
              channel: 'shared',
              priority: 2,
            },
            {
              kind: 'track',
              target: 'badge',
              properties: ['transform'],
              channel: 'shared',
              priority: 2,
            },
          ],
        },
      });

      const policy = bindingPolicy(recipe, ['box', 'badge']);
      const compiled = compileMotion(recipe, {
        from: 'a',
        to: 'b',
        availableTargets: ['box', 'badge'],
      });

      expect(policy).toEqual({ channel: 'shared', priority: 2 });
      expect(compiled.tracks).toHaveLength(2);
      expect(compiled.tracks.every((track) => track.channel === policy.channel)).toBe(true);
      expect(compiled.tracks.every((track) => track.priority === policy.priority)).toBe(true);
    });

    it('keeps selected target names constrained to the declared schema', () => {
      if (false) {
        // @ts-expect-error an undeclared target must remain a compile-time error
        bindingPolicy(defaultRecipe, ['missing']);
      }
      expect(bindingPolicy(defaultRecipe, ['box'])).toEqual({ channel: 'default', priority: 0 });
    });
  });

  describe('rejection of conflicting policies', () => {
    it('rejects mixed default and explicit channel with TypeError', () => {
      expect(() => bindingPolicy(mixedDefaultExplicitChannelRecipe, ['box'])).toThrow(TypeError);
    });

    it('rejects mixed default and explicit priority with TypeError', () => {
      expect(() => bindingPolicy(mixedDefaultExplicitPriorityRecipe, ['box'])).toThrow(TypeError);
    });

    it('rejects two distinct explicit channels with TypeError', () => {
      expect(() => bindingPolicy(twoExplicitChannelsRecipe, ['box'])).toThrow(TypeError);
    });

    it('rejects two distinct explicit priorities with TypeError', () => {
      expect(() => bindingPolicy(twoExplicitPrioritiesRecipe, ['box'])).toThrow(TypeError);
    });

    it('rejects conflicting pairs when multiple targets are selected', () => {
      expect(() => bindingPolicy(multiTargetRecipe, ['box', 'badge'])).toThrow(TypeError);
    });

    it('does not select first, last, or maximum priority on conflict', () => {
      try {
        bindingPolicy(twoExplicitPrioritiesRecipe, ['box']);
        expect.fail('Should have thrown TypeError');
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toContain('Conflicting motion binding policies');
      }
    });

    it('compares channel names exactly without case folding or trimming', () => {
      function recipeWith(secondChannel: string) {
        return defineMotionRecipe({
          interruption: 'replace',
          targets: { box: { properties: ['opacity', 'transform'] } },
          states: {
            a: { box: { opacity: 0, transform: 'none' } },
            b: { box: { opacity: 1, transform: 'scale(1)' } },
          },
          graph: {
            kind: 'parallel',
            steps: [
              {
                kind: 'track',
                target: 'box',
                properties: ['opacity'],
                channel: 'expressive',
                priority: 5,
              },
              {
                kind: 'track',
                target: 'box',
                properties: ['transform'],
                channel: secondChannel,
                priority: 5,
              },
            ],
          },
        });
      }

      expect(() => bindingPolicy(recipeWith('Expressive'), ['box'])).toThrow(TypeError);
      expect(() => bindingPolicy(recipeWith('expressive '), ['box'])).toThrow(TypeError);
    });

    it('finds a policy conflict split across nested composition branches', () => {
      const recipe = defineMotionRecipe({
        interruption: 'replace',
        targets: { box: { properties: ['opacity', 'transform'] } },
        states: {
          a: { box: { opacity: 0, transform: 'none' } },
          b: { box: { opacity: 1, transform: 'scale(1)' } },
        },
        graph: {
          kind: 'sequence',
          steps: [
            {
              kind: 'parallel',
              steps: [
                {
                  kind: 'track',
                  target: 'box',
                  properties: ['opacity'],
                  channel: 'first',
                  priority: 4,
                },
              ],
            },
            {
              kind: 'stagger',
              gapMs: 10,
              steps: [
                {
                  kind: 'track',
                  target: 'box',
                  properties: ['transform'],
                  channel: 'second',
                  priority: 4,
                },
              ],
            },
          ],
        },
      });

      expect(() => bindingPolicy(recipe, ['box'])).toThrow(TypeError);
    });
  });

  describe('immutability and frozen output', () => {
    it('returns a frozen policy object across all paths', () => {
      const defaultPolicy = bindingPolicy(defaultRecipe, ['box']);
      expect(Object.isFrozen(defaultPolicy)).toBe(true);

      const explicitPolicy = bindingPolicy(explicitRecipe, ['box']);
      expect(Object.isFrozen(explicitPolicy)).toBe(true);

      const emptyPolicy = bindingPolicy(explicitRecipe, []);
      expect(Object.isFrozen(emptyPolicy)).toBe(true);

      const noTrackPolicy = bindingPolicy(partialTrackRecipe, ['badge']);
      expect(Object.isFrozen(noTrackPolicy)).toBe(true);
    });

    it('preserves input immutability for recipe and selectedTargets', () => {
      const targetsArray = Object.freeze(['box'] as const);
      const originalRecipeGraph = explicitRecipe.graph;

      bindingPolicy(explicitRecipe, targetsArray);

      expect(explicitRecipe.graph).toBe(originalRecipeGraph);
      expect(Array.from(targetsArray)).toEqual(['box']);
    });
  });

  describe('compileMotion parity table', () => {
    const table = [
      {
        name: 'default track',
        recipe: defaultRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'explicit track',
        recipe: explicitRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'nested sequence with explicit pairs',
        recipe: sequenceRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'nested parallel with explicit pairs',
        recipe: parallelRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'nested stagger with explicit pairs',
        recipe: staggerRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'deeply nested sequence/parallel/stagger',
        recipe: nestedCompositionRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'multi-target subset selecting box with default policy',
        recipe: multiTargetRecipe,
        selected: ['box'] as const,
      },
      {
        name: 'multi-target subset selecting badge with explicit policy',
        recipe: multiTargetRecipe,
        selected: ['badge'] as const,
      },
      {
        name: 'partial track recipe with active target selected',
        recipe: partialTrackRecipe,
        selected: ['box'] as const,
      },
    ];

    for (const { name, recipe, selected } of table) {
      it(`guarantees track channel and priority parity for: ${name}`, () => {
        // The table deliberately combines distinct concrete recipe schemas. Erase only
        // that table union; each recipe was naturally inferred and validated above.
        const broadRecipe = recipe as unknown as MotionRecipe<TargetSchema, 'a' | 'b'>;
        const selectedNames = selected as readonly string[];
        const policy = bindingPolicy(broadRecipe, selectedNames);
        const compiled = compileMotion(broadRecipe, {
          from: 'a',
          to: 'b',
          availableTargets: selectedNames,
        });

        const selectedSet = new Set<string>(selectedNames);
        const addressedTracks = compiled.tracks.filter((track) =>
          selectedSet.has(track.target),
        );

        expect(addressedTracks.length).toBeGreaterThan(0);
        for (const track of addressedTracks) {
          expect(track.channel).toBe(policy.channel);
          expect(track.priority).toBe(policy.priority);
        }
      });
    }
  });
});

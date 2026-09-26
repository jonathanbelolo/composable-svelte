<script module lang="ts">
  import { defineMotionRecipe } from '../../src/lib/application/motion-public.js';

  export const sequenceRecipe = defineMotionRecipe({
    targets: {
      first: { properties: ['opacity'] },
      second: { properties: ['opacity'] },
    },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 240 },
        { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 240 },
      ],
    },
    interruption: 'replace',
  });

  export const parallelRecipe = defineMotionRecipe({
    targets: {
      first: { properties: ['opacity'] },
      second: { properties: ['opacity'] },
    },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } },
    },
    graph: {
      kind: 'parallel',
      steps: [
        { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 240 },
        { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 240 },
      ],
    },
    interruption: 'replace',
  });

  export const staggerRecipe = defineMotionRecipe({
    targets: {
      first: { properties: ['opacity'] },
      second: { properties: ['opacity'] },
    },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } },
    },
    graph: {
      kind: 'stagger',
      gapMs: 100,
      steps: [
        { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 300 },
        { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 300 },
      ],
    },
    interruption: 'replace',
  });
</script>

<script lang="ts">
  import { useMotionGroup } from '../../src/lib/application/motion-public.js';

  let { mode = 'sequence' }: { mode?: 'sequence' | 'parallel' | 'stagger' } = $props();

  let motionState = $state<'off' | 'on'>('off');
  const motion = mode === 'sequence'
    ? useMotionGroup(sequenceRecipe, () => motionState)
    : mode === 'parallel'
      ? useMotionGroup(parallelRecipe, () => motionState)
      : useMotionGroup(staggerRecipe, () => motionState);

  function update() {
    motionState = motionState === 'off' ? 'on' : 'off';
  }
</script>

<button data-testid="update-motion" onclick={update}>update</button>
<div data-testid="target-first" style={motion.targets.first.style} use:motion.targets.first.attach>first</div>
<div data-testid="target-second" style={motion.targets.second.style} use:motion.targets.second.attach>second</div>

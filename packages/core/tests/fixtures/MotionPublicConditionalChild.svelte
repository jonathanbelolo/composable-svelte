<script lang="ts">
  import { useMotion, defineMotionRecipe } from '../../src/lib/application/motion-public.js';

  let present = $state(true);
  let motionState = $state<'off' | 'on'>('off');
  const recipe = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 120 },
    interruption: 'replace',
  });
  // One handle survives the conditional node's detach/reattach cycle.
  const motion = useMotion(recipe, () => motionState);
</script>

<button data-testid="detach-motion" onclick={() => present = false}>detach</button>
<button data-testid="reattach-motion" onclick={() => present = true}>reattach</button>
<button data-testid="update-motion" onclick={() => motionState = 'on'}>update</button>
{#if present}
  <div data-testid="conditional-motion" style={motion.style} use:motion.attach>motion</div>
{/if}

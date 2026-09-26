<script lang="ts">
  import { defineMotionRecipe, useMotionGroup } from '../../src/lib/application/motion-public.js';
  let { optional = false }: { optional?: boolean } = $props();
  const recipe = defineMotionRecipe({
    targets: { first: { properties: ['opacity'] }, second: { properties: ['opacity'], optional } },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } }
    },
    graph: { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 120 },
    interruption: 'replace'
  });
  let motionState = $state<'off' | 'on'>('off');
  let renderFirst = $state(true);
  let renderSecond = $state(true);
  const motion = useMotionGroup(recipe, () => motionState);
  function update() { motionState = motionState === 'off' ? 'on' : 'off'; }
  function removeBoth() { renderFirst = false; renderSecond = false; }
  function reattachBoth() { renderFirst = true; renderSecond = true; }
  function toggleSecond() { renderSecond = !renderSecond; }
</script>
<button data-testid="update-motion" onclick={update}>update</button>
<button data-testid="detach-both" onclick={removeBoth}>detach both</button>
<button data-testid="reattach-both" onclick={reattachBoth}>reattach both</button>
<button data-testid="toggle-second" onclick={toggleSecond}>toggle second</button>
{#if renderFirst}<div data-testid="target-first" style={motion.targets.first.style} use:motion.targets.first.attach>first</div>{/if}
{#if renderSecond}<div data-testid="target-second" style={motion.targets.second.style} use:motion.targets.second.attach>second</div>{/if}

<script lang="ts">
  import { defineMotionRecipe, useMotionGroup } from '../../src/lib/application/motion-public.js';

  let { initialDuplicate = false }: { initialDuplicate?: boolean } = $props();

  const recipe = defineMotionRecipe({
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
        { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 200 },
        { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 200 },
      ],
    },
    interruption: 'replace',
  });

  let motionState = $state<'off' | 'on'>('off');
  let firstVersion = $state(0);
  let duplicateSecond = $state(initialDuplicate);

  const motion = useMotionGroup(recipe, () => motionState);

  function update() {
    motionState = motionState === 'off' ? 'on' : 'off';
  }

  function replaceFirst() {
    firstVersion += 1;
  }

  function addDuplicate() {
    duplicateSecond = true;
  }

  function removeDuplicate() {
    duplicateSecond = false;
  }
</script>

<button data-testid="update-motion" onclick={update}>update</button>
<button data-testid="replace-first" onclick={replaceFirst}>replace first</button>
<button data-testid="add-duplicate" onclick={addDuplicate}>add duplicate</button>
<button data-testid="remove-duplicate" onclick={removeDuplicate}>remove duplicate</button>

{#if firstVersion % 2 === 0}
  <div
    data-testid="target-first"
    data-version="0"
    style={motion.targets.first.style}
    use:motion.targets.first.attach
  >
    first v0
  </div>
{:else}
  <div
    data-testid="target-first"
    data-version="1"
    style={motion.targets.first.style}
    use:motion.targets.first.attach
  >
    first v1
  </div>
{/if}

<div
  data-testid="target-second"
  style={motion.targets.second.style}
  use:motion.targets.second.attach
>
  second
</div>

{#if duplicateSecond}
  <div
    data-testid="target-second-duplicate"
    style={motion.targets.second.style}
    use:motion.targets.second.attach
  >
    second duplicate
  </div>
{/if}

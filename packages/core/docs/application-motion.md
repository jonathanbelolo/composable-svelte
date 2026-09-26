# Application motion

Application motion binds a compiled recipe to elements rendered under `ApplicationHost`. Import the public API from `@composable-svelte/core/application/motion`.

These handles do not expose completion callbacks or presentation dismissal
authority. For an animated dialog exit, use the component callbacks in the
[managed presentation guide](./application-presentation.md). The lower-level
`/animation` helpers and historical timer-based examples are not custom managed
driver extension points. Follow the [authoring contract](./application-contract.md#custom-integrations-and-current-exceptions)
when choosing between recipes, CSS and a capability-gap report.

## One target

Define recipes outside the component instance, then create the handle inside a component rendered by `ApplicationHost`:

```svelte
<script module lang="ts">
  import { defineMotionRecipe } from '@composable-svelte/core/application/motion';

  const fade = defineMotionRecipe({
    targets: { panel: { properties: ['opacity'] } },
    states: {
      hidden: { panel: { opacity: 0 } },
      shown: { panel: { opacity: 1 } }
    },
    graph: {
      kind: 'track',
      target: 'panel',
      properties: ['opacity'],
      durationMs: 600
    },
    interruption: 'replace'
  });
</script>

<script lang="ts">
  import { useMotion } from '@composable-svelte/core/application/motion';

  let state = $state<'hidden' | 'shown'>('hidden');
  const motion = useMotion(fade, () => state);
</script>

<button type="button" onclick={() => state = state === 'hidden' ? 'shown' : 'hidden'}>
  Toggle
</button>
<div style={motion.style} use:motion.attach>Panel</div>
```

`motion.style` supplies deterministic stable markup for initial rendering and hydration. `motion.attach` registers the live element with the host-owned renderer. Keep both on the same target.

## A coordinated group

Use one `useMotionGroup` handle when a recipe coordinates several targets:

```svelte
<script module lang="ts">
  import { defineMotionRecipe } from '@composable-svelte/core/application/motion';

  const reveal = defineMotionRecipe({
    targets: {
      first: { properties: ['opacity'] },
      second: { properties: ['opacity'] }
    },
    states: {
      hidden: { first: { opacity: 0 }, second: { opacity: 0 } },
      shown: { first: { opacity: 1 }, second: { opacity: 1 } }
    },
    graph: {
      kind: 'sequence',
      steps: [
        { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 500 },
        { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 500 }
      ]
    },
    interruption: 'replace'
  });
</script>

<script lang="ts">
  import { useMotionGroup } from '@composable-svelte/core/application/motion';

  let state = $state<'hidden' | 'shown'>('hidden');
  const motion = useMotionGroup(reveal, () => state);
</script>

<button type="button" onclick={() => state = 'shown'}>Reveal</button>
<div style={motion.targets.first.style} use:motion.targets.first.attach>First</div>
<div style={motion.targets.second.style} use:motion.targets.second.attach>Second</div>
```

The group is one coordinated request. A sequence does not start its second track until the first track settles. Use `useMotion` only for recipes with exactly one target; TypeScript rejects a multi-target recipe.

## Reduced motion and cleanup

The renderer reads `(prefers-reduced-motion: reduce)`. When it matches, state changes apply stable endpoints without intermediate playback. Consumers should describe the same meaningful states either way rather than branching on the preference themselves.

Bindings belong to the enclosing `ApplicationHost`. Component teardown disconnects targets, cancels active work, and prevents later writes to retired elements. Do not retain an attachment or call it from a different host. Ordinary Svelte conditional rendering is enough; attach the handle whenever the target is present and let component teardown release it.

This API animates supported declared properties. It does not provide component presentation or dismissal authority, replace CSS layout, or make arbitrary DOM mutation safe. The prerelease installed-package qualification exercises the same one-target and sequence patterns, including reduced-motion endpoints and teardown during playback.

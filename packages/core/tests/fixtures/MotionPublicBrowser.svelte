<script lang="ts">
  import { ApplicationHost, ApplicationRoot } from '../../src/lib/application/index.js';
  import { MotionElement, defineMotionRecipe } from '../../src/lib/application/motion-public.js';
  import { definition } from './ApplicationBasicModel.js';

  let motionState = $state<'off' | 'on'>('off');
  const dependencies = { step: 1, events: [] as string[] };
  const recipe = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 120 },
    interruption: 'replace',
  });

  export function show(): void {
    motionState = 'on';
  }
  export function hide(): void {
    motionState = 'off';
  }
</script>

<ApplicationRoot {definition} options={{ dependencies, initial: { input: 0 } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <MotionElement data-testid="motion-public" {recipe} state={motionState}>motion</MotionElement>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>

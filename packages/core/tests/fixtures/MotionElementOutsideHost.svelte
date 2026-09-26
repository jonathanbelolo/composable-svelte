<script lang="ts">
  import { MotionElement, defineMotionRecipe } from '../../src/lib/application/motion-public.js';

  const recipe = defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 120 },
    interruption: 'replace',
  });
</script>

<MotionElement as="article" data-testid="outside-host-motion" {recipe} state="off">
  outside host
</MotionElement>

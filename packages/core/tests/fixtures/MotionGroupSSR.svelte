<script lang="ts">
  import { defineMotionRecipe, useMotionGroup } from '../../src/lib/application/motion-public.js';

  type GroupState = 'collapsed' | 'expanded';

  interface Props {
    state?: GroupState;
    showTitle?: boolean;
    channel?: string;
    mixedPolicy?: boolean;
    invalidState?: boolean;
  }

  let {
    state = 'collapsed',
    showTitle = true,
    channel = 'default',
    mixedPolicy = false,
    invalidState = false,
  }: Props = $props();

  const recipe = defineMotionRecipe({
    targets: {
      surface: { properties: ['opacity'] },
      title: { properties: ['opacity', 'width'] },
    },
    states: {
      collapsed: {
        surface: { opacity: 0.5 },
        title: { opacity: 0, width: 0 },
      },
      expanded: {
        surface: { opacity: 1 },
        title: { opacity: 1, width: 120 },
      },
    },
    graph: mixedPolicy
      ? {
          kind: 'parallel',
          steps: [
            { kind: 'track', target: 'surface', properties: ['opacity'], channel: 'alpha' },
            { kind: 'track', target: 'title', properties: ['opacity', 'width'], channel: 'beta' },
          ],
        }
      : {
          kind: 'parallel',
          steps: [
            { kind: 'track', target: 'surface', properties: ['opacity'], channel },
            { kind: 'track', target: 'title', properties: ['opacity', 'width'], channel },
          ],
        },
    interruption: 'replace',
  });

  const currentState = invalidState ? ('invalid' as GroupState) : state;
  const group = useMotionGroup(recipe, () => currentState);
</script>

<div
  data-testid="surface"
  data-state={state}
  data-title-style={group.targets.title.style}
  style={group.targets.surface.style}
  use:group.targets.surface.attach
>
  surface
</div>
{#if showTitle}
  <h1
    data-testid="title"
    data-state={state}
    style={group.targets.title.style}
    use:group.targets.title.attach
  >
    title
  </h1>
{/if}

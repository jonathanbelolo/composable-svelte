<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Action } from 'svelte/action';
  import { defineMotionRecipe, useMotionGroup } from '../../src/lib/application/motion-public.js';
  import type { FeatureViewProps } from '../../src/lib/application/index.js';

  type ChildState = { value: number };
  type ChildAction = { type: 'noop' };
  let {
    mode = 'managed',
    surface,
  }: Partial<FeatureViewProps<ChildState, ChildAction>> & { mode?: 'authority' | 'managed' } = $props();

  const firstRecipe = defineMotionRecipe({
    targets: { first: { properties: ['opacity'] }, second: { properties: ['opacity'] } },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } },
    },
    graph: { kind: 'parallel', steps: [
      { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 300, channel: 'shared', priority: 1 },
      { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 300, channel: 'shared', priority: 1 },
    ] },
    interruption: 'replace',
  });
  const successorRecipe = defineMotionRecipe({
    targets: { first: { properties: ['opacity'] }, second: { properties: ['opacity'] } },
    states: {
      off: { first: { opacity: 0 }, second: { opacity: 0 } },
      on: { first: { opacity: 1 }, second: { opacity: 1 } },
    },
    graph: { kind: 'parallel', steps: [
      { kind: 'track', target: 'first', properties: ['opacity'], durationMs: 300, channel: 'shared', priority: 1 },
      { kind: 'track', target: 'second', properties: ['opacity'], durationMs: 300, channel: 'shared', priority: 1 },
    ] },
    interruption: 'replace',
  });

  let firstState = $state<'off' | 'on'>('off');
  let successorState = $state<'off' | 'on'>('off');
  const firstMotion = useMotionGroup(firstRecipe, () => firstState);
  const successorMotion = useMotionGroup(successorRecipe, () => successorState);
  const noopSurface: Action<HTMLElement> = () => ({ destroy() {} });
  const attachSurface = surface ?? noopSurface;
  let firstNode = $state<HTMLElement>();
  let secondNode = $state<HTMLElement>();
  let challengerCleanups: Array<() => void> = [];

  function admitSuccessor() {
    if (challengerCleanups.length || !firstNode || !secondNode) return;
    const first = successorMotion.targets.first.attach(firstNode);
    const second = successorMotion.targets.second.attach(secondNode);
    challengerCleanups = [() => first?.destroy?.(), () => second?.destroy?.()];
  }
  onDestroy(() => { for (const cleanup of challengerCleanups.splice(0)) cleanup(); });
</script>

{#if mode === 'authority'}
  <button data-testid="first-update" onclick={() => (firstState = 'on')}>first update</button>
  <button data-testid="admit-successor" onclick={admitSuccessor}>admit successor</button>
  <button data-testid="successor-update" onclick={() => (successorState = 'on')}>successor update</button>
  <div bind:this={firstNode} data-testid="shared-first" style={firstMotion.targets.first.style} use:firstMotion.targets.first.attach>first</div>
  <div bind:this={secondNode} data-testid="shared-second" style={firstMotion.targets.second.style} use:firstMotion.targets.second.attach>second</div>
{:else}
  <section data-testid="managed-surface" use:attachSurface>
    <button data-testid="managed-update" onclick={() => (firstState = 'on')}>update</button>
    <div data-testid="managed-first" style={firstMotion.targets.first.style} use:firstMotion.targets.first.attach>first</div>
    <div data-testid="managed-second" style={firstMotion.targets.second.style} use:firstMotion.targets.second.attach>second</div>
  </section>
{/if}

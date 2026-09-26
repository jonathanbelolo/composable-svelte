<script lang="ts">
 import { portal } from '../../src/lib/actions/portal.js';
 import Self from './PortalOrderProbe.svelte';
 // W-11a/W-11b witness: real outer use:portal={target} around an inner probe action, in one component or across a child component.
 type ActionResult = void | { destroy?: () => void };
 type Step = 'inner' | 'outer-before' | 'outer-after';
 let { target, log, variant = 'same', inner }: {
  target: HTMLElement;
  log: (step: Step, owner: Document) => void;
  variant?: 'same' | 'child' | 'leaf';
  inner?: ((node: HTMLElement) => ActionResult) | undefined;
 } = $props();
 function probe(node: HTMLElement): ActionResult { log('inner', node.ownerDocument); return inner?.(node); }
 function before(node: HTMLElement): void { log('outer-before', node.ownerDocument); }
 function after(node: HTMLElement): void { log('outer-after', node.ownerDocument); }
</script>
{#if variant === 'leaf'}
 <section use:probe data-probe-layer><button data-probe-first>Probe first</button><button data-probe-last>Probe last</button></section>
{:else}
 <div use:before use:portal={target} use:after data-probe-portal>
  {#if variant === 'child'}
   <Self variant='leaf' {target} {log} {inner} />
  {:else}
   <section use:probe data-probe-layer><button data-probe-first>Probe first</button><button data-probe-last>Probe last</button></section>
  {/if}
 </div>
{/if}

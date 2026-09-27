<script lang="ts">
  import { useStagedRoute, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import { current, leave, type HomeState, type NoAction } from './model.js';
  import { attachClosedToDiv } from './elements.js';
  let { store }: PresentationFeatureViewProps<HomeState, NoAction, {}> = $props();
  void store;
  const route = useStagedRoute(current.application!);
  const participant = useParticipant();
</script>

<main style="font: 14px sans-serif">
  <div><h1 style="margin: 0; font-size: 14px; display: inline">Home</h1>
  <button type="button" data-go onclick={() => route.request({ to: '/next' }, { motion: leave })}>Next</button></div>
  <section data-p="badge" style="width:160px;margin:2px 8px" use:participant={{ key: 'badge' }}><closed-badge label="Closed 42"></closed-badge></section>
  <section data-p="animated" style="width:160px;margin:2px 8px" use:participant={{ key: 'animated' }}><closed-badge label="Live" animated></closed-badge></section>
  <section data-p="slot" style="width:200px;margin:2px 8px" use:participant={{ key: 'slot' }}>
    <closed-slot-card><span slot="title">Title</span><p style="margin:0;color:#b91c1c;font:700 16px sans-serif">unslotted secret</p></closed-slot-card>
  </section>
  <section data-p="light" style="width:200px;margin:2px 8px" use:participant={{ key: 'light' }}>
    <light-card style="display:block;padding:8px;background:#1e3a8a;color:#fff;border-radius:8px">Light DOM card</light-card>
  </section>
  <section data-p="serial" style="width:120px;margin:2px 8px" use:participant={{ key: 'serial' }}><closed-serial></closed-serial></section>
  <section data-p="div" style="width:140px;margin:2px 8px" use:participant={{ key: 'div' }}><div {@attach attachClosedToDiv}></div></section>
  <section data-p="pairA" style="width:140px;margin:2px 8px" use:participant={{ key: 'pairA' }}><pair-light style="display:block"><span>Pair text</span></pair-light></section>
  <section data-p="pairB" style="width:140px;margin:2px 8px" use:participant={{ key: 'pairB' }}><pair-closed><span>Pair text</span></pair-closed></section>
  <section data-p="serialNested" style="width:120px;margin:2px 8px" use:participant={{ key: 'serialNested' }}><serial-nested></serial-nested></section>
  <section data-p="serialAdopted" style="width:120px;margin:2px 8px" use:participant={{ key: 'serialAdopted' }}><serial-adopted></serial-adopted></section>
  <section data-p="serialChild" style="width:170px;margin:2px 8px" use:participant={{ key: 'serialChild' }}><serial-with-child></serial-with-child></section>
  <section data-p="opaque" style="width:160px;margin:2px 8px" use:participant={{ key: 'opaque' }}><closed-badge label="Declared" data-composable-representation="opaque"></closed-badge></section>
  <section data-p="lightDeclared" style="width:200px;margin:2px 8px" use:participant={{ key: 'lightDeclared' }}>
    <light-card data-composable-representation="light-dom" style="display:block;padding:8px;background:#1e3a8a;color:#fff;border-radius:8px">Declared light DOM</light-card>
  </section>
  <section data-p="wbr" style="width:200px;margin:2px 8px" use:participant={{ key: 'wbr' }}><p style="margin:0">long<wbr>word paragraph</p></section>
  <!-- Same ordinary text at an integer and at a fractional x (glyph-phase witness). -->
  <section data-p="intText" style="width:200px;margin:2px 8px" use:participant={{ key: 'intText' }}><span>“Quoted” glyph phase</span></section>
  <section data-p="fracText" style="width:200px;margin:2px 8px 2px 8.234375px" use:participant={{ key: 'fracText' }}><span>“Quoted” glyph phase</span></section>
</main>

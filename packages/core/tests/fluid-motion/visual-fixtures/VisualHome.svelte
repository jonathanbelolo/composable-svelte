<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { useParticipant, useMotion, defineMotionRecipe, useLayoutChoreography } from '../../../src/lib/application/motion-public.js';
 import { definition, requesters, logoSrc, localToggles, big } from './VisualModel.js';
 const bigRows = Array.from({ length: big.rows }, (_, i) => i);
 const layout = useLayoutChoreography();
 // Within-page expanded state: explicit application state, committed immediately by the transition.
 let expanded = $state(false);
 localToggles.push({ toggle: plan => layout.transition(plan, () => { expanded = !expanded; }), expanded: () => expanded });
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 requesters.push({ where: 'home', requester: useStagedRoute(definition) });
 const participant = useParticipant();
 // A real motion-engine owner of `pulse` opacity (a foreign authority for choreography).
 const recipe = defineMotionRecipe({
  targets: { box: { properties: ['opacity'] } },
  states: { off: { box: { opacity: 0.2 } }, on: { box: { opacity: 1 } } },
  graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs: 4000 },
  interruption: 'replace'
 });
 let pulseState = $state<'off' | 'on'>('off');
 const pulse = useMotion(recipe, () => pulseState);
 // Starts only when the test asks: a motion owner arriving during an active choreography.
 let lateState = $state<'off' | 'on'>('off');
 const late = useMotion(recipe, () => lateState);
 $effect(() => { const handle = requestAnimationFrame(() => { pulseState = 'on'; }); return () => cancelAnimationFrame(handle); });
</script>
<main data-page="home">
 {#if bigRows.length}<div data-big use:participant={{ key: 'big' }} style="display:block;width:420px;height:600px;overflow:auto;font:12px sans-serif;background:#fff">{#each bigRows as i (i)}<div style="display:flex;gap:6px;padding:2px;border-bottom:1px solid #e2e8f0"><span style="font-weight:600">Item {i}</span><em style="color:#64748b">detail {i}</em></div>{/each}</div>{/if}
 <div data-logo use:participant={{ key: 'logo' }} style="display:block;width:40px;height:40px"><img alt="" src={logoSrc} style="display:block;width:40px;height:40px"></div>
 <div data-local use:participant={{ key: 'local', role: 'control' }} style={`display:block;width:${expanded ? 420 : 140}px;height:${expanded ? 220 : 60}px;background:rgb(90,40,140);color:white`}>{#if expanded}<button data-local-collapse type="button">Collapse</button>{:else}Local{/if}</div>
 <div data-hero use:participant={{ key: 'hero' }} style="display:block;width:240px;height:90px;background:rgb(30,60,120);color:white">Hero</div>
 <!-- A focusable non-control participant (visible-focus pinning witness). -->
 <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
 <p data-body tabindex="0" use:participant={{ key: 'body' }} style="display:block;width:300px">Home body text</p>
 <p data-note use:participant={{ key: 'note' }} style="display:block;width:300px">A plain note without controls</p>
 <a data-nav href="/detail" use:participant={{ key: 'nav', role: 'control' }} style="display:block;width:120px">Details</a>
 <div data-card use:participant={{ key: 'card' }} style="display:block;width:160px;height:100px;background:rgb(200,120,40)"><span data-badge use:participant={{ key: 'badge' }} style="display:block;width:40px;height:20px;background:black;color:white">B</span>Card</div>
 <div style="display:block;transform:rotate(0.5deg)"><div data-skewed use:participant={{ key: 'skewed' }} style="display:block;width:80px;height:20px">Skewed</div></div>
 <div style="display:block;transform:perspective(200px) rotateY(30deg)"><div data-deep use:participant={{ key: 'deep' }} style="display:block;width:80px;height:20px">Deep</div></div>
 <div data-pulse style={`display:block;width:90px;height:20px;${pulse.style}`} use:pulse.attach use:participant={{ key: 'pulse' }}>Pulse</div>
 <div data-late style={`display:block;width:90px;height:20px;${late.style}`} use:late.attach use:participant={{ key: 'late' }}>Late</div>
 <button data-start-late type="button" onclick={() => { lateState = 'on'; }}>start</button>
 <div style="display:block;opacity:0.5"><p data-faded use:participant={{ key: 'faded' }} style="display:block;width:100px">Faded</p></div>
 <div style="display:block;transform:translate(10px, 5px) scale(1.5);transform-origin:0 0"><div data-scaled use:participant={{ key: 'scaled' }} style="display:block;width:60px;height:20px">Scaled</div></div>
 <div data-form use:participant={{ key: 'form' }} style="display:block;width:160px;background:rgb(240,240,240)"><button data-save type="button">Save</button></div>
 <div style="display:block;height:1600px">spacer</div>
</main>

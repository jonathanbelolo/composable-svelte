<!--
  Inline SVG illustration of the Pavilion of Light: a tensioned membrane over timber arches, with gradients,
  a clip path, a pattern and live text. The slow shimmer is an infinite, state-free CSS animation.
-->
<script lang="ts">
  let { still = false, label = 'Pavilion of Light & Atmosphere, elevation' }: { still?: boolean; label?: string } = $props();
  const id = $props.id();
</script>

<svg class="artwork" class:still viewBox="0 0 320 160" role="img" aria-label={label}>
  <defs>
    <linearGradient id="{id}-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e3a8a" />
      <stop offset="1" stop-color="#0f1522" />
    </linearGradient>
    <radialGradient id="{id}-sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fde68a" />
      <stop offset="1" stop-color="#f59e0b" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="{id}-membrane" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.25" />
      <stop offset="0.5" stop-color="#e0f2fe" stop-opacity="0.85" />
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0.25" />
    </linearGradient>
    <pattern id="{id}-grid" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M12 0H0V12" fill="none" stroke="#38bdf8" stroke-opacity="0.12" />
    </pattern>
    <clipPath id="{id}-frame"><rect width="320" height="160" rx="14" /></clipPath>
  </defs>
  <g clip-path="url(#{id}-frame)">
    <rect width="320" height="160" fill="url(#{id}-sky)" />
    <rect width="320" height="160" fill="url(#{id}-grid)" />
    <circle cx="258" cy="38" r="34" fill="url(#{id}-sun)" />
    <path d="M18 132 Q 88 34 160 70 T 302 132" fill="url(#{id}-membrane)" stroke="#e0f2fe" stroke-width="1.5" />
    <path class="shimmer" d="M18 132 Q 88 34 160 70 T 302 132" fill="none" stroke="#fde68a" stroke-width="2.5" stroke-dasharray="36 280" />
    {#each [40, 88, 136, 184, 232, 280] as x (x)}
      <path d="M{x} 132 Q {x + 6} 92 {x + 12} 132" fill="none" stroke="#b45309" stroke-width="3" />
    {/each}
    <rect y="132" width="320" height="28" fill="#0b1220" />
    <text x="16" y="151" fill="#94a3b8" font-size="10" font-family="ui-monospace, monospace">SPAN 38.4 m · PTFE 4.8 kN/m</text>
  </g>
</svg>

<style>
  .artwork { display: block; width: 100%; height: auto; border-radius: 14px; }
  .shimmer { animation: shimmer 6s linear infinite; }
  .still .shimmer { animation-play-state: paused; }
  @keyframes shimmer { from { stroke-dashoffset: 316; } to { stroke-dashoffset: 0; } }
</style>

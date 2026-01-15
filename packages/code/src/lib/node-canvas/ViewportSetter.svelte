<script lang="ts">
  /**
   * ViewportSetter Component
   *
   * Internal helper that must be rendered inside SvelteFlow.
   * Uses useSvelteFlow() to programmatically set the viewport.
   * This is the official way to control SvelteFlow's internal viewport state.
   */

  import { useSvelteFlow } from '@xyflow/svelte';
  import { onMount } from 'svelte';

  interface Props {
    viewport: { zoom: number; x: number; y: number } | null;
    /** Called when viewport is successfully applied */
    onApplied?: () => void;
  }

  const props = $props<Props>();

  const { setViewport, getViewport } = useSvelteFlow();

  // Track last applied viewport to avoid re-applying
  let lastAppliedJson = '';
  // Track if SvelteFlow is ready (mounted)
  let isReady = false;

  /**
   * Apply viewport using SvelteFlow's official API.
   */
  function applyViewport(vp: { zoom: number; x: number; y: number }) {
    const json = JSON.stringify(vp);
    if (json === lastAppliedJson) {
      return;
    }

    lastAppliedJson = json;
    console.log('[ViewportSetter] Applying viewport via setViewport():', vp);

    // Use SvelteFlow's official API to set viewport
    // This properly updates SvelteFlow's internal state
    setViewport(vp, { duration: 0 });

    // Notify parent that viewport was applied
    props.onApplied?.();

    // Verify it was applied
    requestAnimationFrame(() => {
      const current = getViewport();
      console.log('[ViewportSetter] Viewport after setViewport():', current);
    });
  }

  onMount(() => {
    // Small delay to ensure SvelteFlow is fully initialized
    const timeout = setTimeout(() => {
      isReady = true;
      // Apply pending viewport if any
      if (props.viewport) {
        applyViewport($state.snapshot(props.viewport));
      }
    }, 50);

    return () => clearTimeout(timeout);
  });

  $effect(() => {
    const vp = props.viewport;
    if (vp && isReady) {
      // Use $state.snapshot to get raw values from proxy
      applyViewport($state.snapshot(vp));
    }
  });
</script>

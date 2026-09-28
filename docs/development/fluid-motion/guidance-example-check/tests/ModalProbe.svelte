<script lang="ts">
  // Test-only: the real Modal with every prop forwarded (presentation, motion, children, …). Only the two
  // completion callbacks are wrapped, to record what the Modal delivers.
  import { modalProbe } from './modal-probe.js';

  let { onPresentationComplete, onDismissalComplete, ...rest }: Record<string, unknown> & {
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
  } = $props();
  const Real = modalProbe.Modal!;
  function presented() { modalProbe.deliveries.push('presentationComplete'); onPresentationComplete?.(); }
  function dismissed() { modalProbe.deliveries.push('dismissalComplete'); onDismissalComplete?.(); }
</script>

<Real {...rest} onPresentationComplete={presented} onDismissalComplete={dismissed} />

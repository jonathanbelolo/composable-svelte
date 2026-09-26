<script lang="ts">
  import { MfaChallengeForm } from '@composable-svelte/auth/components';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { MfaChallengeState, MfaChallengeAction } from '@composable-svelte/auth/flows';

  let { store, surface }: PresentationFeatureViewProps<MfaChallengeState, MfaChallengeAction> = $props();
</script>

<div use:surface data-testid="mfa-view-wrapper" class="auth-form-wrapper">
  <MfaChallengeForm mode="managed" flowStore={store} headingLevel={2} />
</div>

<style>
  .auth-form-wrapper {
    max-width: 420px;
    margin: 2rem auto;
    padding: 1.5rem;
  }
</style>

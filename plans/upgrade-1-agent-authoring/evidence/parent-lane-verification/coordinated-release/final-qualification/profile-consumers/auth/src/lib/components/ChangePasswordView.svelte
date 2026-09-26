<script lang="ts">
  import { ChangePasswordForm } from '@composable-svelte/auth/components';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { ChangePasswordState, ChangePasswordAction } from '@composable-svelte/auth/flows';

  let { store, surface }: PresentationFeatureViewProps<ChangePasswordState, ChangePasswordAction> = $props();
</script>

<div use:surface data-testid="change-password-wrapper" class="password-form-wrapper">
  <ChangePasswordForm mode="managed" flowStore={store} headingLevel={3} hasPassword={true} />
</div>

<style>
  .password-form-wrapper {
    max-width: 480px;
    margin: 1rem 0;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }
</style>

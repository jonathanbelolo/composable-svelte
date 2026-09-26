<script lang="ts">
  import { LoginForm } from '@composable-svelte/auth/components';
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { LoginState, LoginAction } from '@composable-svelte/auth/flows';

  let { store, surface }: PresentationFeatureViewProps<LoginState, LoginAction> = $props();
</script>

<div use:surface data-testid="login-view-wrapper" class="auth-form-wrapper">
  <LoginForm mode="managed" flowStore={store} headingLevel={2} />
</div>

<style>
  .auth-form-wrapper {
    max-width: 420px;
    margin: 2rem auto;
    padding: 1.5rem;
  }
</style>

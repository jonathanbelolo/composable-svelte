<script lang="ts">
  import { FeatureOutlet, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import type { AuthFeatureState, AuthFeatureAction, AuthFeatureCatalog } from '@composable-svelte/auth/application';

  let { store, views, surface }: PresentationFeatureViewProps<AuthFeatureState, AuthFeatureAction, AuthFeatureCatalog> = $props();
</script>

<div use:surface data-testid="auth-feature-view">
  <FeatureOutlet view={views.login} />
  <FeatureOutlet view={views.mfa} />
  <FeatureOutlet view={views.changePassword} />
</div>

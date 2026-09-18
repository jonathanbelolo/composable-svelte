<script lang="ts">
  import { LoginForm } from '@composable-svelte/auth';
  import { login, session } from './stores';
</script>

<LoginForm
  flowStore={login}
  sessionStore={session}
  onSuccess={() => history.pushState({}, '', '/')}
>
  {#snippet footer()}
    <a href="/forgot">Forgot your password?</a>
  {/snippet}
</LoginForm>

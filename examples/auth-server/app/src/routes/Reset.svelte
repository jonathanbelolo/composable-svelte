<script lang="ts">
	import { ResetPasswordForm, createResetPasswordStore } from '@composable-svelte/auth';

	import { deps, go, queryParam, session } from '../deps.js';

	const reset = createResetPasswordStore(deps);
	const token = queryParam('token');
</script>

<ResetPasswordForm
	flowStore={reset}
	sessionStore={session}
	{token}
	onSuccess={() => go('/')}
	onSignIn={() => go('/login')}
	onRequestNewLink={() => go('/forgot')}
/>

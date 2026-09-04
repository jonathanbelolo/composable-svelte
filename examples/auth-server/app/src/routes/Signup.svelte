<script lang="ts">
	import { SignupForm, createSignupStore } from '@composable-svelte/auth';

	import { deps, go, session } from '../deps.js';

	const signup = createSignupStore(deps);
</script>

<SignupForm
	flowStore={signup}
	sessionStore={session}
	onSuccess={() => go('/')}
	onSignIn={() => go('/login')}
/>

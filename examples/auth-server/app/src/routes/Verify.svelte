<script lang="ts">
	import { EmailVerification, createEmailVerificationStore } from '@composable-svelte/auth';

	import { deps, go, queryParam, session } from '../deps.js';

	const verification = createEmailVerificationStore(deps);
	// From the query, not from `window.location` inside the component — the flow
	// takes a string so it works on a server and can be driven from a test.
	const token = queryParam('token');
</script>

<EmailVerification
	flowStore={verification}
	sessionStore={session}
	{token}
	onSuccess={() => go('/')}
	onSignIn={() => go('/login')}
/>

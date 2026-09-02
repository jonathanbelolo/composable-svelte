<script lang="ts">
	import { MagicLinkSignIn, createMagicLinkSignInStore } from '@composable-svelte/auth';

	import { deps, go, queryParam, session } from '../deps.js';

	const signIn = createMagicLinkSignInStore(deps);
	const token = queryParam('token');
</script>

<!--
	The token is spent on a *press*, not on mount, so a mail scanner following
	the link cannot burn it before the user arrives.
-->
<MagicLinkSignIn
	flowStore={signIn}
	sessionStore={session}
	{token}
	onSuccess={() => go('/settings')}
	onRequestNewLink={() => go('/magic')}
/>

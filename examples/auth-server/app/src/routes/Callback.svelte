<script lang="ts">
	import {
		OAuthCallback,
		createOAuthCallbackStore,
		oauthParamsFromUrl
	} from '@composable-svelte/auth';

	import { deps, go, pendingOAuth, session } from '../deps.js';

	const callback = createOAuthCallbackStore({
		completeOAuth: deps.completeOAuth,
		linkOAuthProvider: deps.linkOAuthProvider,
		pendingOAuth
	});

	const params = oauthParamsFromUrl(window.location.href);
</script>

<!--
	One callback URL for both outcomes. `beginOAuth` takes no redirect URI — the
	backend owns it — so nothing can know whether a return is a sign-in or a link
	until the pending record is read, which is after this component has mounted.
-->
<OAuthCallback
	flowStore={callback}
	sessionStore={session}
	{params}
	onSuccess={({ intent, returnTo }) => go(returnTo ?? (intent === 'link' ? '/settings' : '/'))}
	onStartOver={() => go('/login')}
/>

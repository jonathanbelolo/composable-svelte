<script lang="ts">
	import { OAuthSignIn, createOAuthStartStore, subjectDisplayName } from '@composable-svelte/auth';

	import { PROVIDERS, deps, go, pendingOAuth, redirect, session } from '../deps.js';

	const oauth = createOAuthStartStore({ beginOAuth: deps.beginOAuth, pendingOAuth, redirect });
	const name = $derived(subjectDisplayName(session.state.subject));
</script>

<h1>Auth reference client</h1>

{#if session.state.status === 'authenticated'}
	<p data-testid="greeting">Signed in as {name ?? 'someone'}.</p>
	<p><a href="/settings" onclick={(e) => (e.preventDefault(), go('/settings'))}>Your settings</a></p>
{:else}
	<p>Not signed in.</p>
	<ul>
		<li><a href="/login" onclick={(e) => (e.preventDefault(), go('/login'))}>Sign in</a></li>
		<li><a href="/signup" onclick={(e) => (e.preventDefault(), go('/signup'))}>Create an account</a></li>
		<li><a href="/magic" onclick={(e) => (e.preventDefault(), go('/magic'))}>Email me a link</a></li>
		<li><a href="/forgot" onclick={(e) => (e.preventDefault(), go('/forgot'))}>Forgotten password</a></li>
	</ul>

	<!--
		The real redirect. Pressing one of these leaves the page for the fixture's
		stub identity provider and comes back to `/callback` — the round trip no
		mocked demo can perform.
	-->
	<OAuthSignIn flowStore={oauth} providers={PROVIDERS} returnTo="/settings" headingLevel={2} />
{/if}

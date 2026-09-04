<script lang="ts">
	/**
	 * The reference client: every flow in `@composable-svelte/auth`, wired to a
	 * real backend.
	 *
	 * The repository has no other example of this. Every styleguide demo runs on
	 * `createMockAuthDeps`, so until now nothing showed the package talking to a
	 * server — which is also why the cookie, the redirect and the backend's
	 * refusals had never been exercised anywhere.
	 *
	 * Deliberately router-free: `history.pushState` plus a `popstate` listener is
	 * enough for eleven pages, and pulling in a router would put a dependency
	 * between the reader and the thing being demonstrated.
	 */
	import { AuthGuard, SessionRefresh } from '@composable-svelte/auth';

	import { currentPath, go, session, sessionRefresh } from './deps.js';
	import Callback from './routes/Callback.svelte';
	import Forgot from './routes/Forgot.svelte';
	import Home from './routes/Home.svelte';
	import Login from './routes/Login.svelte';
	import Magic from './routes/Magic.svelte';
	import MagicSignIn from './routes/MagicSignIn.svelte';
	import Reset from './routes/Reset.svelte';
	import Settings from './routes/Settings.svelte';
	import ConfirmEmail from './routes/ConfirmEmail.svelte';
	import Signup from './routes/Signup.svelte';
	import Verify from './routes/Verify.svelte';

	let path = $state(currentPath());

	$effect(() => {
		const onPop = () => (path = currentPath());
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	});

	// The mount-driven resolve. This is what proves the cookie survives a reload:
	// nothing is stored client-side, so a refreshed page is signed in only if the
	// browser sent a cookie the server recognised.
	$effect(() => {
		if (session.state.status === 'unresolved') {
			session.dispatch({ type: 'resolveSession' });
		}
	});

	const status = $derived(session.state.status);
</script>

<!--
	Renders nothing. It starts the watch, bridges the advertised expiry from the
	session store into the refresh flow, and re-resolves once if the backend
	says the session is gone.
-->
<SessionRefresh flowStore={sessionRefresh} sessionStore={session} />

<main>
	<nav>
		<a href="/" onclick={(e) => (e.preventDefault(), go('/'))}>Home</a>
		<a href="/settings" onclick={(e) => (e.preventDefault(), go('/settings'))}>Settings</a>
		<span data-testid="session-status">{status}</span>
	</nav>

	{#if path === '/login'}
		<Login />
	{:else if path === '/signup'}
		<Signup />
	{:else if path === '/verify'}
		<Verify />
	{:else if path === '/forgot'}
		<Forgot />
	{:else if path === '/reset'}
		<Reset />
	{:else if path === '/magic'}
		<Magic />
	{:else if path === '/magic/signin'}
		<MagicSignIn />
	{:else if path === '/callback'}
		<!--
			**Not under `/auth`.** Vite proxies `/auth` to the fixture, so a callback
			there would be swallowed by the proxy and never reach this page.
		-->
		<Callback />
	{:else if path === '/email/confirm'}
		<!-- Not under `/auth`: Vite proxies that to the fixture. -->
		<ConfirmEmail />
	{:else if path === '/settings'}
		<!--
			`AuthGuard` is UX gating, not security: the server refuses these calls
			anyway. It exists so a signed-out visitor gets a way in rather than a
			row of failing requests.
		-->
		<AuthGuard store={session}>
			{#snippet children()}
				<Settings />
			{/snippet}
			{#snippet fallback()}
				<p>
					You are signed out. <a href="/login" onclick={(e) => (e.preventDefault(), go('/login'))}
						>Sign in</a
					> to see your settings.
				</p>
			{/snippet}
		</AuthGuard>
	{:else}
		<Home />
	{/if}
</main>

<style>
	main {
		max-width: 32rem;
		margin: 0 auto;
		padding: 2rem 1rem;
		font-family: system-ui, sans-serif;
		color: #0f172a;
	}

	nav {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e2e8f0;
		font-size: 0.875rem;
	}

	nav span {
		margin-left: auto;
		color: #64748b;
	}
</style>

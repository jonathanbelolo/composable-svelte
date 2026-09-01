<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-auth/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. That gap is not theoretical: the
	 * skill shipped a `bind:value` on `PasswordInput`, whose `value` is not
	 * `$bindable()`, and nothing in the guard suite could have caught it. This
	 * file is the markup half, and it is typechecked because `svelte-check` reads
	 * every `.svelte` under `tests`.
	 */
	import {
		AuthGuard,
		LoginForm,
		OAuthCallback,
		OAuthSignIn,
		PasswordInput,
		RoleGate,
		oauthParamsFromUrl
	} from '../../src/lib/index.js';
	import type {
		MfaChallengeAction,
		MfaChallengeState
	} from '../../src/lib/flows/mfa-challenge/types.js';
	import type { LoginAction, LoginState } from '../../src/lib/flows/login/types.js';
	import type {
		OAuthStartAction,
		OAuthStartState
	} from '../../src/lib/flows/oauth-start/types.js';
	import type {
		OAuthCallbackAction,
		OAuthCallbackState
	} from '../../src/lib/flows/oauth-callback/types.js';
	import type { SessionAction, SessionState } from '../../src/lib/session/types.js';

	let {
		login,
		session,
		challenge,
		startStore,
		callbackStore
	}: {
		login: {
			readonly state: LoginState;
			dispatch(action: LoginAction): void;
			subscribe(listener: (state: LoginState) => void): () => void;
		};
		session: { readonly state: SessionState; dispatch(action: SessionAction): void };
		challenge: {
			readonly state: MfaChallengeState;
			dispatch(action: MfaChallengeAction): void;
		};
		startStore: {
			readonly state: OAuthStartState;
			dispatch(action: OAuthStartAction): void;
		};
		callbackStore: {
			readonly state: OAuthCallbackState;
			dispatch(action: OAuthCallbackAction): void;
		};
	} = $props();

	const sessionStore = session;

	let value = $state('');
</script>

<LoginForm
	flowStore={login}
	sessionStore={session}
	headingLevel={1}
	onSuccess={() => history.pushState({}, '', '/')}
>
	{#snippet footer()}
		<a href="/forgot">Forgot your password?</a>
	{/snippet}
</LoginForm>

<label for="new-password">New password</label>
<PasswordInput
	id="new-password"
	name="password"
	{value}
	autocomplete="new-password"
	invalid={value.length > 0 && value.length < 8}
	errorId="new-password-error"
	oninput={(event) => (value = event.currentTarget.value)}
/>

<AuthGuard store={session} onAnonymous={() => history.pushState({}, '', '/login')}>
  {#snippet pending()}<p>Loading…</p>{/snippet}
  {#snippet fallback({ error })}<p>Please sign in. {error?.message ?? ''}</p>{/snippet}

  <RoleGate store={session} roles={['admin']}>
    <p>Admin panel</p>
    {#snippet fallback()}<p>Not authorized.</p>{/snippet}
  </RoleGate>
</AuthGuard>

<LoginForm
  flowStore={login}
  sessionStore={session}
  onMfaRequired={(c) => challenge.dispatch({ type: 'challengeProvided', ...c })}
/>

<OAuthSignIn
	flowStore={startStore}
	providers={[{ id: 'github', label: 'GitHub' }]}
	returnTo="/dashboard"
/>

<OAuthCallback
	flowStore={callbackStore}
	{sessionStore}
	params={oauthParamsFromUrl(window.location.href)}
	onSuccess={({ returnTo }) => history.pushState({}, '', returnTo ?? '/')}
	onStartOver={() => history.pushState({}, '', '/sign-in')}
/>

<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		AuthGuard,
		LoginForm,
		PasswordInput,
		createLoginStore,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		type AuthError
	} from '@composable-svelte/auth';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui';

	// The credentials the mock backend accepts. Anything else is rejected as
	// `invalid_credentials`, so both outcomes are reachable without a toggle.
	const ACCOUNT = { email: 'ada@example.com', password: 'correct-horse' };

	function makeSessionStore() {
		return createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: createMockAuthDeps()
		});
	}

	// --- Demo 1: the happy path, with the session it produces alongside it. ---
	// 600ms of latency, deliberately: an instant sign-in shows nothing of the
	// pending state, which is half of what this component does.
	const signInSession = makeSessionStore();
	const signInFlow = createLoginStore(createMockAuthDeps({ accepts: ACCOUNT, latencyMs: 600 }));

	// What an app does at startup. The mock resolves to null, so the session
	// settles on `anonymous` — without this it would sit in `unresolved` forever
	// and `AuthGuard` would show its pending branch rather than its fallback.
	signInSession.dispatch({ type: 'resolveSession' });

	// --- Demo 2: every failure branch, one store per branch. ---
	const FAILURES: Array<{ label: string; error: AuthError; note: string }> = [
		{
			label: 'Wrong password',
			error: { code: 'invalid_credentials', message: 'That email and password do not match.' },
			note: 'The ordinary case. Offer a retry and a "forgot password?" link.'
		},
		{
			label: 'Second factor',
			error: {
				code: 'mfa_required',
				message: 'Enter the code from your authenticator app.',
				challengeId: 'chal_9f2b',
				methods: ['totp', 'recovery_code']
			},
			note: 'Not a failure at all — the flow branching. The challenge id is what a string error could not carry, and the reason AuthError is a union. Wire `onMfaRequired` and it is handed to `MfaChallengeForm` instead of shown as an error — see the Multi-Factor Auth demo, where this scenario is played out end to end.'
		},
		{
			label: 'Unverified email',
			error: {
				code: 'email_unverified',
				message: 'Confirm your email address before signing in.',
				email: 'ada@example.com'
			},
			note: 'Offer to resend the verification email — to the address in the error, not the one in the field.'
		},
		{
			label: 'Locked out',
			error: {
				code: 'account_locked',
				message: 'Too many attempts. This account is locked for an hour.',
				until: '2026-08-31T17:00:00.000Z'
			},
			note: 'Offer no retry button. `until` is an ISO string, not a Date, so it survives SSR hydration.'
		},
		{
			label: 'Rate limited',
			error: {
				code: 'rate_limited',
				message: 'Too many requests. Try again shortly.',
				retryAfterSeconds: 30
			},
			note: '`retryDelaySeconds` returns null when the backend stated no delay — the client never invents one.'
		}
	];

	let selected = $state(0);
	const failureSession = makeSessionStore();
	failureSession.dispatch({ type: 'resolveSession' });
	// One store per branch, built once. Remounting the form is what resets it —
	// see the `{#key}` below.
	const failureFlows = FAILURES.map((f) =>
		createLoginStore(createMockAuthDeps({ failWith: f.error }))
	);

	// --- Demo 3: the primitive on its own. ---
	let password = $state('');
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">LoginForm</h2>
			<p class="text-muted-foreground">
				Password sign-in: a headless flow reducer, a styled form, and a structured failure the
				surface can branch on.
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ Two stores — the flow owns the attempt, the session owns "who am I"</li>
				<li>✓ Structured failures: eight <code>AuthError</code> arms, branchable by code</li>
				<li>✓ The submit button is disabled in flight, not merely relabelled</li>
				<li>✓ A second submit supersedes the first rather than racing it</li>
				<li>✓ Editing any field clears the last failure</li>
				<li>✓ Labels, <code>aria-invalid</code> and <code>aria-describedby</code> wired by hand</li>
				<li>✓ Scoped CSS over core's theme tokens — no Tailwind, so nothing is purged</li>
				<li>✓ Backed by <code>createMockAuthDeps</code>; no server involved</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Signing in</h3>
			<p class="text-muted-foreground text-sm">
				<code>{ACCOUNT.email}</code> / <code>{ACCOUNT.password}</code> succeeds; anything else comes
				back as <code>invalid_credentials</code>. The mock takes 600ms, so the pending state is
				visible.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The form, and the session it establishes</CardTitle>
				<CardDescription>
					The panel on the right reads the session store. Nothing wires them together but
					<code>LoginForm</code>'s two props.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-6 md:grid-cols-2">
					<LoginForm flowStore={signInFlow} sessionStore={signInSession} headingLevel={4}>
						{#snippet footer()}
							<span>Forgot your password? — a link would go here.</span>
						{/snippet}
					</LoginForm>

					<div class="rounded-lg border p-4 text-sm">
						<h4 class="font-semibold mb-3">Session store</h4>
						<AuthGuard store={signInSession}>
							{#snippet pending()}
								<p class="text-muted-foreground">Resolving…</p>
							{/snippet}
							{#snippet fallback()}
								<p class="text-muted-foreground">
									Anonymous. <code>AuthGuard</code> is showing its fallback branch.
								</p>
							{/snippet}
							<p class="mb-2">
								Signed in as
								<strong>{signInSession.state.subject.kind === 'authenticated'
										? (signInSession.state.subject.attributes.display_name ?? 'unknown')
										: 'unknown'}</strong>
							</p>
							<p class="text-muted-foreground">
								Status: <code>{signInSession.state.status}</code>
							</p>
						</AuthGuard>
					</div>
				</div>
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Structured failures</h3>
			<p class="text-muted-foreground text-sm">
				Pick a branch, then sign in with anything. Every arm carries its own typed fields — which is
				the point: a single <code>string</code> could not have held the challenge id, the lock
				expiry or the retry delay.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>One branch at a time</CardTitle>
				<CardDescription>Each button mounts a form whose backend always fails that way.</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					{#each FAILURES as failure, index (failure.error.code)}
						<button
							type="button"
							class="px-3 py-1.5 text-sm rounded-md border {selected === index
								? 'bg-primary text-primary-foreground border-primary'
								: 'hover:bg-accent'}"
							aria-pressed={selected === index}
							onclick={() => (selected = index)}
						>
							{failure.label}
						</button>
					{/each}
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					<!--
						Keyed on the selection so switching branches mounts a fresh form.
						`Form` captures its store into context at init, so swapping the store
						under a live component would leave every field reading a dead one.
					-->
					{#key selected}
						<LoginForm
							flowStore={failureFlows[selected]!}
							sessionStore={failureSession}
							headingLevel={4}
						/>
					{/key}

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">What a surface would do</h4>
							<p class="text-muted-foreground">{FAILURES[selected]!.note}</p>
						</div>
						<div>
							<h4 class="font-semibold mb-1">The error, as state</h4>
							<pre class="bg-muted rounded p-3 overflow-x-auto text-xs"><code
									>{JSON.stringify(FAILURES[selected]!.error, null, 2)}</code
								></pre>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">PasswordInput</h3>
			<p class="text-muted-foreground text-sm">
				The primitive on its own. The toggle is a real button — tabbable, with
				<code>aria-pressed</code> and a label that changes — because revealing a password has no
				keyboard equivalent to fall back on.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>On its own</CardTitle>
				<CardDescription>Tab to the toggle and press Space.</CardDescription>
			</CardHeader>
			<CardContent>
				<form class="max-w-sm space-y-4" onsubmit={(event) => event.preventDefault()}>
					<!--
						A password form with no username field gives a password manager
						nothing to file the credential against, and Chrome says so in the
						console. `LoginForm` has a real one; a standalone change-password
						screen needs this hidden stand-in, which is the pattern worth
						showing here.
					-->
					<input
						type="text"
						autocomplete="username"
						value="ada@example.com"
						readonly
						hidden
						aria-hidden="true"
						tabindex="-1"
					/>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="demo-password">New password</label>
						<PasswordInput
							id="demo-password"
							value={password}
							autocomplete="new-password"
							placeholder="Choose a password"
							invalid={password.length > 0 && password.length < 8}
							errorId="demo-password-error"
							oninput={(event) => (password = event.currentTarget.value)}
						/>
						{#if password.length > 0 && password.length < 8}
							<p
								class="text-sm font-medium text-destructive"
								id="demo-password-error"
								role="alert"
								aria-live="polite"
							>
								At least 8 characters.
							</p>
						{/if}
					</div>

					<div class="space-y-2">
						<label class="text-sm font-medium" for="demo-password-disabled">Disabled</label>
						<PasswordInput
							id="demo-password-disabled"
							value="hunter2"
							disabled
							oninput={() => {}}
						/>
					</div>
				</form>
			</CardContent>
		</Card>
	</section>
</div>

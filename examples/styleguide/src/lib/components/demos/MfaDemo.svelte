<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		LoginForm,
		MfaChallengeForm,
		MfaEnrolment,
		createLoginStore,
		createMfaChallengeStore,
		createMfaEnrolmentStore,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		type MfaMethod
	} from '@composable-svelte/auth';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui';

	function makeSessionStore() {
		const store = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: createMockAuthDeps()
		});
		store.dispatch({ type: 'resolveSession' });
		return store;
	}

	// --- The handoff: sign in, get challenged, satisfy it. ---
	const sessionStore = makeSessionStore();
	let signInAttempt = $state(0);
	let handed = $state<{ challengeId: string; methods: readonly MfaMethod[] } | null>(null);

	const CHALLENGE: MfaMethod[] = ['totp', 'recovery_code'];

	const loginStore = $derived.by(() => {
		void signInAttempt;
		return createLoginStore(
			createMockAuthDeps({
				latencyMs: 500,
				failWith: {
					code: 'mfa_required',
					message: 'Enter the code from your authenticator app.',
					challengeId: 'chal_demo',
					methods: CHALLENGE
				}
			})
		);
	});

	const challengeStore = $derived.by(() => {
		void signInAttempt;
		return createMfaChallengeStore(createMockAuthDeps({ latencyMs: 500 }), null, CHALLENGE);
	});

	// --- Enrolment, on its own. ---
	let enrolAttempt = $state(0);
	let acknowledged = $state(0);
	const enrolmentStore = $derived.by(() => {
		void enrolAttempt;
		return createMfaEnrolmentStore(createMockAuthDeps({ latencyMs: 600 }));
	});
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">Multi-factor authentication</h2>
			<p class="text-muted-foreground">
				The step <code>mfa_required</code> has been pointing at since the error union was created —
				and the enrolment that makes it reachable.
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ <code>challengeId</code> travelling from a failed sign-in into the verify call</li>
				<li>✓ <code>mfa_required</code> shown as a branch, not a red failure banner</li>
				<li>✓ A recovery code as a different <em>method</em>, not a differently-labelled box</li>
				<li>✓ One code field with <code>autocomplete="one-time-code"</code>, not six boxes</li>
				<li>✓ A secret for manual entry, and a <code>qr</code> snippet instead of a dependency</li>
				<li>✓ Recovery codes shown once, and left up until the user says otherwise</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Sign in, then the second factor</h3>
			<p class="text-muted-foreground text-sm">
				Any email and password will do — this backend always asks for a second factor. The code is
				<code>123456</code>; anything else is rejected so the wrong-code branch is reachable.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The handoff</CardTitle>
				<CardDescription>
					Notice there is no red banner when the credentials are accepted — being asked for a code
					is not a failure.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => {
							signInAttempt += 1;
							handed = null;
						}}
					>
						Start over
					</button>
				</div>

				{#key signInAttempt}
					<div class="grid gap-6 md:grid-cols-2">
						{#if handed === null}
							<LoginForm
								flowStore={loginStore}
								{sessionStore}
								headingLevel={4}
								onMfaRequired={(challenge) => {
									handed = challenge;
									challengeStore.dispatch({ type: 'challengeProvided', ...challenge });
								}}
							/>
						{:else}
							<MfaChallengeForm
								flowStore={challengeStore}
								{sessionStore}
								headingLevel={4}
								onStartOver={() => {
									signInAttempt += 1;
									handed = null;
								}}
							/>
						{/if}

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">What was handed over</h4>
								{#if handed === null}
									<p class="text-muted-foreground">Nothing yet — sign in above.</p>
								{:else}
									<pre class="bg-muted rounded p-3 overflow-x-auto text-xs"><code
											>{JSON.stringify(handed, null, 2)}</code
										></pre>
								{/if}
							</div>
							<div>
								<h4 class="font-semibold mb-1">Session store</h4>
								<p class="text-muted-foreground">
									Status: <code>{sessionStore.state.status}</code>
								</p>
							</div>
						</div>
					</div>
				{/key}
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Turning it on</h3>
			<p class="text-muted-foreground text-sm">
				The secret is real and the <code>otpauth://</code> URI is well-formed, so a QR rendered from
				it would genuinely scan. Confirm with <code>123456</code>.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Enrolment, without a QR dependency</CardTitle>
				<CardDescription>
					The snippet below is what a consumer would replace with their own renderer.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => (enrolAttempt += 1)}
					>
						Start over
					</button>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					{#key enrolAttempt}
						<MfaEnrolment
							flowStore={enrolmentStore}
							headingLevel={4}
							onDone={() => (acknowledged += 1)}
						>
							{#snippet qr({ otpauthUri })}
								<div
									class="rounded-md border border-dashed p-4 text-xs text-muted-foreground break-all"
								>
									<strong class="block mb-1 not-italic">Your QR renderer goes here.</strong>
									{otpauthUri}
								</div>
							{/snippet}
						</MfaEnrolment>
					{/key}

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">Why no QR is drawn</h4>
							<p class="text-muted-foreground">
								Nothing in this repository can produce one, and an encoder would be the package's
								second runtime dependency for something that is not its job. The secret is shown for
								manual entry — which every authenticator supports — and the snippet takes the URI.
							</p>
						</div>
						{#if acknowledged > 0}
							<p class="text-muted-foreground">
								<code>onDone</code> fired {acknowledged}
								{acknowledged === 1 ? 'time' : 'times'} — only after the user said they had saved
								the codes.
							</p>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	</section>
</div>

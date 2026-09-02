<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		OAuthSignIn,
		OAuthCallback,
		oauthStartReducer,
		createInitialOAuthStartState,
		oauthCallbackReducer,
		createInitialOAuthCallbackState,
		createMemoryPendingOAuthStorage,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		type OAuthCallbackParams,
		type PendingOAuthStorage
	} from '@composable-svelte/auth';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui';

	const PROVIDERS = [
		{ id: 'google', label: 'Google' },
		{ id: 'github', label: 'GitHub' }
	];

	function makeSessionStore() {
		const store = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: createMockAuthDeps()
		});
		store.dispatch({ type: 'resolveSession' });
		return store;
	}

	// One record, shared between the two halves — as `sessionStorage` would be,
	// except this one survives the demo instead of a navigation.
	let pending = $state<PendingOAuthStorage>(createMemoryPendingOAuthStorage());

	// Where the redirect would have gone. This is the whole reason `redirect` is
	// an injected dependency rather than a bare `location.assign`: substituting
	// one that records instead of navigating is what lets this demo exist at all.
	let wouldNavigateTo = $state<string | null>(null);

	let attempt = $state(0);
	const sessionStore = makeSessionStore();

	const startStore = $derived.by(() => {
		void attempt;
		const api = createMockAuthDeps({ latencyMs: 500 });
		return createStore({
			initialState: createInitialOAuthStartState(),
			reducer: oauthStartReducer,
			dependencies: {
				beginOAuth: api.beginOAuth,
				pendingOAuth: pending,
				redirect: (url: string) => {
					wouldNavigateTo = url;
				}
			}
		});
	});

	// --- The callback half, driven by whichever scenario is picked. ---
	type Scenario = 'works' | 'cancelled' | 'mismatch' | 'providerError' | 'noCallback';

	const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
		{ id: 'works', label: 'Signs in', hint: 'The nonce matches and the code is good.' },
		{ id: 'cancelled', label: 'Cancelled', hint: 'The provider sent back `error=access_denied`.' },
		{
			id: 'mismatch',
			label: 'Nonce mismatch',
			hint: 'The returned `state` does not match what was stored.'
		},
		{
			id: 'providerError',
			label: 'Provider error',
			hint: 'A `server_error` that no retry can fix.'
		},
		{ id: 'noCallback', label: 'Reached directly', hint: 'No `code` and no `error` in the URL.' }
	];

	let scenario = $state<Scenario>('works');
	let callbackAttempt = $state(0);
	let landed = $state<string | null>(null);

	const callbackParams = $derived.by((): OAuthCallbackParams | null => {
		switch (scenario) {
			case 'works':
				return { code: 'code_demo', state: 'st_demo', error: null, errorDescription: null };
			case 'cancelled':
				return {
					code: null,
					state: 'st_demo',
					error: 'access_denied',
					errorDescription: 'The user denied the request'
				};
			case 'mismatch':
				return { code: 'code_demo', state: 'st_forged', error: null, errorDescription: null };
			case 'providerError':
				return { code: null, state: 'st_demo', error: 'server_error', errorDescription: null };
			case 'noCallback':
				return null;
		}
	});

	const callbackStore = $derived.by(() => {
		void callbackAttempt;
		void scenario;
		// A fresh record each time, because `take()` consumes it — which is the
		// real behaviour: the nonce is single-use.
		const storage = createMemoryPendingOAuthStorage();
		// `intent: 'signIn'` — the callback reads this to decide whether to sign in
		// or attach the provider to an account already signed in. A record without
		// one is refused rather than defaulted.
		storage.put({
			provider: 'github',
			intent: 'signIn',
			state: 'st_demo',
			returnTo: '/dashboard'
		});
		const api = createMockAuthDeps({ latencyMs: 400 });
		return createStore({
			initialState: createInitialOAuthCallbackState(),
			reducer: oauthCallbackReducer,
			dependencies: { completeOAuth: api.completeOAuth, pendingOAuth: storage }
		});
	});

	const callbackSession = $derived.by(() => {
		void callbackAttempt;
		void scenario;
		return makeSessionStore();
	});
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">OAuth</h2>
			<p class="text-muted-foreground">
				The fourth route into <code>sessionEstablished</code>, which has named "an OAuth callback" in
				its own doc comment since the action was written.
			</p>
		</div>
		<div
			class="bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-sky-900 dark:text-sky-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-sky-800 dark:text-sky-200 space-y-1">
				<li>✓ The nonce stored <em>before</em> the redirect, never after</li>
				<li>✓ A mismatched <code>state</code> that never reaches the backend at all</li>
				<li>✓ A cancellation shown as a branch, not a red failure banner</li>
				<li>✓ Every failure branch carrying a way out</li>
				<li>✓ An injected <code>redirect</code>, which is why this page can show it</li>
				<li>✓ No provider logos shipped — an <code>icon</code> snippet instead</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Starting</h3>
			<p class="text-muted-foreground text-sm">
				The redirect is a dependency, so this demo substitutes one that records the URL rather than
				following it. A real app passes <code>createBrowserRedirect()</code>.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Choosing a provider</CardTitle>
				<CardDescription>
					Only the pressed button reports work — a single busy flag would disable all of them and
					name none.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => {
							attempt += 1;
							wouldNavigateTo = null;
							pending = createMemoryPendingOAuthStorage();
						}}
					>
						Start over
					</button>
				</div>

				{#key attempt}
					<div class="grid gap-6 md:grid-cols-2">
						<OAuthSignIn
							flowStore={startStore}
							providers={PROVIDERS}
							returnTo="/dashboard"
							headingLevel={4}
						>
							{#snippet icon({ provider })}
								<span
									class="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold"
									>{provider.label.slice(0, 1)}</span
								>
							{/snippet}
						</OAuthSignIn>

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">Where it would have sent you</h4>
								{#if wouldNavigateTo === null}
									<p class="text-muted-foreground">Nothing yet — press a provider above.</p>
								{:else}
									<pre
										class="bg-muted rounded p-3 overflow-x-auto text-xs"><code
											>{wouldNavigateTo}</code
										></pre>
								{/if}
							</div>
							<div>
								<h4 class="font-semibold mb-1">Why no logos</h4>
								<p class="text-muted-foreground">
									Google, GitHub, Apple and Microsoft each publish brand guidelines governing the
									mark and the button wording. Shipping them would make every consumer's trademark
									compliance this library's problem. The <code>icon</code> snippet above is a stand-in
									for whatever an app already has.
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
			<h3 class="text-xl font-semibold mb-2">Coming back</h3>
			<p class="text-muted-foreground text-sm">
				Pick what the provider sends back. Every branch here has something to click — that is
				asserted in the test suite rather than left to inspection.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The callback</CardTitle>
				<CardDescription>
					A mismatched nonce never reaches the backend. The gate gates rather than reports.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					{#each SCENARIOS as option (option.id)}
						<button
							type="button"
							class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
							class:bg-accent={scenario === option.id}
							onclick={() => {
								scenario = option.id;
								callbackAttempt += 1;
								landed = null;
							}}
						>
							{option.label}
						</button>
					{/each}
				</div>

				<p class="text-muted-foreground text-sm mb-6">
					{SCENARIOS.find((s) => s.id === scenario)?.hint}
				</p>

				{#key `${scenario}-${callbackAttempt}`}
					<div class="grid gap-6 md:grid-cols-2">
						<OAuthCallback
							flowStore={callbackStore}
							sessionStore={callbackSession}
							params={callbackParams}
							headingLevel={4}
							onSuccess={({ returnTo }) => (landed = returnTo ?? '/')}
							onStartOver={() => {
								scenario = 'works';
								callbackAttempt += 1;
								landed = null;
							}}
						/>

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">Session store</h4>
								<p class="text-muted-foreground">
									Status: <code>{callbackSession.state.status}</code>
								</p>
							</div>
							<div>
								<h4 class="font-semibold mb-1">Where the app was told to go</h4>
								{#if landed === null}
									<p class="text-muted-foreground">
										Nothing yet. <code>onSuccess</code> is required precisely so a completed sign-in
										cannot leave someone parked on a callback URL.
									</p>
								{:else}
									<p class="text-muted-foreground"><code>{landed}</code></p>
								{/if}
							</div>
						</div>
					</div>
				{/key}
			</CardContent>
		</Card>
	</section>
</div>

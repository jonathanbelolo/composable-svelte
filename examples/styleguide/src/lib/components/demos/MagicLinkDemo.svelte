<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		MagicLinkRequestForm,
		MagicLinkSignIn,
		magicLinkRequestReducer,
		createInitialMagicLinkRequestState,
		magicLinkSignInReducer,
		createInitialMagicLinkSignInState,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer
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

	// --- Asking for a link ---
	let requestAttempt = $state(0);
	let sentTo = $state<string[]>([]);

	const requestStore = $derived.by(() => {
		void requestAttempt;
		return createStore({
			initialState: createInitialMagicLinkRequestState(),
			reducer: magicLinkRequestReducer,
			dependencies: { requestMagicLink: createMockAuthDeps({ latencyMs: 500 }).requestMagicLink }
		});
	});

	// --- Using one ---
	type Scenario = 'works' | 'expired' | 'noToken';

	const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
		{ id: 'works', label: 'A good link', hint: 'Press the button and the token is spent — once.' },
		{
			id: 'expired',
			label: 'Already used',
			hint: 'The button is withdrawn: pressing it again cannot help.'
		},
		{
			id: 'noToken',
			label: 'Reached directly',
			hint: 'No token in the URL at all — someone typed the address.'
		}
	];

	let scenario = $state<Scenario>('works');
	let signInAttempt = $state(0);

	// The scanner counter: how many times the exchange has actually been called.
	// A GET on this page must never increment it.
	let spends = $state(0);

	const signInStore = $derived.by(() => {
		void signInAttempt;
		const api = createMockAuthDeps({ latencyMs: 500, magicLinkTokens: ['tok_good'] });
		return createStore({
			initialState: createInitialMagicLinkSignInState(
				scenario === 'noToken' ? null : scenario === 'expired' ? 'tok_stale' : 'tok_good'
			),
			reducer: magicLinkSignInReducer,
			dependencies: {
				signInWithMagicLink: async (token: string, signal?: AbortSignal) => {
					spends += 1;
					return api.signInWithMagicLink(token, signal);
				}
			}
		});
	});

	const signInSession = $derived.by(() => {
		void signInAttempt;
		void scenario;
		return makeSessionStore();
	});
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">Magic links</h2>
			<p class="text-muted-foreground">
				The last of the four routes <code>sessionEstablished</code> names in its own doc comment, and
				the one place this package deliberately does not copy
				<code>EmailVerification</code>.
			</p>
		</div>
		<div
			class="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-amber-900 dark:text-amber-100 mb-2">
				Why there is a button
			</h3>
			<p class="text-sm text-amber-800 dark:text-amber-200">
				Corporate mail scanners and link prefetchers follow links before a person does. A
				verification link surviving that is cheap — the address gets verified, which is what the
				link was for. A <em>sign-in</em> link does not survive it: the token is spent before its
				owner ever sees the page, their link is dead on arrival, and the replacement they ask for is
				eaten the same way. A scanner issues a GET. It does not press buttons.
			</p>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Asking for one</h3>
			<p class="text-muted-foreground text-sm">
				Any address is accepted, and the confirmation says <em>if</em> that address has an account —
				because the backend resolves identically either way, and saying more would answer a question
				the design refuses to answer.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The request</CardTitle>
				<CardDescription>
					Every accepted request is reported, not just the first — asking twice for the same inbox
					is two requests.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => {
							requestAttempt += 1;
							sentTo = [];
						}}
					>
						Start over
					</button>
				</div>

				{#key requestAttempt}
					<div class="grid gap-6 md:grid-cols-2">
						<MagicLinkRequestForm
							flowStore={requestStore}
							headingLevel={4}
							onSent={(email) => (sentTo = [...sentTo, email])}
						/>

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">Requests reported</h4>
								{#if sentTo.length === 0}
									<p class="text-muted-foreground">None yet — ask for a link.</p>
								{:else}
									<ol class="text-muted-foreground list-decimal list-inside">
										{#each sentTo as email, i (i)}
											<li><code>{email}</code></li>
										{/each}
									</ol>
								{/if}
							</div>
						</div>
					</div>
				{/key}
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Using one</h3>
			<p class="text-muted-foreground text-sm">
				The counter below is incremented by the exchange itself. Loading this page never moves it.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The sign-in page</CardTitle>
				<CardDescription>
					A link that cannot work withdraws the button and offers a new one instead of failing again.
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
								signInAttempt += 1;
							}}
						>
							{option.label}
						</button>
					{/each}
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => (spends = 0)}
					>
						Reset counter
					</button>
				</div>

				<p class="text-muted-foreground text-sm mb-6">
					{SCENARIOS.find((s) => s.id === scenario)?.hint}
				</p>

				{#key `${scenario}-${signInAttempt}`}
					<div class="grid gap-6 md:grid-cols-2">
						<MagicLinkSignIn
							flowStore={signInStore}
							sessionStore={signInSession}
							email="ada@example.com"
							headingLevel={4}
							onRequestNewLink={() => {
								scenario = 'works';
								signInAttempt += 1;
							}}
						/>

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">Times the token was spent</h4>
								<p class="text-muted-foreground">
									<code>{spends}</code> — switch scenarios, reload, mount and unmount. Only a press
									moves it.
								</p>
							</div>
							<div>
								<h4 class="font-semibold mb-1">Session store</h4>
								<p class="text-muted-foreground">
									Status: <code>{signInSession.state.status}</code>
								</p>
							</div>
						</div>
					</div>
				{/key}
			</CardContent>
		</Card>
	</section>
</div>

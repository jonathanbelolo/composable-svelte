<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		ForgotPasswordForm,
		ResetPasswordForm,
		createForgotPasswordStore,
		createResetPasswordStore,
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

	const sessionStore = makeSessionStore();

	// --- Half one: asking. One backend, because there is only one behaviour. ---
	let askAttempt = $state(0);
	let lastAsked = $state<string | null>(null);
	const forgotStore = $derived.by(() => {
		void askAttempt;
		return createForgotPasswordStore(createMockAuthDeps({ latencyMs: 600 }));
	});

	// --- Half two: resetting. Four ways the link can turn out. ---
	const RESET_SCENARIOS = [
		{
			id: 'ok',
			label: 'Link works',
			token: 'fresh-token',
			note: 'The password is changed and the backend leaves the user to sign in with it. `resetPassword` resolving with `null` is a success, not a failure — the form says so and establishes no session.',
			deps: () => createMockAuthDeps({ latencyMs: 600 })
		},
		{
			id: 'signed-in',
			label: 'Link works, signs in',
			token: 'fresh-token',
			note: 'The same reset from a backend that issues a session with it. The snapshot crosses into the session store; watch the status on the right.',
			deps: () => createMockAuthDeps({ resetOutcome: 'session', latencyMs: 600 })
		},
		{
			id: 'expired',
			label: 'Link expired',
			token: 'stale-token',
			note: 'Reset links are single-use and time-limited, so this is ordinary rather than exceptional. Resubmitting cannot fix it, so the form is withdrawn rather than left up to fail again — the only useful offer is a new link.',
			deps: () => createMockAuthDeps({ expiredResetTokens: ['stale-token'], latencyMs: 500 })
		},
		{
			id: 'no-token',
			label: 'No token at all',
			token: null,
			note: 'The page was reached directly, or a mail client mangled the link. Nothing is reported as the user’s error, and no form is offered that has nothing to submit against.',
			deps: () => createMockAuthDeps()
		}
	] as const;

	let selected = $state(0);
	let resetAttempt = $state(0);
	let newLinkAsked = $state(0);
	const resetStore = $derived.by(() => {
		void resetAttempt;
		return createResetPasswordStore(
			RESET_SCENARIOS[selected]!.deps(),
			RESET_SCENARIOS[selected]!.token
		);
	});
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">Password recovery</h2>
			<p class="text-muted-foreground">
				Two surfaces — asking for a link, and using one — and the first is careful not to tell you
				anything.
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ The same answer for an address that exists and one that does not</li>
				<li>✓ Conditional wording — never "we sent you a link"</li>
				<li>✓ Success that does <em>not</em> replace the form, so a typo can be corrected</li>
				<li>✓ A dead link withdraws the form instead of inviting a retry that cannot work</li>
				<li>✓ The same password policy signup enforces, from the same module</li>
				<li>✓ <code>null</code> from the backend is a success: changed, now sign in</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Asking for a link</h3>
			<p class="text-muted-foreground text-sm">
				Try any address at all — a real-looking one and a nonsense one. The rendered text is
				identical, which is the point, and a test asserts it.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>One answer, whatever you type</CardTitle>
				<CardDescription>
					The backend will not say whether an account exists, so neither does this.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => (askAttempt += 1)}
					>
						Start over
					</button>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					{#key askAttempt}
						<ForgotPasswordForm
							flowStore={forgotStore}
							headingLevel={4}
							onSent={(email) => (lastAsked = email)}
						>
							{#snippet footer()}
								<span>Remembered it? — a link back to sign-in would go here.</span>
							{/snippet}
						</ForgotPasswordForm>
					{/key}

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">What the backend was asked</h4>
							<p class="text-muted-foreground">
								{#if lastAsked === null}
									Nothing yet.
								{:else}
									<code>{lastAsked}</code> — and it answered the same way it would for any other
									address.
								{/if}
							</p>
						</div>
						<div>
							<h4 class="font-semibold mb-1">Why the wording is hedged</h4>
							<p class="text-muted-foreground">
								"We sent you a link" would confirm the account exists. Anyone can type an address
								into this form, so that confirmation is available to anyone.
							</p>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Using a link</h3>
			<p class="text-muted-foreground text-sm">
				The token is a prop, so nothing here touches the address bar. Any password of 12 characters
				or more will do.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Four ways the link turns out</CardTitle>
				<CardDescription>Each button mounts the page over a different mock.</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					{#each RESET_SCENARIOS as scenario, index (scenario.id)}
						<button
							type="button"
							class="px-3 py-1.5 text-sm rounded-md border {selected === index
								? 'bg-primary text-primary-foreground border-primary'
								: 'hover:bg-accent'}"
							aria-pressed={selected === index}
							onclick={() => {
								selected = index;
								resetAttempt += 1;
							}}
						>
							{scenario.label}
						</button>
					{/each}
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => (resetAttempt += 1)}
					>
						Start over
					</button>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					{#key `${selected}-${resetAttempt}`}
						<ResetPasswordForm
							flowStore={resetStore}
							{sessionStore}
							headingLevel={4}
							onRequestNewLink={() => (newLinkAsked += 1)}
						/>
					{/key}

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">What this backend does</h4>
							<p class="text-muted-foreground">{RESET_SCENARIOS[selected]!.note}</p>
						</div>
						<div>
							<h4 class="font-semibold mb-1">Session store</h4>
							<p class="text-muted-foreground">
								Status: <code>{sessionStore.state.status}</code>
							</p>
						</div>
						{#if newLinkAsked > 0}
							<p class="text-muted-foreground">
								<code>onRequestNewLink</code> fired {newLinkAsked}
								{newLinkAsked === 1 ? 'time' : 'times'} — an app would route back to the form above.
							</p>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	</section>
</div>

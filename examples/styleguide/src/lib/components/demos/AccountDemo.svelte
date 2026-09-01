<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		ChangePasswordForm,
		SignOutButton,
		accountReducer,
		createInitialAccountState,
		changePasswordReducer,
		createInitialChangePasswordState,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		subjectDisplayName
	} from '@composable-svelte/auth';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '@composable-svelte/core/components/ui';

	/** Who the demo is signed in as. `display_name` is what `subjectDisplayName()` reads. */
	const DEMO_SESSION = {
		subject_id: '00000000-0000-4000-8000-000000000001',
		display_name: 'Ada Lovelace',
		roles: ['member']
	};

	type Scenario = 'hasPassword' | 'noPassword' | 'needsProof';

	const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
		{
			id: 'hasPassword',
			label: 'Has a password',
			hint: 'The ordinary case. The panel offers to change it.'
		},
		{
			id: 'noPassword',
			label: 'Signed up with OAuth',
			hint: 'No password was ever set, so the panel offers to add one.'
		},
		{
			id: 'needsProof',
			label: 'Backend wants proof',
			hint: 'The change is refused until the user confirms it is still them.'
		}
	];

	let scenario = $state<Scenario>('hasPassword');
	let attempt = $state(0);
	let demand = $state<readonly string[] | null>(null);
	let changes = $state(0);

	const deps = $derived.by(() => {
		void attempt;
		return createMockAuthDeps({
			latencyMs: 400,
			account: { hasPassword: scenario !== 'noPassword' },
			reauthenticateFor: scenario === 'needsProof' ? ['changePassword'] : []
		});
	});

	const accountStore = $derived.by(() => {
		void attempt;
		void scenario;
		return createStore({
			initialState: createInitialAccountState(),
			reducer: accountReducer,
			dependencies: { fetchAccount: deps.fetchAccount }
		});
	});

	const passwordStore = $derived.by(() => {
		void attempt;
		void scenario;
		return createStore({
			initialState: createInitialChangePasswordState(),
			reducer: changePasswordReducer,
			dependencies: { changePassword: deps.changePassword }
		});
	});

	const sessionStore = $derived.by(() => {
		void attempt;
		const store = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: createMockAuthDeps()
		});
		store.dispatch({ type: 'sessionEstablished', session: DEMO_SESSION });
		return store;
	});

	// The mount-driven read, dispatched once. The reducer refuses a second.
	$effect(() => {
		if (accountStore.state.status === 'idle') {
			accountStore.dispatch({ type: 'accountRequested' });
		}
	});

	const account = $derived(accountStore.state.account);
	const displayName = $derived(subjectDisplayName(sessionStore.state.subject));
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">Account</h2>
			<p class="text-muted-foreground">
				The first surface in this package for someone who is <em>already</em> signed in — and the
				first component that dispatches to the session store.
			</p>
		</div>
		<div
			class="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
				What it demonstrates
			</h3>
			<ul class="text-sm text-emerald-800 dark:text-emerald-200 space-y-1">
				<li>✓ A read model the session deliberately does not carry</li>
				<li>✓ "Set" or "change" decided by the account, not guessed</li>
				<li>✓ No current-password field — the client cannot know there is one</li>
				<li>✓ A demand for proof shown as a branch, not a red failure</li>
				<li>✓ Sign-out that says so when it could not reach the server</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">The account behind the session</h3>
			<p class="text-muted-foreground text-sm">
				<code>SessionSnapshot</code> carries <code>subject_id</code>, a display name and roles —
				nothing a settings page can act on. <code>fetchAccount()</code> is the separate read.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Changing a password</CardTitle>
				<CardDescription>
					The panel reads <code>hasPassword</code> and words itself accordingly. Pick a scenario to
					see each branch.
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
								attempt += 1;
								demand = null;
								changes = 0;
							}}
						>
							{option.label}
						</button>
					{/each}
				</div>

				<p class="text-muted-foreground text-sm mb-6">
					{SCENARIOS.find((s) => s.id === scenario)?.hint}
				</p>

				{#key `${scenario}-${attempt}`}
					<div class="grid gap-6 md:grid-cols-2">
						<ChangePasswordForm
							flowStore={passwordStore}
							{sessionStore}
							hasPassword={account?.hasPassword}
							headingLevel={4}
							onChanged={() => {
								changes += 1;
								// A settings panel that did not re-read would still say
								// "Set a password" after one had just been set.
								accountStore.dispatch({ type: 'reloadRequested' });
							}}
							onReauthenticationRequired={({ methods }) => (demand = methods)}
						/>

						<div class="rounded-lg border p-4 text-sm space-y-3">
							<div>
								<h4 class="font-semibold mb-1">What the account says</h4>
								{#if account === null}
									<p class="text-muted-foreground">Reading…</p>
								{:else}
									<pre class="bg-muted rounded p-3 overflow-x-auto text-xs"><code
											>{JSON.stringify(account, null, 2)}</code
										></pre>
								{/if}
							</div>
							<div>
								<h4 class="font-semibold mb-1">Proof demanded</h4>
								{#if demand === null}
									<p class="text-muted-foreground">
										Nothing yet. The backend decides — the client never asks for a current
										password, because it cannot know there is one.
									</p>
								{:else}
									<p class="text-muted-foreground">
										The backend will accept: <code>{demand.join(', ')}</code>. A real app routes to
										a prompt here.
									</p>
								{/if}
							</div>
							{#if changes > 0}
								<p class="text-muted-foreground">
									Changed {changes}
									{changes === 1 ? 'time' : 'times'}, and the account was re-read each time.
								</p>
							{/if}
						</div>
					</div>
				{/key}
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Signing out</h3>
			<p class="text-muted-foreground text-sm">
				Sign-out is fail-closed: the client goes anonymous even when the request never reached the
				server, because the cookie is HttpOnly and it cannot verify either way. Until this
				component there was nowhere to say so.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>The exit</CardTitle>
				<CardDescription>
					The first component here that both reads the session store and dispatches to it.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="space-y-3">
						<SignOutButton store={sessionStore} />
						<button
							type="button"
							class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
							onclick={() => (attempt += 1)}
						>
							Sign back in
						</button>
					</div>

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">Session store</h4>
							<p class="text-muted-foreground">
								Status: <code>{sessionStore.state.status}</code>
							</p>
							<p class="text-muted-foreground">
								Display name: <code>{displayName ?? 'none'}</code> — read with
								<code>subjectDisplayName()</code>, which until now did not exist even though the
								value was always stored.
							</p>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	</section>
</div>

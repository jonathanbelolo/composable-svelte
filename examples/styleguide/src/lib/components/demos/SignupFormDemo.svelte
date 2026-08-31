<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		SignupForm,
		PasswordCriteria,
		createSignupStore,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		PASSWORD_MIN_LENGTH
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

	// Three backends, because the interesting differences are all server-side.
	const SCENARIOS = [
		{
			id: 'verify',
			label: 'Confirmation required',
			note: 'The commoner backend: the account exists but cannot be used until the address is confirmed. There is no session to hand over, so the form replaces itself with a terminal panel and dispatches nothing.',
			deps: () => createMockAuthDeps({ signupOutcome: 'verificationRequired', latencyMs: 600 })
		},
		{
			id: 'session',
			label: 'Signed straight in',
			note: 'A backend that issues a session immediately. Identical to the sign-in handoff from here: the snapshot crosses into the session store and `onSuccess` fires once.',
			deps: () => createMockAuthDeps({ signupOutcome: 'session', latencyMs: 600 })
		},
		{
			id: 'taken',
			label: 'Address already registered',
			note: 'Signup’s characteristic failure. It arrives as `email_taken` rather than `unknown`, which is what lets the banner offer "Sign in instead" instead of only apologising.',
			deps: () =>
				createMockAuthDeps({ takenEmails: ['grace@example.com', 'ada@example.com'], latencyMs: 400 })
		}
	] as const;

	let selected = $state(0);
	let attempt = $state(0);

	const sessionStore = makeSessionStore();
	// Rebuilt whenever the scenario changes or the user asks to start over, so a
	// terminal panel is not a dead end in a demo.
	const flowStore = $derived.by(() => {
		void attempt;
		return createSignupStore(SCENARIOS[selected]!.deps());
	});

	let signInOffered = $state(0);

	// A standalone criteria list, so the rules are legible without typing.
	let sample = $state('short');
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">SignupForm</h2>
			<p class="text-muted-foreground">
				Creating an account — with two endings, because a backend that requires email confirmation
				cannot hand back a session.
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ Two terminal states, both successes — signed in, or waiting on a mail</li>
				<li>✓ <code>email_taken</code> as its own arm, so the banner can offer a way out</li>
				<li>✓ A criteria checklist derived from the same schema that validates</li>
				<li>✓ Length-only policy, per NIST 800-63B — no <code>Passw0rd!</code> rules</li>
				<li>✓ The confirm mismatch appears on blur, and clears when you fix either field</li>
				<li>✓ Requirements phrased as requirements, never as failures</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">One backend at a time</h3>
			<p class="text-muted-foreground text-sm">
				Use <code>grace@example.com</code> to hit the taken-address branch. Any password of
				{PASSWORD_MIN_LENGTH} characters or more will do.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Three backends</CardTitle>
				<CardDescription>
					Each button mounts a form over a different mock, so the branch is reachable without a
					server.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap gap-2 mb-6">
					{#each SCENARIOS as scenario, index (scenario.id)}
						<button
							type="button"
							class="px-3 py-1.5 text-sm rounded-md border {selected === index
								? 'bg-primary text-primary-foreground border-primary'
								: 'hover:bg-accent'}"
							aria-pressed={selected === index}
							onclick={() => {
								selected = index;
								attempt += 1;
							}}
						>
							{scenario.label}
						</button>
					{/each}
					<button
						type="button"
						class="px-3 py-1.5 text-sm rounded-md border hover:bg-accent"
						onclick={() => (attempt += 1)}
					>
						Start over
					</button>
				</div>

				<div class="grid gap-6 md:grid-cols-2">
					{#key `${selected}-${attempt}`}
						<SignupForm
							{flowStore}
							{sessionStore}
							headingLevel={4}
							onSignIn={() => (signInOffered += 1)}
						>
							{#snippet footer()}
								<span>Already have an account? — a link would go here.</span>
							{/snippet}
						</SignupForm>
					{/key}

					<div class="rounded-lg border p-4 text-sm space-y-3">
						<div>
							<h4 class="font-semibold mb-1">What this backend does</h4>
							<p class="text-muted-foreground">{SCENARIOS[selected]!.note}</p>
						</div>
						<div>
							<h4 class="font-semibold mb-1">Session store</h4>
							<p class="text-muted-foreground">
								Status: <code>{sessionStore.state.status}</code>
								{#if sessionStore.state.subject.kind === 'authenticated'}
									— signed in
								{/if}
							</p>
						</div>
						{#if signInOffered > 0}
							<p class="text-muted-foreground">
								<code>onSignIn</code> fired {signInOffered}
								{signInOffered === 1 ? 'time' : 'times'} — an app would route to /login.
							</p>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">PasswordCriteria</h3>
			<p class="text-muted-foreground text-sm">
				Derived from the same constants the schema validates against, so it cannot say "done" while
				the form disagrees. Unmet is neutral, not red — nothing has gone wrong halfway through
				typing a password.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>On its own</CardTitle>
				<CardDescription>Type below and watch the marks, not an error message.</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="max-w-sm space-y-4">
					<div class="space-y-2">
						<label class="text-sm font-medium" for="criteria-sample">Try a password</label>
						<input
							id="criteria-sample"
							type="text"
							class="w-full px-3 py-2 text-sm rounded-md border bg-background"
							bind:value={sample}
							aria-describedby="criteria-sample-list"
						/>
					</div>
					<PasswordCriteria id="criteria-sample-list" password={sample} />
				</div>
			</CardContent>
		</Card>
	</section>
</div>

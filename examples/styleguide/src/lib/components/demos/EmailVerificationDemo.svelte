<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		EmailVerification,
		createEmailVerificationStore,
		createMockAuthDeps,
		createInitialSessionState,
		sessionReducer,
		tokenFromUrl
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

	const SCENARIOS = [
		{
			id: 'verified',
			label: 'Link works',
			token: 'fresh-token',
			note: 'Confirmed, and the backend issued no session — the address is verified and the user still has to sign in. That `null` is a success, not a failure, and the panel offers the way forward.',
			deps: () => createMockAuthDeps({ latencyMs: 700 })
		},
		{
			id: 'signed-in',
			label: 'Link works, signs in',
			token: 'fresh-token',
			note: 'The same confirmation, from a backend that signs the account in while confirming it. The snapshot crosses into the session store; watch the status on the right.',
			deps: () => createMockAuthDeps({ verifyOutcome: 'session', latencyMs: 700 })
		},
		{
			id: 'expired',
			label: 'Link expired',
			token: 'stale-token',
			note: 'The ordinary case, not the exceptional one — a link opened a week late. The recovery is a resend rather than a retry, and a successful resend deliberately leaves the dead-link message alone: that link is still dead.',
			deps: () => createMockAuthDeps({ expiredTokens: ['stale-token'], latencyMs: 500 })
		},
		{
			id: 'no-token',
			label: 'No token at all',
			token: null,
			note: 'Someone reached the page directly, or a mail client mangled the link. Not an error — there is nothing to report, only something to offer.',
			deps: () => createMockAuthDeps()
		}
	] as const;

	let selected = $state(0);
	let attempt = $state(0);
	let signInOffered = $state(0);

	const sessionStore = makeSessionStore();
	const flowStore = $derived.by(() => {
		void attempt;
		return createEmailVerificationStore(SCENARIOS[selected]!.deps(), 'ada@example.com');
	});

	// Shows the helper doing its one job, without touching window.location.
	const sampleUrl = 'https://app.example.com/verify?token=abc123';
</script>

<div class="space-y-12">
	<section class="space-y-4">
		<div>
			<h2 class="text-2xl font-bold mb-2">EmailVerification</h2>
			<p class="text-muted-foreground">
				The page a confirmation link lands on — no form, and the work starts on mount.
			</p>
		</div>
		<div
			class="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4"
		>
			<h3 class="font-semibold text-purple-900 dark:text-purple-100 mb-2">What it demonstrates</h3>
			<ul class="text-sm text-purple-800 dark:text-purple-200 space-y-1">
				<li>✓ Confirming and resending tracked separately — both can be true at once</li>
				<li>✓ A single-use token exchanged once, guarded in the component and the reducer</li>
				<li>✓ <code>null</code> from the backend is a success: verified, not signed in</li>
				<li>✓ A successful resend does not pretend the dead link came back to life</li>
				<li>✓ No token is a state to render, not an error to report</li>
				<li>✓ Focus moves to the panel when it replaces what was there</li>
			</ul>
		</div>
	</section>

	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Four ways a link arrives</h3>
			<p class="text-muted-foreground text-sm">
				Each button mounts the page over a different mock. Nothing here touches the address bar —
				the token is a prop.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Landing on the link</CardTitle>
				<CardDescription>Work starts on mount, so switching scenario re-runs it.</CardDescription>
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
						<EmailVerification
							{flowStore}
							{sessionStore}
							token={SCENARIOS[selected]!.token}
							headingLevel={4}
							onSignIn={() => (signInOffered += 1)}
						/>
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
			<h3 class="text-xl font-semibold mb-2">tokenFromUrl</h3>
			<p class="text-muted-foreground text-sm">
				A convenience, not a requirement. It takes a full URL rather than reading
				<code>window.location</code>, so it works on a server and in a test, and it treats
				<code>?token=</code> — what a mail client mangling a link produces — as a missing token
				rather than an empty one.
			</p>
		</div>

		<Card>
			<CardHeader>
				<CardTitle>What it returns</CardTitle>
				<CardDescription>Including the cases that would otherwise throw on mount.</CardDescription>
			</CardHeader>
			<CardContent>
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b">
							<th class="text-left py-2 font-semibold">Input</th>
							<th class="text-left py-2 font-semibold">Result</th>
						</tr>
					</thead>
					<tbody class="font-mono text-xs">
						{#each [sampleUrl, 'https://app.example.com/verify?token=', 'https://app.example.com/verify', 'not a url', ''] as input (input)}
							<tr class="border-b">
								<td class="py-2 pr-4 break-all">{input === '' ? '(empty string)' : input}</td>
								<td class="py-2">{JSON.stringify(tokenFromUrl(input))}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</CardContent>
		</Card>
	</section>
</div>

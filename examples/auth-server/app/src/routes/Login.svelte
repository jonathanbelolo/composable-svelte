<script lang="ts">
	import {
		LoginForm,
		MfaChallengeForm,
		createLoginStore,
		createMfaChallengeStore
	} from '@composable-svelte/auth';
	import type { MfaMethod } from '@composable-svelte/auth';

	import { deps, go, session } from '../deps.js';

	const login = createLoginStore(deps);
	const challengeStore = createMfaChallengeStore(deps);

	/**
	 * The second factor is a *branch*, not a failure.
	 *
	 * `mfa_required` means the password was right. Without somewhere to send it,
	 * the user is told to enter a code with nowhere to enter one.
	 */
	let challenge = $state<{ challengeId: string; methods: readonly MfaMethod[] } | null>(null);
</script>

{#if challenge === null}
	<LoginForm
		flowStore={login}
		sessionStore={session}
		onSuccess={() => go('/')}
		onMfaRequired={(c) => (challenge = c)}
	/>
{:else}
	<MfaChallengeForm
		flowStore={challengeStore}
		sessionStore={session}
		{challenge}
		onSuccess={() => go('/')}
		onStartOver={() => (challenge = null)}
	/>
{/if}

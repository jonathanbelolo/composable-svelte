<script lang="ts">
	/**
	 * A surface whose token changes — a second link opened while the first is
	 * still being exchanged. Rare, and it used to lose the second one forever.
	 */
	import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
	import type {
		EmailVerificationAction,
		EmailVerificationState
	} from '../../src/lib/flows/email-verification/types.js';
	import type { SessionAction } from '../../src/lib/session/types.js';

	let {
		flowStore,
		sessionStore,
		initialToken
	}: {
		flowStore: {
			readonly state: EmailVerificationState;
			dispatch(action: EmailVerificationAction): void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		initialToken: string;
	} = $props();

	let token = $state(initialToken);
	export function swap(next: string) {
		token = next;
	}
</script>

<EmailVerification {flowStore} {sessionStore} {token} />

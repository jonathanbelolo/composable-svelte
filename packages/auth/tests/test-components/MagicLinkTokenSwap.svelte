<script lang="ts">
	/**
	 * A surface whose token arrives after mount — a router resolving its
	 * parameters, or a link opened into an already-running app.
	 *
	 * `MagicLinkSignIn` shipped with no `token` prop at all, so `tokenProvided`
	 * had no caller anywhere and this case had no way in.
	 */
	import MagicLinkSignIn from '../../src/lib/components/MagicLinkSignIn.svelte';
	import type {
		MagicLinkSignInAction,
		MagicLinkSignInState
	} from '../../src/lib/flows/magic-link-signin/types.js';
	import type { SessionAction } from '../../src/lib/session/types.js';

	let {
		flowStore,
		sessionStore,
		initialToken
	}: {
		flowStore: {
			readonly state: MagicLinkSignInState;
			dispatch(action: MagicLinkSignInAction): void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		initialToken: string | null;
	} = $props();

	let token = $state(initialToken);
	export function swap(next: string) {
		token = next;
	}
</script>

<MagicLinkSignIn {flowStore} {sessionStore} {token} onRequestNewLink={() => {}} />

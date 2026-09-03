<script lang="ts">
	/**
	 * Keeps a session alive, and notices when it is not.
	 *
	 * Renders nothing by default. It exists because the hand-off has to cross
	 * from the refresh flow to the session store, and a required prop makes a
	 * forgotten wiring a compile error where a documented convention would fail
	 * silently.
	 *
	 * **There is no bearer token here and there must not be one.** The session
	 * cookie is HttpOnly and server-owned; a refresh token reachable by
	 * JavaScript is exfiltrable by any XSS, which is exactly what that design
	 * avoids. "Refresh" here means asking the server to extend the session it
	 * already owns.
	 *
	 * The timer lives in the flow's own `Effect.subscription`, not here — all
	 * auth I/O lives in store effects, and that effect is cancellable by id with
	 * cleanup on store destroy.
	 *
	 * Pattern A: it animates nothing, and usually renders nothing.
	 */
	import type { Snippet } from 'svelte';

	import type {
		SessionRefreshAction,
		SessionRefreshState
	} from '../flows/session-refresh/types.js';
	import type { SessionAction, SessionState } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: SessionRefreshState;
			dispatch(action: SessionRefreshAction): void;
		};
		sessionStore: {
			readonly state: SessionState;
			dispatch(action: SessionAction): void;
		};
		/** Rendered when the backend says the session is gone. */
		ended?: Snippet | undefined;
	}

	let { flowStore, sessionStore, ended }: Props = $props();

	/**
	 * Start and stop the watch with this component.
	 *
	 * A second `watchStarted` cannot double-run the timer — the store cancels an
	 * existing subscription with the same id before starting another — but
	 * stopping on unmount is still what keeps a navigated-away page from
	 * holding one.
	 */
	$effect(() => {
		flowStore.dispatch({ type: 'watchStarted' });
		return () => flowStore.dispatch({ type: 'watchStopped' });
	});

	/**
	 * The last expiry actually reported.
	 *
	 * Not `$state`: nothing renders from it, and making it reactive would put
	 * the effect below in a loop with itself. Reporting only a *change* is what
	 * stops the effect re-dispatching every time the store settles.
	 */
	let lastObserved: string | null | undefined = undefined;

	$effect(() => {
		const current = sessionStore.state.expiresAt;
		if (current === lastObserved) return;
		lastObserved = current;
		flowStore.dispatch({ type: 'expiryObserved', expiresAt: current });
	});

	/** Whether this ending has been reported. Cleared when the flow leaves `ended`. */
	let reportedEnding = false;

	$effect(() => {
		if (flowStore.state.status !== 'ended') {
			reportedEnding = false;
			return;
		}
		if (reportedEnding) return;
		reportedEnding = true;
		// `resolveSession`, not `logout`: the 401 may have come from a proxy, and
		// a resolve fails closed to anonymous anyway — where a logout would POST
		// to a session that may still be alive.
		sessionStore.dispatch({ type: 'resolveSession' });
	});
</script>

{#if flowStore.state.status === 'ended' && ended}
	{@render ended()}
{/if}

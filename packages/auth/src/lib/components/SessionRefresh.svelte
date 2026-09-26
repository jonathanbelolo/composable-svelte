<script module lang="ts">
	/**
	 * Active client attachments tracked per store or presentation view target.
	 *
	 * Starts the watch only when the first client attachment mounts, and stops it
	 * only when the last relevant attachment retires or unmounts. This prevents
	 * duplicate timer subscriptions when multiple components are mounted, and
	 * prevents an old owner's unmount cleanup from prematurely stopping a replacement.
	 */
	const attachmentCounts = new WeakMap<object, number>();
</script>

<script lang="ts">
	/**
	 * Keeps a session alive, and notices when it is not.
	 *
	 * Subscribes to the server session via `refreshSession` on a regular cadence,
	 * advancing expiry before it lapses. When the server reports the session is
	 * gone (`invalid_credentials`), it triggers session resolution (`resolveSession`)
	 * to reconcile the session with the server.
	 *
	 * The watch polls via a fixed interval (`tickMs`) gated on the advertised
	 * expiry (refreshing `leadMs` ahead of time). It also respects tab visibility:
	 * hidden tabs pause the timer to conserve resources and battery, re-checking
	 * immediately upon returning to visible.
	 *
	 * In managed mode (`mode="managed"`), accepts a genuine `PresentationView`
	 * port from `createAuthFeature`'s `sessionRefreshSlot`. The parent feature
	 * owns session lifetime, updates expiry truthfully, and reconciles
	 * `invalid_credentials` via `resolveSession`. Managed mode forbids standalone
	 * session mutation authority (`sessionStore`).
	 *
	 * The timer lives in the flow's own `Effect.subscription`, not here — all
	 * auth I/O lives in store effects, and that effect is cancellable by id with
	 * cleanup on store destroy.
	 *
	 * Pattern A: it animates nothing, and usually renders nothing.
	 */
	import type { PresentationView } from '@composable-svelte/core/application';
	import { untrack, type Snippet } from 'svelte';

	import type {
		SessionRefreshAction,
		SessionRefreshState
	} from '../flows/session-refresh/types.js';
	import type { SessionAction, SessionState } from '../session/types.js';

	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
		flowStore: {
			readonly state: SessionRefreshState;
			dispatch(action: SessionRefreshAction): void;
		};
		sessionStore: {
			readonly state: SessionState;
			dispatch(action: SessionAction): void;
		};
		store?: never;
	}

	interface ManagedBindingWithFlowStore {
		mode: 'managed';
		flowStore: PresentationView<SessionRefreshState, SessionRefreshAction>;
		store?: never;
		sessionStore?: never;
	}

	interface ManagedBindingWithStore {
		mode: 'managed';
		store: PresentationView<SessionRefreshState, SessionRefreshAction>;
		flowStore?: never;
		sessionStore?: never;
	}

	type ManagedBinding = ManagedBindingWithFlowStore | ManagedBindingWithStore;

	interface PresentationProps {
		/** Rendered when the backend says the session is gone. */
		ended?: Snippet | undefined;
	}

	type Props = PresentationProps & (StandaloneBinding | ManagedBinding);

	let {
		ended,
		...binding
	}: Props = $props();

	type TargetStore =
		| { readonly state: SessionRefreshState; dispatch(action: SessionRefreshAction): void }
		| PresentationView<SessionRefreshState, SessionRefreshAction>;

	type Owner = symbol | PresentationView<SessionRefreshState, SessionRefreshAction>;
	const standaloneOwner = Symbol('standalone');
	const owner: Owner = $derived(
		binding.mode === 'managed' ? (binding.store ?? binding.flowStore) : standaloneOwner
	);
	const viewOf = (key: Owner): TargetStore | undefined =>
		typeof key === 'symbol'
			? (binding.mode === 'managed' ? undefined : binding.flowStore)
			: key;

	const activeStore: TargetStore | undefined = $derived(
		binding.mode === 'managed'
			? (binding.store ?? binding.flowStore)
			: binding.flowStore
	);

	const flow: SessionRefreshState | undefined = $derived(activeStore?.state);

	/**
	 * Start and stop the watch with this component's client attachment.
	 *
	 * Starts the watch only when the first client attachment mounts, and stops it
	 * only when the last relevant attachment retires/unmounts.
	 *
	 * A replacement owner gets a fresh attachment count and starts its watch
	 * without old-owner cleanup stopping it.
	 *
	 * In SSR, `$effect` never runs, ensuring zero timer or network work.
	 */
	$effect(() => {
		const currentOwner = owner;
		const store = viewOf(currentOwner);
		if (!store) return;
		if (untrack(() => store.state) === undefined) return;

		const count = attachmentCounts.get(store) ?? 0;
		attachmentCounts.set(store, count + 1);
		if (count === 0) {
			store.dispatch({ type: 'watchStarted' });
		}
		return () => {
			const remaining = (attachmentCounts.get(store) ?? 1) - 1;
			if (remaining <= 0) {
				attachmentCounts.delete(store);
				store.dispatch({ type: 'watchStopped' });
			} else {
				attachmentCounts.set(store, remaining);
			}
		};
	});

	/**
	 * Standalone only: forward sessionStore expiry changes to the flow.
	 */
	let lastObserved: string | null | undefined = undefined;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const current = binding.sessionStore.state.expiresAt;
		if (current === lastObserved) return;
		lastObserved = current;
		binding.flowStore.dispatch({ type: 'expiryObserved', expiresAt: current });
	});

	/**
	 * Standalone only: report ending via resolveSession.
	 */
	let reportedEnding = false;

	$effect(() => {
		if (binding.mode === 'managed') return;
		if (binding.flowStore.state.status !== 'ended') {
			reportedEnding = false;
			return;
		}
		if (reportedEnding) return;
		reportedEnding = true;
		// `resolveSession`, not `logout`: the 401 may have come from a proxy, and
		// a resolve fails closed to anonymous anyway — where a logout would POST
		// to a session that may still be alive.
		binding.sessionStore.dispatch({ type: 'resolveSession' });
	});
</script>

{#if flow}
	{#each [owner] as key (key)}
		{#if flow.status === 'ended' && ended}
			{@render ended()}
		{/if}
	{/each}
{/if}

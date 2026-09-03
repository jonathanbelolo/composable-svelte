<script lang="ts">
	/**
	 * `DeleteAccountPanel` with a consumer-supplied `confirm` snippet.
	 *
	 * The seam exists so an app that *has* wired Tailwind can render core's
	 * `AlertDialog` — or anything else — in place of the inline confirmation.
	 * A snippet cannot be passed from a plain `mount()` call, so the assertion
	 * that the inline markup steps aside needs a real component to live in.
	 */
	import DeleteAccountPanel from '../../src/lib/components/DeleteAccountPanel.svelte';
	import type { DeleteAccountAction, DeleteAccountState } from '../../src/lib/flows/delete-account/types.js';
	import type { SessionAction } from '../../src/lib/session/types.js';

	interface Props {
		store: { readonly state: DeleteAccountState; dispatch(action: DeleteAccountAction): void };
		sessionStore: { dispatch(action: SessionAction): void };
	}

	let { store, sessionStore }: Props = $props();
</script>

<DeleteAccountPanel {store} {sessionStore} email="ada@example.com">
	{#snippet confirm({ confirm: onConfirm, cancel, busy })}
		<div data-testid="custom-confirm">
			<button type="button" disabled={busy} onclick={cancel}>Never mind</button>
			<button type="button" disabled={busy} onclick={onConfirm}>Yes, wipe it</button>
		</div>
	{/snippet}
</DeleteAccountPanel>

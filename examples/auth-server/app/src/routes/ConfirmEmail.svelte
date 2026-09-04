<script lang="ts">
	/**
	 * The page an email-change link opens.
	 *
	 * **Not under `/auth`** — Vite proxies `/auth`, `/provider` and `/__test__`
	 * to the fixture, so a route there would be swallowed and never reach this
	 * page. The same reason the OAuth callback lives at `/callback`.
	 *
	 * Confirming needs a live session, so the signed-out case is a real branch
	 * here rather than a hypothetical: open the link on a device that is not
	 * signed in and the server answers 401. `onSignIn` is where that goes.
	 */
	import { EmailChangeConfirmation, createChangeEmailConfirmStore } from '@composable-svelte/auth';

	import { deps, go, queryParam } from '../deps.js';

	const confirm = createChangeEmailConfirmStore(deps);
	const token = queryParam('token');
</script>

<h1>Confirm your new address</h1>

<EmailChangeConfirmation
	flowStore={confirm}
	{token}
	onSignIn={() => go('/login')}
	onConfirmed={() => go('/settings')}
/>

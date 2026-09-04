<script lang="ts">
	import { ForgotPasswordForm, createForgotPasswordStore } from '@composable-svelte/auth';

	import { deps } from '../deps.js';

	const forgot = createForgotPasswordStore(deps);
</script>

<!--
	Succeeds for every address, including ones with no account. Saying otherwise
	would turn this form into an account checker.
-->
<ForgotPasswordForm flowStore={forgot} />

<script lang="ts">
	import { MagicLinkRequestForm, createMagicLinkRequestStore } from '@composable-svelte/auth';

	import { deps } from '../deps.js';

	const request = createMagicLinkRequestStore(deps);
</script>

<MagicLinkRequestForm flowStore={request} />

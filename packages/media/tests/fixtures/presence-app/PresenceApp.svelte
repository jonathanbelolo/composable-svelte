<script lang="ts">
	import { ApplicationRoot, ApplicationHost } from '@composable-svelte/core/application';
	import { definition } from './PresenceModel.js';
	import Panel from './Panel.svelte';
</script>
<ApplicationRoot definition={definition as never} options={{ dependencies: {}, initial: { input: undefined } } as never}>
	{#snippet children(app)}
		<ApplicationHost {app}><Panel store={(app as never as { store: never }).store} /></ApplicationHost>
	{/snippet}
</ApplicationRoot>

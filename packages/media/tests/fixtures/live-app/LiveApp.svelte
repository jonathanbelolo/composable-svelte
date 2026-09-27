<script lang="ts">
	import { ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet, type ApplicationInstance } from '@composable-svelte/core/application';
	import { definition, plan, type LiveState, type LiveAction, type LiveDeps } from './LiveModel.js';
	let { url, dependencies, onApp }: { url: string; dependencies: LiveDeps; onApp: (app: ApplicationInstance<LiveState, LiveAction>) => void } = $props();
</script>
<ApplicationRoot {definition} options={{ dependencies, initial: { input: url, url } }}>
	{#snippet children(app)}
		{@const observed = onApp(app)}
		<ApplicationHost {app}>
			<FeatureViews store={app.store} definition={plan}>
				{#snippet children(views)}<FeatureOutlet view={views.page} />{/snippet}
			</FeatureViews>
		</ApplicationHost>
	{/snippet}
</ApplicationRoot>

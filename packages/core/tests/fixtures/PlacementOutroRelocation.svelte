<script lang="ts">
	import { fade } from 'svelte/transition';
	import {
		ApplicationHost,
		ApplicationRoot,
		FeatureOutlet,
		FeatureViews,
		defineApplication,
		defineViews,
		type ApplicationInstance
	} from '../../src/lib/application/index.js';
	import type { TargetRegistry } from '../../src/lib/application/renderer/target-registry.js';
	import { composition, initial, type Action, type Root } from './FeatureViewsModel.js';
	import RegistryProbe from './PlacementRegistry.svelte';
	import PlacementStructureRow from './PlacementStructureRow.svelte';

	type Location = 'first' | 'second';
	type Phase = 'introstart' | 'outrostart' | 'outroend';

	let {
		count = 2,
		duration = 60_000,
		onRegistry = () => {},
		onApp = () => {},
		onTransition = () => {}
	}: {
		count?: number | undefined;
		duration?: number | undefined;
		onRegistry?: ((registry: TargetRegistry) => void) | undefined;
		onApp?: ((app: ApplicationInstance<Root, Action>) => void) | undefined;
		onTransition?: ((location: Location, phase: Phase) => void) | undefined;
	} = $props();

	const application = defineApplication(composition, {
		initialState: (rowCount: number) => ({
			...initial(0),
			rows: Array.from({ length: rowCount }, (_, index) => ({
				id: index + 1,
				state: { name: `row${index + 1}`, count: index + 1 }
			}))
		})
	});
	const views = defineViews(composition, {
		workspace: { headless: true },
		worker: { headless: true },
		rows: { render: PlacementStructureRow }
	});
	const report = (location: Location) => (event: Event) =>
		onTransition(location, event.type as Phase);
	const first = report('first');
	const second = report('second');
	let alternate = $state(false);
</script>

<ApplicationRoot
	definition={application}
	options={{ dependencies: { step: 1, trace: [] }, initial: { input: count } }}
>
	{#snippet children(app)}
		{@const observed = onApp(app)}
		<ApplicationHost {app}>
			<RegistryProbe inspect={onRegistry} />
			<button type="button" data-move onclick={() => (alternate = !alternate)}>Move rows</button>
			<FeatureViews store={app.store} definition={views}>
				{#snippet children(handles)}
					{#if alternate}
						<ul
							data-structure-list
							data-location="second"
							transition:fade={{ duration }}
							onintrostart={second}
							onoutrostart={second}
							onoutroend={second}
						>
							<FeatureOutlet view={handles.rows} />
						</ul>
					{:else}
						<ul
							data-structure-list
							data-location="first"
							transition:fade={{ duration }}
							onintrostart={first}
							onoutrostart={first}
							onoutroend={first}
						>
							<FeatureOutlet view={handles.rows} />
						</ul>
					{/if}
				{/snippet}
			</FeatureViews>
		</ApplicationHost>
	{/snippet}
</ApplicationRoot>

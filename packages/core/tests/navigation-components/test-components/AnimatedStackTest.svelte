<script lang="ts">
	/**
	 * Renders `AnimatedNavigationStack` with a children snippet that labels each
	 * screen, so the previous-screen layer is observable in the DOM.
	 */
	import AnimatedNavigationStack from '../../../src/lib/navigation-components/AnimatedNavigationStack.svelte';
	import type { PresentationState } from '../../../src/lib/navigation/types.js';
	import type { ScopedDestinationStore } from '../../../src/lib/navigation/scope-to-destination.js';

	interface Screen {
		id: string;
		title: string;
	}

	interface Props {
		store: ScopedDestinationStore<unknown, unknown> | null;
		stack: readonly Screen[];
		presentation: PresentationState<any>;
	}

	let { store, stack, presentation }: Props = $props();
</script>

<AnimatedNavigationStack {store} {stack} {presentation} onBack={() => {}}>
	{#snippet children({ currentScreen })}
		<div data-testid="screen" data-screen-id={(currentScreen as Screen | undefined)?.id}>
			{(currentScreen as Screen | undefined)?.title ?? 'none'}
		</div>
	{/snippet}
</AnimatedNavigationStack>

<script lang="ts">
	import NavigationStack from '@composable-svelte/core/navigation-components/NavigationStack.svelte';
	import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
	import { createStore } from '@composable-svelte/core/store.svelte.js';
	import { scopeToDestination } from '@composable-svelte/core/navigation/scope-to-destination.js';
	import { Effect } from '@composable-svelte/core/effect.js';

	// ============================================================================
	// Demo State & Store Setup
	// ============================================================================

	interface ScreenState {
		id: string;
		title: string;
		content: string;
		color: string;
	}

	interface DemoState {
		destination: { type: 'stack'; state: { stack: ScreenState[] } } | null;
	}

	type DemoAction =
		| { type: 'show' }
		| { type: 'pushScreen'; screen: ScreenState }
		| { type: 'popScreen' }
		| { type: 'destination'; action: any };

	const demoStore = createStore<DemoState, DemoAction>({
		initialState: {
			destination: {
				type: 'stack',
				state: {
					stack: [
						{
							id: '1',
							title: 'Home',
							content: 'Welcome to the navigation stack demo. Push screens to see the stack in action.',
							color: 'bg-blue-50 dark:bg-blue-950'
						}
					]
				}
			}
		},
		reducer: (state, action) => {
			switch (action.type) {
				case 'pushScreen':
					if (state.destination?.type === 'stack') {
						return [
							{
								...state,
								destination: {
									...state.destination,
									state: {
										stack: [...state.destination.state.stack, action.screen]
									}
								}
							},
							Effect.none()
						];
					}
					return [state, Effect.none()];

				case 'popScreen':
					if (state.destination?.type === 'stack') {
						const currentStack = state.destination.state.stack;
						// Don't pop if only one screen remains (stack must have at least 1 screen)
						if (currentStack.length <= 1) {
							return [state, Effect.none()];
						}
						const newStack = currentStack.slice(0, -1);
						return [
							{
								...state,
								destination: {
									...state.destination,
									state: { stack: newStack }
								}
							},
							Effect.none()
						];
					}
					return [state, Effect.none()];

				default:
					return [state, Effect.none()];
			}
		}
	});

	const scopedStore = scopeToDestination(demoStore, ['destination'], 'stack', 'destination');

	// ============================================================================
	// Demo Screens
	// ============================================================================

	const demoScreens: ScreenState[] = [
		{
			id: '2',
			title: 'Profile',
			content: 'View and edit your profile information. Push another screen to go deeper.',
			color: 'bg-green-50 dark:bg-green-950'
		},
		{
			id: '3',
			title: 'Settings',
			content: 'Adjust your preferences and account settings.',
			color: 'bg-purple-50 dark:bg-purple-950'
		},
		{
			id: '4',
			title: 'Notifications',
			content: 'Manage your notification preferences and view recent alerts.',
			color: 'bg-orange-50 dark:bg-orange-950'
		},
		{
			id: '5',
			title: 'Privacy',
			content: 'Control your privacy settings and data sharing preferences.',
			color: 'bg-pink-50 dark:bg-pink-950'
		}
	];

	function pushScreen(screen: ScreenState) {
		demoStore.dispatch({ type: 'pushScreen', screen });
	}

	function popScreen() {
		demoStore.dispatch({ type: 'popScreen' });
	}

	const currentStack = $derived(demoStore.state.destination?.state.stack ?? []);
	const currentScreen = $derived(currentStack[currentStack.length - 1]);
	const stackDepth = $derived(currentStack.length);
</script>

<div class="space-y-12">
	<!-- Live Demo Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">
				Push and pop screens to experience stack-based navigation
			</p>
		</div>

		<!-- Stack Visualization -->
		<div class="rounded-lg border-2 bg-card p-4">
			<div class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
				<span class="font-medium">Stack Depth:</span>
				<span class="px-2 py-1 bg-primary/10 text-primary rounded">{stackDepth}</span>
				<span class="flex-1"></span>
				<div class="flex gap-1">
					{#each currentStack as screen, i (screen.id)}
						<div
							class="w-8 h-8 rounded flex items-center justify-center text-xs font-medium"
							class:bg-primary={i === currentStack.length - 1}
							class:text-primary-foreground={i === currentStack.length - 1}
							class:bg-muted={i !== currentStack.length - 1}
							class:text-muted-foreground={i !== currentStack.length - 1}
						>
							{i + 1}
						</div>
					{/each}
				</div>
			</div>

			<!-- Navigation Stack Component -->
			<div class="h-[500px] rounded-lg border bg-background">
				<NavigationStack store={scopedStore} stack={currentStack} onBack={popScreen}>
					{#snippet children({ currentScreen })}
						{#if currentScreen}
							<div class="h-full {currentScreen.color} p-8 space-y-6">
								<div class="space-y-2">
									<h2 class="text-3xl font-bold">{currentScreen.title}</h2>
									<p class="text-muted-foreground">{currentScreen.content}</p>
								</div>

								<div class="space-y-4">
									<div class="p-4 bg-background/50 rounded-lg border">
										<p class="text-sm">
											<strong>Screen ID:</strong>
											{currentScreen.id}
										</p>
										<p class="text-sm">
											<strong>Stack Position:</strong>
											{stackDepth} / {stackDepth}
										</p>
									</div>

									{#if stackDepth < 5}
										<div class="space-y-2">
											<p class="text-sm font-medium">Push another screen:</p>
											<div class="flex flex-wrap gap-2">
												{#each demoScreens.slice(stackDepth - 1, stackDepth + 2) as screen}
													<Button variant="default" size="sm" onclick={() => pushScreen(screen)}>
														{screen.title} →
													</Button>
												{/each}
											</div>
										</div>
									{:else}
										<div class="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
											<p class="text-sm text-yellow-900 dark:text-yellow-100">
												Maximum stack depth reached. Use the back button to return to previous screens.
											</p>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/snippet}
				</NavigationStack>
			</div>
		</div>
	</section>

	<!-- Description -->
	<section class="space-y-4">
		<h3 class="text-xl font-semibold">Usage</h3>
		<div class="prose prose-sm dark:prose-invert">
			<p>
				The Navigation Stack component provides iOS-style stack-based navigation. Perfect for
				hierarchical flows, multi-step processes, and drill-down interfaces. Key features include:
			</p>
			<ul>
				<li>Automatic back button management based on stack depth</li>
				<li>Instant screen transitions (no lifecycle animations)</li>
				<li>Built-in header with back navigation</li>
				<li>Flexible content rendering via children snippet</li>
				<li>Customizable styling and layout options</li>
			</ul>
		</div>
	</section>

	<!-- Features Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Key Features</h3>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">📚</div>
				<h4 class="font-semibold">Stack Management</h4>
				<p class="text-sm text-muted-foreground">
					Automatically manages screen history with push/pop semantics. Back button appears when
					stack depth > 1.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">⚡</div>
				<h4 class="font-semibold">Instant Transitions</h4>
				<p class="text-sm text-muted-foreground">
					Screens switch instantly with no animations - the correct UX for stack navigation,
					matching native mobile patterns.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🎨</div>
				<h4 class="font-semibold">Flexible Styling</h4>
				<p class="text-sm text-muted-foreground">
					Customize container, header, and content styles. Or use unstyled mode for complete
					control.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🔄</div>
				<h4 class="font-semibold">State-Driven</h4>
				<p class="text-sm text-muted-foreground">
					Fully controlled by your state - stack array determines what renders. Integrate with any
					state management.
				</p>
			</div>
		</div>
	</section>

	<!-- Use Cases Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Multi-Step Wizards</h4>
				<p class="text-sm text-muted-foreground">
					Onboarding flows, checkout processes, and form wizards with back navigation.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Drill-Down Navigation</h4>
				<p class="text-sm text-muted-foreground">
					Category browsing, file explorers, and hierarchical data navigation.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Settings Screens</h4>
				<p class="text-sm text-muted-foreground">
					Nested settings pages with natural back navigation between sections.
				</p>
			</div>
		</div>
	</section>

	<!-- Best Practices -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Best Practices</h3>
		</div>

		<div class="space-y-4">
			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">When to Use Navigation Stack</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Users need to drill down into hierarchical data</li>
					<li>Multi-step processes where users might go back to edit</li>
					<li>Content has clear parent-child relationships</li>
					<li>Mobile-like navigation patterns on web</li>
					<li>When back navigation should be automatic and visible</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Navigation Patterns</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>
						<strong>Push:</strong> Add new screen to stack when user drills down or advances
					</li>
					<li>
						<strong>Pop:</strong> Remove top screen when user goes back (via button or browser back)
					</li>
					<li>
						<strong>Replace:</strong> Update stack array to replace entire history if needed
					</li>
					<li>
						<strong>Reset:</strong> Clear stack to single root screen to start over
					</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Design Tips</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Keep screen titles concise and descriptive</li>
					<li>Maintain visual consistency across stack screens</li>
					<li>Show stack depth indicators for long flows</li>
					<li>Consider maximum reasonable stack depth (4-6 screens)</li>
					<li>Provide alternative escape routes for deep stacks</li>
					<li>Test with browser back/forward buttons</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Animation Details -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Animation & Transitions</h3>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<p class="text-sm text-muted-foreground">
				Navigation Stack deliberately uses instant transitions without animations:
			</p>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li>
					<strong>Instant Screen Switching:</strong> Screens change immediately when stack updates
				</li>
				<li>
					<strong>No Lifecycle Animations:</strong> No slide/fade transitions between screens (matches
					iOS behavior)
				</li>
				<li>
					<strong>Hover Transitions Only:</strong> Back button uses CSS transition-colors for hover
					states
				</li>
				<li>
					<strong>Performance:</strong> Instant switching provides immediate feedback and better UX
				</li>
				<li>
					<strong>Simplicity:</strong> Reduces complexity - no PresentationState or animation coordination
					needed
				</li>
			</ul>
			<div class="mt-4 p-4 bg-muted/30 rounded text-xs text-muted-foreground">
				<strong>Note:</strong> This follows platform conventions - native iOS navigation stacks switch
				screens instantly during push/pop operations. Animations would slow down hierarchical navigation
				and feel unnatural for this pattern.
			</div>
		</div>
	</section>

	<!-- Implementation Notes -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Implementation Notes</h3>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<h4 class="font-semibold">Store Requirements</h4>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li>Requires a non-null scoped store to render (hides when store is null)</li>
				<li>Stack prop must be an array of screen states</li>
				<li>Component is fully controlled - you manage the stack state</li>
				<li>Use onBack callback to handle back button clicks (typically dispatch pop action)</li>
			</ul>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<h4 class="font-semibold">Styling Options</h4>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li>
					<strong>class:</strong> Override container classes
				</li>
				<li>
					<strong>headerClass:</strong> Override header classes
				</li>
				<li>
					<strong>contentClass:</strong> Override content area classes
				</li>
				<li>
					<strong>unstyled:</strong> Remove all default styles (primitive mode)
				</li>
				<li>
					<strong>showBackButton:</strong> Hide back button even when stack depth > 1
				</li>
			</ul>
		</div>
	</section>
</div>

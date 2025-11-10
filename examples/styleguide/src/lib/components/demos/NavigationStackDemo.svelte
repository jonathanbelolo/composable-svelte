<script lang="ts">
	import NavigationStack from '@composable-svelte/core/navigation-components/NavigationStack.svelte';
	import AnimatedNavigationStack from '@composable-svelte/core/navigation-components/AnimatedNavigationStack.svelte';
	import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
	import { createStore } from '@composable-svelte/core';
	import { scopeToDestination } from '@composable-svelte/core/navigation/scope-to-destination.js';
	import { Effect } from '@composable-svelte/core/effect.js';
	import type { PresentationState } from '@composable-svelte/core/navigation/types.js';

	// ============================================================================
	// Demo State & Store Setup
	// ============================================================================

	interface ScreenState {
		id: string;
		title: string;
		content: string;
		color: string;
	}

	type StackDestination = { type: 'stack'; state: { stack: ScreenState[] } };

	interface DemoState {
		// Simple variant (no animations)
		simpleDestination: StackDestination | null;

		// Animated variant (with animations)
		animatedDestination: StackDestination | null;
		presentation: PresentationState<StackDestination>;
	}

	type DemoAction =
		// Simple variant actions
		| { type: 'simplePushScreen'; screen: ScreenState }
		| { type: 'simplePopScreen' }
		// Animated variant actions
		| { type: 'animatedPushScreen'; screen: ScreenState }
		| { type: 'animatedPopScreen' }
		| { type: 'presentationCompleted' }
		| { type: 'dismissalCompleted' }
		| { type: 'destination'; action: any };

	const demoStore = createStore<DemoState, DemoAction>({
		initialState: {
			simpleDestination: {
				type: 'stack',
				state: {
					stack: [
						{
							id: 's1',
							title: 'Home',
							content: 'Simple stack - no animations. Click items to navigate instantly.',
							color: 'bg-blue-50 dark:bg-blue-950'
						}
					]
				}
			},
			animatedDestination: {
				type: 'stack',
				state: {
					stack: [
						{
							id: 'a1',
							title: 'Home',
							content: 'Animated stack - iOS-style slide animations with dual-screen rendering.',
							color: 'bg-purple-50 dark:bg-purple-950'
						}
					]
				}
			},
			presentation: { status: 'idle' as const }
		},
		reducer: (state, action) => {
			switch (action.type) {
				// ============================================================
				// Simple Stack Actions (No Animations)
				// ============================================================
				case 'simplePushScreen':
					if (state.simpleDestination?.type === 'stack') {
						const currentStack = state.simpleDestination.state.stack;
						if (currentStack.length >= 5) {
							return [state, Effect.none()];
						}
						const newDestination: StackDestination = {
							...state.simpleDestination,
							state: {
								stack: [...currentStack, action.screen]
							}
						};
						return [
							{
								...state,
								simpleDestination: newDestination
							},
							Effect.none()
						];
					}
					return [state, Effect.none()];

				case 'simplePopScreen':
					if (state.simpleDestination?.type === 'stack') {
						const currentStack = state.simpleDestination.state.stack;
						if (currentStack.length <= 1) {
							return [state, Effect.none()];
						}
						const newStack = currentStack.slice(0, -1);
						const newDestination: StackDestination = {
							...state.simpleDestination,
							state: { stack: newStack }
						};
						return [
							{
								...state,
								simpleDestination: newDestination
							},
							Effect.none()
						];
					}
					return [state, Effect.none()];

				// ============================================================
				// Animated Stack Actions (With Animations)
				// ============================================================
				case 'animatedPushScreen':
					if (state.animatedDestination?.type === 'stack') {
						const currentStack = state.animatedDestination.state.stack;
						if (currentStack.length >= 5) {
							return [state, Effect.none()];
						}
						// Guard: Only allow push if not animating
						if (state.presentation.status === 'presenting' || state.presentation.status === 'dismissing') {
							return [state, Effect.none()];
						}
						const newDestination: StackDestination = {
							...state.animatedDestination,
							state: {
								stack: [...currentStack, action.screen]
							}
						};
						return [
							{
								...state,
								animatedDestination: newDestination,
								presentation: {
									status: 'presenting' as const,
									content: newDestination,
									duration: 437
								}
							},
							Effect.none() // AnimatedNavigationStack will call onPresentationComplete when animation finishes
						];
					}
					return [state, Effect.none()];

				case 'animatedPopScreen':
					if (state.animatedDestination?.type === 'stack') {
						const currentStack = state.animatedDestination.state.stack;
						console.log('[NavigationStackDemo] animatedPopScreen, currentStack.length:', currentStack.length);
						if (currentStack.length <= 1) {
							return [state, Effect.none()];
						}
						// Guard: Only allow pop if presented (not animating)
						if (state.presentation.status !== 'presented') {
							return [state, Effect.none()];
						}
						return [
							{
								...state,
								presentation: {
									status: 'dismissing' as const,
									content: state.presentation.status === 'presented' ? state.presentation.content : state.animatedDestination!,
									duration: 437
								}
							},
							Effect.none() // AnimatedNavigationStack will call onDismissalComplete when animation finishes
						];
					}
					return [state, Effect.none()];

				case 'presentationCompleted':
					console.log('[NavigationStackDemo] presentationCompleted');
					return [
						{
							...state,
							presentation: {
								status: 'presented' as const,
								content: state.presentation.status === 'presenting' ? state.presentation.content : state.animatedDestination!
							}
						},
						Effect.none()
					];

				case 'dismissalCompleted':
					// After pop animation completes, update the stack
					if (state.animatedDestination?.type === 'stack') {
						const currentStack = state.animatedDestination.state.stack;
						console.log('[NavigationStackDemo] dismissalCompleted, currentStack.length:', currentStack.length);
						if (currentStack.length > 1) {
							const newStack = currentStack.slice(0, -1);
							const newDestination: StackDestination = {
								...state.animatedDestination,
								state: { stack: newStack }
							};
							console.log('[NavigationStackDemo] dismissalCompleted, popping stack to:', newStack.length);
							return [
								{
									...state,
									animatedDestination: newDestination,
									presentation: {
							status: 'presented' as const,
							content: newDestination
						}
								},
								Effect.none()
							];
						}
					}
					return [
						{
							...state,
							presentation: { status: 'idle' as const }
						},
						Effect.none()
					];

				default:
					return [state, Effect.none()];
			}
		}
	});

	const simpleStore = scopeToDestination(demoStore, ['simpleDestination'], 'stack', 'destination');
	const animatedStore = scopeToDestination(demoStore, ['animatedDestination'], 'stack', 'destination');

	// ============================================================================
	// Demo Screens
	// ============================================================================

	const simpleScreens: ScreenState[] = [
		{
			id: 's2',
			title: 'Profile',
			content: 'View profile instantly - no animation delay.',
			color: 'bg-green-50 dark:bg-green-950'
		},
		{
			id: 's3',
			title: 'Settings',
			content: 'Quick navigation to settings.',
			color: 'bg-yellow-50 dark:bg-yellow-950'
		},
		{
			id: 's4',
			title: 'Notifications',
			content: 'Instant notification view.',
			color: 'bg-orange-50 dark:bg-orange-950'
		},
		{
			id: 's5',
			title: 'Privacy',
			content: 'Direct privacy controls.',
			color: 'bg-pink-50 dark:bg-pink-950'
		}
	];

	const animatedScreens: ScreenState[] = [
		{
			id: 'a2',
			title: 'Profile',
			content: 'Smooth slide animation with dual-screen rendering.',
			color: 'bg-green-50 dark:bg-green-950'
		},
		{
			id: 'a3',
			title: 'Settings',
			content: 'iOS-style navigation with spring physics.',
			color: 'bg-yellow-50 dark:bg-yellow-950'
		},
		{
			id: 'a4',
			title: 'Notifications',
			content: 'Previous screen slides left as new screen enters.',
			color: 'bg-orange-50 dark:bg-orange-950'
		},
		{
			id: 'a5',
			title: 'Privacy',
			content: 'Animated push/pop with state-driven lifecycle.',
			color: 'bg-pink-50 dark:bg-pink-950'
		}
	];

	// Simple stack helpers
	const simpleStack = $derived($demoStore.simpleDestination?.state.stack ?? []);
	const simpleStackIds = $derived(new Set(simpleStack.map(s => s.id)));
	const availableSimpleScreens = $derived(
		simpleScreens.filter(screen => !simpleStackIds.has(screen.id)).slice(0, 3)
	);
	const canPushSimple = $derived(simpleStack.length < 5 && availableSimpleScreens.length > 0);

	// Animated stack helpers
	const animatedStack = $derived($demoStore.animatedDestination?.state.stack ?? []);
	const animatedStackIds = $derived(new Set(animatedStack.map(s => s.id)));
	const availableAnimatedScreens = $derived(
		animatedScreens.filter(screen => !animatedStackIds.has(screen.id)).slice(0, 3)
	);
	const canPushAnimated = $derived(animatedStack.length < 5 && availableAnimatedScreens.length > 0);

	function pushSimpleScreen(screen: ScreenState) {
		demoStore.dispatch({ type: 'simplePushScreen', screen });
	}

	function popSimpleScreen() {
		demoStore.dispatch({ type: 'simplePopScreen' });
	}

	function pushAnimatedScreen(screen: ScreenState) {
		demoStore.dispatch({ type: 'animatedPushScreen', screen });
	}

	function popAnimatedScreen() {
		demoStore.dispatch({ type: 'animatedPopScreen' });
	}
</script>

<div class="space-y-12">
	<!-- Live Demo Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Comparison</h3>
			<p class="text-muted-foreground text-sm">
				Compare the simple NavigationStack (left) with AnimatedNavigationStack (right)
			</p>
		</div>

		<!-- Side-by-Side Comparison -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Simple NavigationStack -->
			<div class="space-y-4">
				<div class="flex items-center gap-2">
					<h4 class="font-semibold">NavigationStack</h4>
					<span class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 rounded">Simple</span>
				</div>
				<div class="text-sm text-muted-foreground">
					No animations - instant navigation. Best for utility screens or when performance is critical.
				</div>
				<div class="rounded-lg border-2 bg-card p-4">
					<div class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
						<span class="font-medium">Depth:</span>
						<span class="px-2 py-1 bg-blue-500/10 text-blue-500 rounded">{simpleStack.length}</span>
						<span class="flex-1"></span>
						<div class="flex gap-1">
							{#each simpleStack as screen, i (screen.id)}
								<div
									class="w-6 h-6 rounded flex items-center justify-center text-xs font-medium"
									class:bg-blue-500={i === simpleStack.length - 1}
									class:text-white={i === simpleStack.length - 1}
									class:bg-muted={i !== simpleStack.length - 1}
									class:text-muted-foreground={i !== simpleStack.length - 1}
								>
									{i + 1}
								</div>
							{/each}
						</div>
					</div>

					<!-- Simple NavigationStack -->
					<div class="h-[400px] rounded-lg border bg-background">
						<NavigationStack store={simpleStore} stack={simpleStack} onBack={popSimpleScreen}>
							{#snippet children({ currentScreen })}
								{#if currentScreen}
									<div class="h-full {currentScreen.color} p-6 space-y-4">
										<div class="space-y-1">
											<h2 class="text-2xl font-bold">{currentScreen.title}</h2>
											<p class="text-sm text-muted-foreground">{currentScreen.content}</p>
										</div>

										<div class="space-y-3">
											<div class="p-3 bg-background/50 rounded border text-xs">
												<p><strong>Screen ID:</strong> {currentScreen.id}</p>
												<p><strong>Stack Depth:</strong> {simpleStack.length}</p>
											</div>

											{#if canPushSimple}
												<div class="space-y-2">
													<p class="text-xs font-medium">Push screen:</p>
													<div class="flex flex-wrap gap-2">
														{#each availableSimpleScreens as screen}
															<Button variant="default" size="sm" onclick={() => pushSimpleScreen(screen)}>
																{screen.title} →
															</Button>
														{/each}
													</div>
												</div>
											{:else}
												<div class="p-3 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800 text-xs">
													Max depth reached. Use back button.
												</div>
											{/if}
										</div>
									</div>
								{/if}
							{/snippet}
						</NavigationStack>
					</div>
				</div>
			</div>

			<!-- Animated NavigationStack -->
			<div class="space-y-4">
				<div class="flex items-center gap-2">
					<h4 class="font-semibold">AnimatedNavigationStack</h4>
					<span class="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-900 dark:text-purple-100 rounded">Animated</span>
				</div>
				<div class="text-sm text-muted-foreground">
					iOS-style slide animations with dual-screen rendering. Previous screen slides left during push.
				</div>
				<div class="rounded-lg border-2 bg-card p-4">
					<div class="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
						<span class="font-medium">Depth:</span>
						<span class="px-2 py-1 bg-purple-500/10 text-purple-500 rounded">{animatedStack.length}</span>
						<span class="flex-1"></span>
						<div class="flex gap-1">
							{#each animatedStack as screen, i (screen.id)}
								<div
									class="w-6 h-6 rounded flex items-center justify-center text-xs font-medium"
									class:bg-purple-500={i === animatedStack.length - 1}
									class:text-white={i === animatedStack.length - 1}
									class:bg-muted={i !== animatedStack.length - 1}
									class:text-muted-foreground={i !== animatedStack.length - 1}
								>
									{i + 1}
								</div>
							{/each}
						</div>
					</div>

					<!-- Animated NavigationStack -->
					<div class="h-[400px] rounded-lg border bg-background">
						<AnimatedNavigationStack
							store={animatedStore}
							stack={animatedStack}
							presentation={$demoStore.presentation}
							onBack={popAnimatedScreen}
							onPresentationComplete={() => demoStore.dispatch({ type: 'presentationCompleted' })}
							onDismissalComplete={() => demoStore.dispatch({ type: 'dismissalCompleted' })}
						>
							{#snippet children({ currentScreen })}
								{#if currentScreen}
									<div class="h-full {currentScreen.color} p-6 space-y-4">
										<div class="space-y-1">
											<h2 class="text-2xl font-bold">{currentScreen.title}</h2>
											<p class="text-sm text-muted-foreground">{currentScreen.content}</p>
										</div>

										<div class="space-y-3">
											<div class="p-3 bg-background/50 rounded border text-xs">
												<p><strong>Screen ID:</strong> {currentScreen.id}</p>
												<p><strong>Stack Depth:</strong> {animatedStack.length}</p>
												<p><strong>Animation:</strong> {$demoStore.presentation.status}</p>
											</div>

											{#if canPushAnimated}
												<div class="space-y-2">
													<p class="text-xs font-medium">Push screen:</p>
													<div class="flex flex-wrap gap-2">
														{#each availableAnimatedScreens as screen}
															<Button
																variant="default"
																size="sm"
																disabled={$demoStore.presentation.status === 'presenting' || $demoStore.presentation.status === 'dismissing'}
																onclick={() => pushAnimatedScreen(screen)}
															>
																{screen.title} →
															</Button>
														{/each}
													</div>
												</div>
											{:else}
												<div class="p-3 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800 text-xs">
													Max depth reached. Use back button.
												</div>
											{/if}
										</div>
									</div>
								{/if}
							{/snippet}
						</AnimatedNavigationStack>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Comparison Table -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Feature Comparison</h3>
		</div>

		<div class="rounded-lg border overflow-hidden">
			<table class="w-full">
				<thead class="bg-muted/50">
					<tr>
						<th class="text-left p-4 font-semibold">Feature</th>
						<th class="text-left p-4 font-semibold">NavigationStack</th>
						<th class="text-left p-4 font-semibold">AnimatedNavigationStack</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					<tr>
						<td class="p-4 font-medium">Animations</td>
						<td class="p-4 text-sm text-muted-foreground">None - instant</td>
						<td class="p-4 text-sm text-muted-foreground">iOS-style slide (437ms)</td>
					</tr>
					<tr>
						<td class="p-4 font-medium">Screen Rendering</td>
						<td class="p-4 text-sm text-muted-foreground">Single screen only</td>
						<td class="p-4 text-sm text-muted-foreground">Dual screens during animations</td>
					</tr>
					<tr>
						<td class="p-4 font-medium">Performance</td>
						<td class="p-4 text-sm text-muted-foreground">Fastest - no animation overhead</td>
						<td class="p-4 text-sm text-muted-foreground">Slight overhead for animations</td>
					</tr>
					<tr>
						<td class="p-4 font-medium">PresentationState</td>
						<td class="p-4 text-sm text-muted-foreground">Not required</td>
						<td class="p-4 text-sm text-muted-foreground">Required for lifecycle</td>
					</tr>
					<tr>
						<td class="p-4 font-medium">Use Case</td>
						<td class="p-4 text-sm text-muted-foreground">Utility screens, performance-critical</td>
						<td class="p-4 text-sm text-muted-foreground">User-facing flows, polished UX</td>
					</tr>
					<tr>
						<td class="p-4 font-medium">Spring Config</td>
						<td class="p-4 text-sm text-muted-foreground">N/A</td>
						<td class="p-4 text-sm text-muted-foreground">Customizable via prop</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<!-- Description -->
	<section class="space-y-4">
		<h3 class="text-xl font-semibold">When to Use Each Variant</h3>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold flex items-center gap-2">
					<span class="text-2xl">⚡</span>
					NavigationStack (Simple)
				</h4>
				<ul class="text-sm space-y-2 text-muted-foreground list-disc list-inside">
					<li>Admin panels and utility screens</li>
					<li>Performance-critical applications</li>
					<li>Quick navigation without visual polish</li>
					<li>When bundle size matters most</li>
					<li>Internal tools and dashboards</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold flex items-center gap-2">
					<span class="text-2xl">✨</span>
					AnimatedNavigationStack
				</h4>
				<ul class="text-sm space-y-2 text-muted-foreground list-disc list-inside">
					<li>User-facing consumer applications</li>
					<li>Mobile-first web experiences</li>
					<li>E-commerce and content apps</li>
					<li>When UX polish is important</li>
					<li>Onboarding and guided flows</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Implementation Details -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Animation Details</h3>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<h4 class="font-semibold">How AnimatedNavigationStack Works</h4>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li>
					<strong>Dual-Screen Rendering:</strong> Both current and previous screens are rendered during animations using absolute positioning
				</li>
				<li>
					<strong>Push Animation:</strong> New screen slides in from 100% right to 0%, previous screen slides from 0% to -30% left with opacity fade
				</li>
				<li>
					<strong>Pop Animation:</strong> Current screen slides out to 100% right, previous screen slides in from -30% left to 0%
				</li>
				<li>
					<strong>Z-Index Layering:</strong> Previous screen at z-10, current screen at z-20 for proper overlap
				</li>
				<li>
					<strong>Spring Physics:</strong> Uses drawer preset (437ms duration with 0.25 bounce) for polished feel
				</li>
				<li>
					<strong>Animation Guards:</strong> Buttons disabled during transitions to prevent double-taps
				</li>
				<li>
					<strong>State-Driven:</strong> PresentationState tracks lifecycle (idle → presenting → presented → dismissing → idle)
				</li>
			</ul>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<h4 class="font-semibold">Customizing Animations</h4>
			<p class="text-sm text-muted-foreground">
				AnimatedNavigationStack accepts a <code class="text-xs bg-muted px-1 py-0.5 rounded">springConfig</code> prop to customize timing:
			</p>
			<pre class="text-xs bg-muted p-4 rounded overflow-x-auto"><code>{`<AnimatedNavigationStack
  springConfig={{ visualDuration: 0.5, bounce: 0.3 }}
  ...
/>`}</code></pre>
		</div>
	</section>

	<!-- Best Practices -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Best Practices</h3>
		</div>

		<div class="space-y-4">
			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Navigation Stack Guidelines</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Keep stack depth reasonable (4-6 screens max) to avoid deep hierarchies</li>
					<li>Provide clear screen titles so users understand their location</li>
					<li>Consider maximum stack depth guards to prevent infinite stacks</li>
					<li>Test with browser back/forward buttons for SvelteKit integration</li>
					<li>Use simple variant for admin panels, animated variant for user-facing apps</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Animation Best Practices</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Guard against rapid push/pop during animations to prevent state conflicts</li>
					<li>Disable navigation buttons during transitions for better UX</li>
					<li>Show animation status in debug builds to diagnose issues</li>
					<li>Use timeout fallbacks (2-3x duration) in production for animation failures</li>
					<li>Match animation duration to user expectations (300-500ms feels natural)</li>
				</ul>
			</div>
		</div>
	</section>
</div>

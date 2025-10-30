<script lang="ts">
	import Tabs from '@composable-svelte/core/navigation-components/Tabs.svelte';
	import { createStore } from '@composable-svelte/core/store.svelte.js';
	import { scopeToDestination } from '@composable-svelte/core/navigation/scope-to-destination.js';
	import { Effect } from '@composable-svelte/core/effect.js';

	// Create a simple store for demo purposes (Tabs requires a non-null store to render)
	interface DemoState {
		destination: { type: 'demo'; state: Record<string, never> } | null;
	}

	type DemoAction = { type: 'show' };

	const demoStore = createStore<DemoState, DemoAction>({
		initialState: {
			destination: { type: 'demo', state: {} }
		},
		reducer: (state) => [state, Effect.none()]
	});

	const scopedStore = scopeToDestination(demoStore, ['destination'], 'demo', 'destination');

	// Example 1: Basic tabs
	let activeTab1 = $state(0);

	// Example 2: Settings tabs
	let activeTab2 = $state(0);

	// Example 3: Content-heavy tabs
	let activeTab3 = $state(0);
</script>

<div class="space-y-12">
	<!-- Live Demo Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">
				Click tabs or use arrow keys to navigate between them
			</p>
		</div>

		<div class="p-12 rounded-lg border-2 bg-card space-y-8">
			<!-- Example 1: Basic Tabs -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">Basic Navigation</h4>
				<Tabs
					store={scopedStore}
					tabs={['Overview', 'Details', 'Settings']}
					activeTab={activeTab1}
					onTabChange={(index) => (activeTab1 = index)}
				/>

				<div class="rounded-lg bg-muted/20 p-6 min-h-[120px]">
					{#if activeTab1 === 0}
						<div class="space-y-2">
							<h3 class="text-lg font-semibold">Overview</h3>
							<p class="text-sm text-muted-foreground">
								Welcome to the overview section. This demonstrates basic tab functionality with
								instant switching.
							</p>
						</div>
					{:else if activeTab1 === 1}
						<div class="space-y-2">
							<h3 class="text-lg font-semibold">Details</h3>
							<p class="text-sm text-muted-foreground">
								Here you can find detailed information about the selected item. Tabs switch
								instantly for quick navigation.
							</p>
						</div>
					{:else if activeTab1 === 2}
						<div class="space-y-2">
							<h3 class="text-lg font-semibold">Settings</h3>
							<p class="text-sm text-muted-foreground">
								Configure your preferences and options in this section. Use arrow keys for
								keyboard navigation.
							</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Example 2: Settings Tabs -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">Settings Layout</h4>
				<Tabs
					store={scopedStore}
					tabs={['Account', 'Security', 'Notifications', 'Appearance']}
					activeTab={activeTab2}
					onTabChange={(index) => (activeTab2 = index)}
				/>

				<div class="rounded-lg bg-muted/20 p-6 min-h-[120px]">
					{#if activeTab2 === 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Account Settings</h3>
							<div class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span class="text-muted-foreground">Username:</span>
									<span class="font-medium">user@example.com</span>
								</div>
								<div class="flex justify-between">
									<span class="text-muted-foreground">Account Type:</span>
									<span class="font-medium">Premium</span>
								</div>
							</div>
						</div>
					{:else if activeTab2 === 1}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Security Settings</h3>
							<div class="space-y-2 text-sm">
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Two-Factor Auth:</span>
									<span class="font-medium text-green-600">Enabled</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Last Login:</span>
									<span class="font-medium">2 hours ago</span>
								</div>
							</div>
						</div>
					{:else if activeTab2 === 2}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Notification Preferences</h3>
							<div class="space-y-2 text-sm">
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Email Notifications:</span>
									<span class="font-medium">On</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Push Notifications:</span>
									<span class="font-medium">Off</span>
								</div>
							</div>
						</div>
					{:else if activeTab2 === 3}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Appearance Settings</h3>
							<div class="space-y-2 text-sm">
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Theme:</span>
									<span class="font-medium">Dark</span>
								</div>
								<div class="flex justify-between items-center">
									<span class="text-muted-foreground">Accent Color:</span>
									<span class="font-medium">Blue</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Example 3: Content Tabs -->
			<div class="space-y-4">
				<h4 class="text-sm font-medium text-muted-foreground">Content Sections</h4>
				<Tabs
					store={scopedStore}
					tabs={['Features', 'Pricing', 'Documentation']}
					activeTab={activeTab3}
					onTabChange={(index) => (activeTab3 = index)}
				/>

				<div class="rounded-lg bg-muted/20 p-6 min-h-[120px]">
					{#if activeTab3 === 0}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Key Features</h3>
							<ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
								<li>Full keyboard navigation (Arrow keys, Home, End)</li>
								<li>Instant tab switching with smooth visual transitions</li>
								<li>ARIA-compliant accessibility</li>
								<li>Customizable styling via className prop</li>
							</ul>
						</div>
					{:else if activeTab3 === 1}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Pricing Plans</h3>
							<div class="grid grid-cols-3 gap-4 text-sm">
								<div>
									<div class="font-semibold">Free</div>
									<div class="text-muted-foreground">$0/month</div>
								</div>
								<div>
									<div class="font-semibold">Pro</div>
									<div class="text-muted-foreground">$9/month</div>
								</div>
								<div>
									<div class="font-semibold">Enterprise</div>
									<div class="text-muted-foreground">Custom</div>
								</div>
							</div>
						</div>
					{:else if activeTab3 === 2}
						<div class="space-y-3">
							<h3 class="text-lg font-semibold">Documentation</h3>
							<p class="text-sm text-muted-foreground">
								Comprehensive documentation is available covering installation, usage, and
								advanced patterns. Check the API reference for detailed information.
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Description -->
	<section class="space-y-4">
		<h3 class="text-xl font-semibold">Usage</h3>
		<div class="prose prose-sm dark:prose-invert">
			<p>
				The Tabs component provides a simple and accessible way to organize content into separate
				views. Perfect for settings pages, dashboards, and content organization. Key features
				include:
			</p>
			<ul>
				<li>Full keyboard navigation (Arrow keys, Home, End)</li>
				<li>Instant tab switching with CSS transition effects</li>
				<li>ARIA-compliant for screen readers</li>
				<li>Customizable styling and layout</li>
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
				<div class="text-2xl">⌨️</div>
				<h4 class="font-semibold">Keyboard Navigation</h4>
				<p class="text-sm text-muted-foreground">
					Arrow keys to move between tabs, Home/End to jump to first/last tab. Fully accessible
					via keyboard.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">⚡</div>
				<h4 class="font-semibold">Instant Switching</h4>
				<p class="text-sm text-muted-foreground">
					Tabs switch instantly with smooth CSS transitions for hover and focus states. No
					lifecycle animations.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">♿</div>
				<h4 class="font-semibold">Accessibility</h4>
				<p class="text-sm text-muted-foreground">
					ARIA roles, labels, and states ensure screen readers can navigate tabs effectively.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🎨</div>
				<h4 class="font-semibold">Customizable Styling</h4>
				<p class="text-sm text-muted-foreground">
					Pass custom classes via class prop for the container, tabListClass for the tab list,
					and tabClass for individual tabs.
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
				<h4 class="font-semibold">Settings Pages</h4>
				<p class="text-sm text-muted-foreground">
					Organize account, security, notifications, and appearance settings into separate tabs.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Dashboards</h4>
				<p class="text-sm text-muted-foreground">
					Switch between overview, analytics, reports, and admin views in a dashboard layout.
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Content Organization</h4>
				<p class="text-sm text-muted-foreground">
					Separate features, pricing, documentation, and FAQs into easy-to-navigate sections.
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
				<h4 class="font-semibold mb-3">When to Use Tabs</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Content can be logically separated into distinct categories</li>
					<li>Users need to switch between views frequently</li>
					<li>All tab content is equally important (not hierarchical)</li>
					<li>You have 2-6 tabs (more than 6 becomes difficult to scan)</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Keyboard Shortcuts</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li><strong>Arrow Left/Right:</strong> Navigate to previous/next tab</li>
					<li><strong>Home:</strong> Jump to first tab</li>
					<li><strong>End:</strong> Jump to last tab</li>
					<li><strong>Tab:</strong> Move focus to tab content area</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Design Tips</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Keep tab labels short and descriptive (1-2 words)</li>
					<li>Maintain consistent tab order across similar pages</li>
					<li>Use icons sparingly - only when they add clear meaning</li>
					<li>Don't nest tabs within tabs (use a different pattern)</li>
					<li>Consider responsive behavior - tabs should wrap or scroll on mobile</li>
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
				Unlike navigation components (Modal, Sheet, Drawer), Tabs use CSS transitions only:
			</p>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li>
					<strong>Hover/Focus States:</strong> Smooth background and text color transitions using
					CSS <code class="text-xs">transition-all</code>
				</li>
				<li>
					<strong>Tab Switching:</strong> Instant content switching with no animation (immediate
					feedback)
				</li>
				<li>
					<strong>No Lifecycle Animations:</strong> Tabs don't use PresentationState or Motion One
					- instant switching is the correct UX
				</li>
				<li>
					<strong>Visual Feedback:</strong> Active tab has distinct styling with smooth transitions
					on state changes
				</li>
			</ul>
			<div class="mt-4 p-4 bg-muted/30 rounded text-xs text-muted-foreground">
				<strong>Note:</strong> This follows the animation guidelines - tabs are informational navigation,
				not modal presentations, so instant switching provides better UX than animated transitions.
			</div>
		</div>
	</section>
</div>

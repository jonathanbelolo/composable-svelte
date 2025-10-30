<script lang="ts">
	import DropdownMenu from '@composable-svelte/core/components/ui/dropdown-menu/DropdownMenu.svelte';
	import type { MenuItem } from '@composable-svelte/core/components/ui/dropdown-menu/dropdown-menu.types.js';
	import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

	const menuItems: MenuItem[] = [
		{ id: '1', label: 'Profile', icon: '👤' },
		{ id: '2', label: 'Settings', icon: '⚙️' },
		{ id: '3', label: 'Notifications', icon: '🔔' },
		{ id: 'sep1', label: '', isSeparator: true },
		{ id: '4', label: 'Help & Support', icon: '❓' },
		{ id: '5', label: 'Logout', icon: '🚪' }
	];

	const editMenuItems: MenuItem[] = [
		{ id: 'cut', label: 'Cut', icon: '✂️', shortcut: '⌘X' },
		{ id: 'copy', label: 'Copy', icon: '📋', shortcut: '⌘C' },
		{ id: 'paste', label: 'Paste', icon: '📄', shortcut: '⌘V' },
		{ id: 'sep1', label: '', isSeparator: true },
		{ id: 'undo', label: 'Undo', icon: '↩️', shortcut: '⌘Z' },
		{ id: 'redo', label: 'Redo', icon: '↪️', shortcut: '⌘⇧Z' }
	];

	const fileMenuItems: MenuItem[] = [
		{ id: 'new', label: 'New File', icon: '📄', shortcut: '⌘N' },
		{ id: 'open', label: 'Open...', icon: '📂', shortcut: '⌘O' },
		{ id: 'save', label: 'Save', icon: '💾', shortcut: '⌘S' },
		{ id: 'sep1', label: '', isSeparator: true },
		{ id: 'export', label: 'Export', icon: '📤' },
		{ id: 'sep2', label: '', isSeparator: true },
		{ id: 'close', label: 'Close', icon: '❌', shortcut: '⌘W' }
	];

	function handleSelect(item: MenuItem) {
		console.log('Selected:', item.label);
	}
</script>

<div class="space-y-12">
	<!-- Live Demo Section -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
			<p class="text-muted-foreground text-sm">
				Click the buttons to open dropdown menus with smooth animations
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-4 p-12 rounded-lg border-2 bg-card">
			<DropdownMenu items={menuItems} onSelect={handleSelect}>
				<Button variant="default">
					User Menu
				</Button>
			</DropdownMenu>

			<DropdownMenu items={editMenuItems} onSelect={handleSelect} align="end">
				<Button variant="secondary">
					Edit Menu
				</Button>
			</DropdownMenu>

			<DropdownMenu items={fileMenuItems} onSelect={handleSelect}>
				<Button variant="outline">
					File Menu
				</Button>
			</DropdownMenu>
		</div>
	</section>

	<!-- Description -->
	<section class="space-y-4">
		<h3 class="text-xl font-semibold">Usage</h3>
		<div class="prose prose-sm dark:prose-invert">
			<p>
				The Dropdown Menu component provides contextual menus with keyboard navigation support.
				Perfect for action menus, context menus, and toolbar dropdowns. Key features include:
			</p>
			<ul>
				<li>Full keyboard navigation (Arrow keys, Home, End, Enter, Escape)</li>
				<li>Automatic focus management and click-outside handling</li>
				<li>Support for icons, shortcuts, separators, and disabled items</li>
				<li>Smooth Motion One animations via PresentationState</li>
				<li>State-driven lifecycle management through reducer pattern</li>
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
					Full keyboard support with arrow keys, Home/End, Enter to select, and Escape to close
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">✨</div>
				<h4 class="font-semibold">State-Driven Animations</h4>
				<p class="text-sm text-muted-foreground">
					Smooth scale and opacity animations powered by Motion One and PresentationState
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🎯</div>
				<h4 class="font-semibold">Smart Item Handling</h4>
				<p class="text-sm text-muted-foreground">
					Automatically skips disabled items and separators during keyboard navigation
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<div class="text-2xl">🎨</div>
				<h4 class="font-semibold">Rich Customization</h4>
				<p class="text-sm text-muted-foreground">
					Icons, keyboard shortcuts, separators, alignment options, and disabled states
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
				<h4 class="font-semibold">Context Menus</h4>
				<p class="text-sm text-muted-foreground">
					Right-click or button-triggered actions for list items or table rows
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">Toolbar Menus</h4>
				<p class="text-sm text-muted-foreground">
					File, Edit, View menus in application toolbars with shortcuts
				</p>
			</div>

			<div class="rounded-lg border bg-card p-6 space-y-3">
				<h4 class="font-semibold">User Menus</h4>
				<p class="text-sm text-muted-foreground">
					Profile, settings, and account actions in navigation bars
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
				<h4 class="font-semibold mb-3">When to Use Dropdown Menus</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Groups of related actions that don't need to be always visible</li>
					<li>Context-specific actions for items (right-click menus)</li>
					<li>Application-level commands (File, Edit menus)</li>
					<li>User account actions and settings</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Keyboard Shortcuts</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li><strong>Arrow Down/Up:</strong> Navigate between menu items</li>
					<li><strong>Home/End:</strong> Jump to first/last item</li>
					<li><strong>Enter/Space:</strong> Select highlighted item</li>
					<li><strong>Escape:</strong> Close menu without selection</li>
				</ul>
			</div>

			<div class="rounded-lg border bg-card p-6">
				<h4 class="font-semibold mb-3">Design Tips</h4>
				<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
					<li>Group related actions together with separators</li>
					<li>Show keyboard shortcuts for frequently used actions</li>
					<li>Use icons to make actions more recognizable</li>
					<li>Keep menu items concise (1-3 words)</li>
					<li>Place destructive actions (delete, logout) at the bottom</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Animation Details -->
	<section class="space-y-6">
		<div>
			<h3 class="text-xl font-semibold mb-2">Animation System</h3>
		</div>

		<div class="rounded-lg border bg-card p-6 space-y-4">
			<p class="text-sm text-muted-foreground">
				The Dropdown Menu uses the same state-driven animation system as other navigation components:
			</p>
			<ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
				<li><strong>Opening:</strong> Scale from 0.96 to 1.0 + opacity 0 to 1 (150ms)</li>
				<li><strong>Closing:</strong> Scale to 0.96 + opacity fade out (100ms)</li>
				<li><strong>State Flow:</strong> idle → presenting → presented → dismissing → idle</li>
				<li><strong>Guards:</strong> Prevents dismissal during presentation animation</li>
			</ul>
		</div>
	</section>
</div>

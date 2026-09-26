<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavigationStackPrimitive from './primitives/NavigationStackPrimitive.svelte';
	import type { ChildView } from '../navigation/managed-integration.js';
	import type { PresentationState } from '../navigation/types.js';
	import type { SpringConfig } from '../animation/spring-config.js';
	import { cn } from '../utils.js';
	import {
		animateStackPushIn,
		animateStackPushOut,
		animateStackPopOut,
		animateStackPopIn
	} from '../animation/animate.js';

	// ============================================================================
	// Props
	// ============================================================================

	interface AnimatedNavigationStackProps<State, Action> {
		/**
		 * Scoped store for the stack content.
		 */
		store: ChildView<State, Action> | undefined;

		/**
		 * Stack of screen states.
		 */
		stack: readonly State[];

		/**
		 * Presentation state for animation lifecycle.
		 */
		presentation: PresentationState<any>;

		/**
		 * Callback to handle going back in the stack.
		 */
		onBack?: (() => void) | undefined;

		/**
		 * Callback when presentation animation completes.
		 */
		onPresentationComplete?: (() => void) | undefined;

		/**
		 * Callback when dismissal animation completes.
		 */
		onDismissalComplete?: (() => void) | undefined;

		/**
		 * Custom spring configuration for animations.
		 * @default Uses drawer preset (0.35s duration, 0.25 bounce)
		 */
		springConfig?: Partial<SpringConfig> | undefined;

		/**
		 * Disable all default styling.
		 * When true, component behaves more like the primitive.
		 * @default false
		 */
		unstyled?: boolean | undefined;

		/**
		 * Override container classes.
		 */
		class?: string | undefined;

		/**
		 * Override header classes.
		 */
		headerClass?: string | undefined;

		/**
		 * Override content classes.
		 */
		contentClass?: string | undefined;

		/**
		 * Show back button in header.
		 * @default true
		 */
		showBackButton?: boolean | undefined;

		/**
		 * Content snippet. Receives the render state of the presented layer.
		 */
		children?: Snippet<
			[
				{
					visible: boolean;
					store: ChildView<State, Action> | undefined;
					currentScreen: State | undefined;
					canGoBack: boolean;
					onBack: (() => void) | undefined;
				}
			]
		> | undefined;
	}

	let {
		store,
		stack,
		presentation,
		onBack,
		onPresentationComplete,
		onDismissalComplete,
		springConfig,
		unstyled = false,
		class: className,
		headerClass,
		contentClass,
		showBackButton = true,
		children: renderContent
	}: AnimatedNavigationStackProps<unknown, unknown> = $props();

	// ============================================================================
	// Computed Classes
	// ============================================================================

	const defaultContainerClasses = 'flex flex-col h-full';
	const defaultHeaderClasses = 'flex items-center border-b bg-background px-4 py-3';
	const defaultBackButtonClasses =
		'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 w-10';
	const defaultContentClasses = 'flex-1 overflow-hidden relative'; // Changed to relative for positioning

	const containerClasses = $derived(unstyled ? '' : cn(defaultContainerClasses, className));

	const headerClassNames = $derived(unstyled ? '' : cn(defaultHeaderClasses, headerClass));

	const contentClassNames = $derived(unstyled ? '' : cn(defaultContentClasses, contentClass));

	// ============================================================================
	// Animation State
	// ============================================================================

	let currentScreenElement: HTMLElement | null = $state(null);
	let previousScreenElement: HTMLElement | null = $state(null);

	// Presentation content is generic: optional business IDs cannot identify a
	// renderer lifetime. Keep the actual content and mounted layer identities.
	let lastAnimated: {
		status: string;
		content: unknown;
		depth: number;
		current: HTMLElement;
		previous: HTMLElement | null;
	} | null = null;
	let frozenCurrentScreen: unknown = $state(null);

	// Track transition direction based on presentation state
	const isAnimating = $derived(
		presentation.status === 'presenting' || presentation.status === 'dismissing'
	);
	const isPushing = $derived(presentation.status === 'presenting');
	const isPopping = $derived(presentation.status === 'dismissing');

	// ============================================================================
	// Animation Integration
	// ============================================================================

	$effect(() => {
		const status = presentation.status;
		if (status !== 'presenting' && status !== 'dismissing') {
			lastAnimated = null;
			frozenCurrentScreen = null;
			return;
		}
		const current = currentScreenElement;
		const previous = previousScreenElement;
		if (!current) return;
		const content = presentation.content;
		const depth = stack.length;
		if (lastAnimated?.status === status && lastAnimated.content === content &&
			lastAnimated.depth === depth && lastAnimated.current === current &&
			lastAnimated.previous === previous) return;
		lastAnimated = { status, content, depth, current, previous };
		frozenCurrentScreen = stack[stack.length - 1];
		const owner = new AbortController();
		let completed = false;
		const incoming = status === 'presenting';
		const foreground = incoming ? animateStackPushIn : animateStackPopOut;
		const background = incoming ? animateStackPushOut : animateStackPopIn;
		Promise.all([
			foreground(current, springConfig, owner.signal),
			previous ? background(previous, springConfig, owner.signal) : Promise.resolve()
		]).then(() => {
			queueMicrotask(() => {
				if (owner.signal.aborted) return;
				current.style.transform = '';
				current.style.opacity = '';
				if (previous) {
					previous.style.transform = '';
					previous.style.opacity = '';
				}
				completed = true;
				if (incoming) onPresentationComplete?.();
				else onDismissalComplete?.();
			});
		});
		return () => {
			owner.abort();
			if (!completed) lastAnimated = null;
		};
	});
</script>

<NavigationStackPrimitive {store} {stack} {onBack}>
	{#snippet children({ visible, store, currentScreen, previousScreen, canGoBack, onBack })}
		<div class={containerClasses} role="navigation" aria-label="Navigation stack">
			{#if showBackButton && canGoBack}
				<header class={headerClassNames}>
					<button class={defaultBackButtonClasses} onclick={onBack} aria-label="Go back">
						←
					</button>
				</header>
			{/if}

			<div class={contentClassNames}>
				<!-- Previous screen layer (behind) - shown during animations -->
				<!-- Always render with CURRENT state (not frozen) so it shows correctly after pop -->
				<!-- Keep div mounted at all times to preserve element binding -->
				<div
					bind:this={previousScreenElement}
					class="absolute inset-0 z-10"
					style:visibility={isAnimating && previousScreen ? 'visible' : 'hidden'}
				>
					{#if previousScreen}
						{@render renderContent?.({ visible, store, currentScreen: previousScreen, canGoBack, onBack })}
					{/if}
				</div>

				<!-- Current screen layer (on top) - always visible when there's a screen to show -->
				<!-- Use frozen during POP (so dismissing screen doesn't change), otherwise use current -->
				<!-- Keep div mounted at all times to preserve element binding -->
				<div
					bind:this={currentScreenElement}
					class="absolute inset-0 z-20"
				>
					{#if frozenCurrentScreen || currentScreen}
						{@render renderContent?.({ visible, store, currentScreen: frozenCurrentScreen || currentScreen, canGoBack, onBack })}
					{/if}
				</div>
			</div>
		</div>
	{/snippet}
</NavigationStackPrimitive>

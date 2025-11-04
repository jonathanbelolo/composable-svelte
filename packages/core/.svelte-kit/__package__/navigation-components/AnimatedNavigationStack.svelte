<script lang="ts">
	import NavigationStackPrimitive from './primitives/NavigationStackPrimitive.svelte';
	import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
	import type { PresentationState } from '../navigation/types.js';
	import type { SpringConfig } from '../animation/spring.js';
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
		store: ScopedDestinationStore<State, Action> | null;

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
		onBack?: () => void;

		/**
		 * Callback when presentation animation completes.
		 */
		onPresentationComplete?: () => void;

		/**
		 * Callback when dismissal animation completes.
		 */
		onDismissalComplete?: () => void;

		/**
		 * Custom spring configuration for animations.
		 * @default Uses drawer preset (0.35s duration, 0.25 bounce)
		 */
		springConfig?: Partial<SpringConfig>;

		/**
		 * Disable all default styling.
		 * When true, component behaves more like the primitive.
		 * @default false
		 */
		unstyled?: boolean;

		/**
		 * Override container classes.
		 */
		class?: string;

		/**
		 * Override header classes.
		 */
		headerClass?: string;

		/**
		 * Override content classes.
		 */
		contentClass?: string;

		/**
		 * Show back button in header.
		 * @default true
		 */
		showBackButton?: boolean;
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
		children
	}: AnimatedNavigationStackProps<unknown, unknown> = $props();

	// ============================================================================
	// Computed Classes
	// ============================================================================

	const defaultContainerClasses = 'flex flex-col h-full';
	const defaultHeaderClasses = 'flex items-center border-b bg-background px-4 py-3';
	const defaultBackButtonClasses =
		'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 w-10';
	const defaultContentClasses = 'flex-1 overflow-hidden relative'; // Changed to relative for positioning

	const containerClasses = $derived(unstyled ? '' : cn(defaultContainerClasses, className));

	const headerClassNames = $derived(unstyled ? '' : cn(defaultHeaderClasses, headerClass));

	const contentClassNames = $derived(unstyled ? '' : cn(defaultContentClasses, contentClass));

	// ============================================================================
	// Animation State
	// ============================================================================

	let currentScreenElement: HTMLElement | null = $state(null);
	let previousScreenElement: HTMLElement | null = $state(null);

	// Track the last animated presentation to prevent duplicate animations
	let lastAnimatedPresentationKey: string | null = $state(null);

	// Helper to create unique key for each presentation change
	// Include stack length to ensure each push/pop has a unique key
	function getPresentationKey(p: PresentationState<any>, stackLen: number): string {
		const contentId = p.content?.id || 'null';
		return `${p.status}:${contentId}:${stackLen}`;
	}

	// Freeze ONLY the current screen during dismissal to prevent it from changing mid-animation
	// Previous screen is always rendered with live state so it appears correct after pop
	let frozenCurrentScreen: any = $state(null);

	// Track when animation promise completes
	let animationPromiseCompleted = $state(false);

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
		console.log('[AnimatedNavigationStack] Effect triggered:', {
			status: presentation.status,
			stackLength: stack.length,
			isAnimating,
			animationPromiseCompleted,
			frozenCurrent: frozenCurrentScreen,
			currentScreen: stack[stack.length - 1],
			previousScreen: stack.length > 1 ? stack[stack.length - 2] : null,
			hasCurrentElement: !!currentScreenElement,
			hasPreviousElement: !!previousScreenElement
		});

		// Unfreeze current screen when BOTH conditions are met:
		// 1. Animation promise has completed
		// 2. Status has returned to 'presented' or 'idle'
		if (animationPromiseCompleted && (presentation.status === 'presented' || presentation.status === 'idle')) {
			if (frozenCurrentScreen !== null) {
				console.log('[AnimatedNavigationStack] Unfreezing current screen: promise done + status is', presentation.status);
				frozenCurrentScreen = null;
				animationPromiseCompleted = false; // Reset for next animation
			}
		}

		// Handle push animations (new screen slides in from right, previous screen slides left)
		const currentPresentationKey = getPresentationKey(presentation, stack.length);
		if (
			presentation.status === 'presenting' &&
			currentScreenElement &&
			lastAnimatedPresentationKey !== currentPresentationKey
		) {
			lastAnimatedPresentationKey = currentPresentationKey;
			animationPromiseCompleted = false;

			// Freeze the current screen (new screen being presented) at animation start
			// Previous screen uses live state (no need to freeze)
			frozenCurrentScreen = stack[stack.length - 1];

			console.log('[AnimatedNavigationStack] Starting PUSH animation', { presentationKey: currentPresentationKey });

			// Animate current screen sliding in from right
			animateStackPushIn(currentScreenElement, springConfig).then(() => {
				console.log('[AnimatedNavigationStack] PUSH animation promise completed');

				// Clear transforms AND opacity to prevent white screen issues
				if (currentScreenElement) {
					currentScreenElement.style.transform = '';
					currentScreenElement.style.opacity = '';
				}
				if (previousScreenElement) {
					previousScreenElement.style.transform = '';
					previousScreenElement.style.opacity = '';
				}

				animationPromiseCompleted = true;

				if (onPresentationComplete) {
					queueMicrotask(() => onPresentationComplete());
				}
			});

			// Animate previous screen sliding left (if it exists)
			if (previousScreenElement) {
				animateStackPushOut(previousScreenElement, springConfig);
			}
		}

		// Handle pop animations (current screen slides out to right, previous screen slides in from left)
		if (
			presentation.status === 'dismissing' &&
			currentScreenElement &&
			lastAnimatedPresentationKey !== currentPresentationKey
		) {
			console.log('[AnimatedNavigationStack] Starting POP animation', {
				presentationKey: currentPresentationKey,
				previousKey: lastAnimatedPresentationKey,
				stackLength: stack.length
			});

			lastAnimatedPresentationKey = currentPresentationKey;
			animationPromiseCompleted = false;

			// Freeze ONLY the current screen (the one being dismissed)
			// Previous screen uses live state so it appears correct when animation completes
			frozenCurrentScreen = stack[stack.length - 1];

			// Animate current screen sliding out to right
			animateStackPopOut(currentScreenElement, springConfig).then(() => {
				console.log('[AnimatedNavigationStack] POP animation promise completed');

				// Clear transforms AND opacity to prevent white screen issues
				if (currentScreenElement) {
					currentScreenElement.style.transform = '';
					currentScreenElement.style.opacity = '';
				}
				if (previousScreenElement) {
					previousScreenElement.style.transform = '';
					previousScreenElement.style.opacity = '';
				}

				animationPromiseCompleted = true;

				if (onDismissalComplete) {
					queueMicrotask(() => onDismissalComplete());
				}
			});

			// Animate previous screen sliding in from left (if it exists)
			if (previousScreenElement) {
				animateStackPopIn(previousScreenElement, springConfig);
			}
		} else if (presentation.status === 'dismissing') {
			console.log('[AnimatedNavigationStack] POP animation BLOCKED:', {
				hasCurrentElement: !!currentScreenElement,
				currentKey: currentPresentationKey,
				lastKey: lastAnimatedPresentationKey,
				status: presentation.status
			});
		}
	});
</script>

<NavigationStackPrimitive {store} {stack} {onBack}>
	{#snippet children({ visible, store, currentScreen, previousScreen, canGoBack, onBack })}
		{#if typeof window !== 'undefined'}
			{@const screenToRender = frozenCurrentScreen || currentScreen}
			{@const _ = console.log('[AnimatedNavigationStack] RENDER:', {
				isAnimating,
				frozenCurrent: frozenCurrentScreen,
				currentScreen,
				previousScreen,
				screenToRender
			})}
		{/if}
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
						{@render children?.({ visible, store, currentScreen: previousScreen, canGoBack, onBack })}
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
						{@render children?.({ visible, store, currentScreen: frozenCurrentScreen || currentScreen, canGoBack, onBack })}
					{/if}
				</div>
			</div>
		</div>
	{/snippet}
</NavigationStackPrimitive>

<script lang="ts">
	import { cn } from '../../../utils.js';
	import type { HTMLImgAttributes } from 'svelte/elements';

	/**
	 * Avatar component for displaying user profile images with fallback support.
	 *
	 * @packageDocumentation
	 *
	 * @example
	 * ```svelte
	 * <!-- With image -->
	 * <Avatar src="/user.jpg" alt="John Doe" fallback="JD" />
	 *
	 * <!-- With initials only -->
	 * <Avatar fallback="AB" size="lg" />
	 *
	 * <!-- Custom styling -->
	 * <Avatar src="/avatar.png" alt="User" fallback="U" class="ring-2 ring-primary" />
	 * ```
	 */

	interface AvatarProps extends Omit<HTMLImgAttributes, 'class' | 'src' | 'alt' | 'children'> {
		/**
		 * Image source URL (optional).
		 */
		src?: string | undefined;

		/**
		 * Alternative text for the image.
		 */
		alt?: string | undefined;

		/**
		 * Fallback text to display when image fails to load or is not provided.
		 * Typically initials (e.g., "JD" for John Doe).
		 */
		fallback: string;

		/**
		 * Size variant of the avatar.
		 */
		size?: 'sm' | 'md' | 'lg' | 'xl' | undefined;

		/**
		 * Additional CSS classes.
		 */
		class?: HTMLImgAttributes['class'] | undefined;
	}

	let {
		src,
		alt = '',
		fallback,
		size = 'md',
		class: className,
		onload,
		onerror,
		...restProps
	}: AvatarProps = $props();

	let imageLoaded = $state(false);
	let imageError = $state(false);

	let currentImage = $state<HTMLImageElement>();
	let previousSource: string | undefined;

	// Reset before rendering a different source, including recovery after failure.
	$effect.pre(() => {
		if (src !== previousSource) {
			previousSource = src;
			imageLoaded = false;
			imageError = false;
		}
	});

	// A cached/server-rendered image may complete before handlers are attached.
	$effect(() => {
		const image = currentImage;
		if (image?.complete) {
			const loaded = image.naturalWidth > 0;
			imageLoaded = loaded;
			imageError = !loaded;
		}
	});

	const sizeClasses = {
		sm: 'h-8 w-8 text-xs',
		md: 'h-10 w-10 text-sm',
		lg: 'h-12 w-12 text-base',
		xl: 'h-16 w-16 text-lg'
	};

	const baseClasses =
		'relative inline-flex items-center justify-center overflow-hidden rounded-full bg-muted';

	function handleImageLoad(event: Event & { currentTarget: EventTarget & Element }) {
		if (event.currentTarget !== currentImage) return;
		imageLoaded = true;
		imageError = false;
		onload?.(event);
	}

	function handleImageError(event: Event & { currentTarget: EventTarget & Element }) {
		if (event.currentTarget !== currentImage) return;
		imageError = true;
		imageLoaded = false;
		onerror?.(event);
	}

	const avatarClasses = $derived(cn(baseClasses, sizeClasses[size], className));

	// Show fallback if: no src provided, image failed to load, or image hasn't loaded yet
	const showFallback = $derived(!src || imageError || !imageLoaded);
</script>

<span class={avatarClasses}>
	{#key src}
	{#if src && !imageError}
		<img
			{src}
			{alt}
			bind:this={currentImage}
			class="absolute inset-0 h-full w-full object-cover"
			class:invisible={!imageLoaded}
			onload={handleImageLoad}
			onerror={handleImageError}
			{...restProps}
		/>
	{/if}
	{/key}
	{#if showFallback}
		<span class="font-medium text-muted-foreground select-none">
			{fallback}
		</span>
	{/if}
</span>

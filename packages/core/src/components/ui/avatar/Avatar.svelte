<script lang="ts">
	import { cn } from '$lib/utils.js';
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

	interface AvatarProps extends Omit<HTMLImgAttributes, 'class' | 'src' | 'alt'> {
		/**
		 * Image source URL (optional).
		 */
		src?: string;

		/**
		 * Alternative text for the image.
		 */
		alt?: string;

		/**
		 * Fallback text to display when image fails to load or is not provided.
		 * Typically initials (e.g., "JD" for John Doe).
		 */
		fallback: string;

		/**
		 * Size variant of the avatar.
		 */
		size?: 'sm' | 'md' | 'lg' | 'xl';

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		src,
		alt = '',
		fallback,
		size = 'md',
		class: className,
		...restProps
	}: AvatarProps = $props();

	let imageLoaded = $state(false);
	let imageError = $state(false);

	const sizeClasses = {
		sm: 'h-8 w-8 text-xs',
		md: 'h-10 w-10 text-sm',
		lg: 'h-12 w-12 text-base',
		xl: 'h-16 w-16 text-lg'
	};

	const baseClasses =
		'relative inline-flex items-center justify-center overflow-hidden rounded-full bg-muted';

	function handleImageLoad() {
		imageLoaded = true;
		imageError = false;
	}

	function handleImageError() {
		imageError = true;
		imageLoaded = false;
	}

	const avatarClasses = $derived(cn(baseClasses, sizeClasses[size], className));

	// Show fallback if: no src provided, image failed to load, or image hasn't loaded yet
	const showFallback = $derived(!src || imageError || !imageLoaded);
</script>

<span class={avatarClasses}>
	{#if src && !imageError}
		<img
			{src}
			{alt}
			class="h-full w-full object-cover"
			class:hidden={!imageLoaded}
			onload={handleImageLoad}
			onerror={handleImageError}
			{...restProps}
		/>
	{/if}
	{#if showFallback}
		<span class="font-medium text-muted-foreground select-none">
			{fallback}
		</span>
	{/if}
</span>

<script lang="ts">
	import ImageGallery from '../../src/lib/components/image-gallery/ImageGallery.svelte';
	import type { GalleryImage } from '../../src/lib/components/image-gallery/image-gallery.types.js';

	/**
	 * Both modes of `<ImageGallery>`'s mutually-exclusive props union, forwarded.
	 *
	 * Nothing renders this — it exists to be **typechecked**. The union's "not
	 * this mode" members were `?: never`, which under `exactOptionalPropertyTypes`
	 * refuses an explicit `undefined` — and every optional read from `$props()`
	 * *is* `T | undefined`. So neither branch could be forwarded, in either
	 * direction. They are `?: undefined` now, which still refuses a real value.
	 *
	 * **This file's own props are deliberately bare**, as with every
	 * `*PropForwarding` fixture: they simulate the naïve consumer.
	 */
	let {
		images,
		columns,
		gap,
		onImageClick,
		enableLightbox,
		class: className
	}: {
		images: GalleryImage[];
		columns?: number;
		gap?: number;
		onImageClick?: (image: GalleryImage, index: number) => void;
		enableLightbox?: boolean;
		class?: string;
	} = $props();
</script>

<ImageGallery
	{images}
	{columns}
	{gap}
	{onImageClick}
	{enableLightbox}
	class={className}
/>

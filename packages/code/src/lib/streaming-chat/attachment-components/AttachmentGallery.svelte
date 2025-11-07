<script lang="ts">
	/**
	 * AttachmentGallery Component
	 *
	 * Container for displaying multiple message attachments.
	 * Routes each attachment to the appropriate specialized preview component.
	 */
	import type { MessageAttachment } from '../types.js';
	import ImagePreview from './ImagePreview.svelte';
	import PDFViewer from './PDFViewer.svelte';
	import AudioPlayer from './AudioPlayer.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import FileAttachment from './FileAttachment.svelte';

	interface Props {
		/** Array of attachments to display */
		attachments: MessageAttachment[];
		/** Optional class name */
		class?: string;
		/** Layout mode: 'grid' or 'list' (default: 'grid') */
		layout?: 'grid' | 'list';
		/** Max columns for grid layout (default: 2) */
		maxColumns?: number;
		/** Show attachment count header (default: true) */
		showCount?: boolean;
	}

	let {
		attachments,
		class: className = '',
		layout = 'grid',
		maxColumns = 2,
		showCount = true
	}: Props = $props();

	// Group attachments by category for better organization
	// Note: attachment.type is already the category ('image', 'video', 'pdf', etc.)
	const categorizedAttachments = $derived(
		attachments.map((attachment) => ({
			attachment,
			category: attachment.type
		}))
	);

	// Get grid column count based on attachment count and maxColumns
	const gridColumns = $derived(Math.min(attachments.length, maxColumns));
</script>

<div class="attachment-gallery {className}" data-layout={layout}>
	{#if showCount && attachments.length > 0}
		<div class="gallery-header">
			<span class="attachment-count">
				{attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'}
			</span>
		</div>
	{/if}

	{#if attachments.length === 0}
		<div class="gallery-empty">
			<span class="empty-icon">📎</span>
			<p class="empty-text">No attachments</p>
		</div>
	{:else}
		<div
			class="gallery-content"
			style="--grid-columns: {layout === 'grid' ? gridColumns : 1}"
		>
			{#each categorizedAttachments as { attachment, category }, index (attachment.id || `${attachment.filename}-${index}`)}
				<div class="gallery-item" data-category={category}>
					{#if category === 'image'}
						<ImagePreview {attachment} />
					{:else if category === 'pdf'}
						<PDFViewer {attachment} maxWidth={layout === 'grid' ? 500 : 800} />
					{:else if category === 'audio'}
						<AudioPlayer {attachment} />
					{:else if category === 'video'}
						<VideoPlayer {attachment} />
					{:else}
						<FileAttachment {attachment} />
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.attachment-gallery {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
	}

	.attachment-count {
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
	}

	.gallery-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		background: #f9fafb;
		border: 1px dashed #d1d5db;
		border-radius: 0.5rem;
		gap: 0.75rem;
	}

	.empty-icon {
		font-size: 3rem;
		opacity: 0.5;
	}

	.empty-text {
		margin: 0;
		font-size: 0.875rem;
		color: #9ca3af;
	}

	.gallery-content {
		display: grid;
		grid-template-columns: repeat(var(--grid-columns, 1), minmax(0, 1fr));
		gap: 1rem;
		width: 100%;
	}

	/* List layout - single column */
	.attachment-gallery[data-layout='list'] .gallery-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.gallery-item {
		display: flex;
		min-width: 0; /* Prevent grid overflow */
	}

	.gallery-item > :global(*) {
		width: 100%;
	}

	/* Responsive: Always single column on mobile */
	@media (max-width: 640px) {
		.gallery-content {
			grid-template-columns: 1fr;
		}
	}

	/* Image-specific styling in grid layout */
	.attachment-gallery[data-layout='grid'] .gallery-item[data-category='image'] {
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: 0.5rem;
	}

	.attachment-gallery[data-layout='grid']
		.gallery-item[data-category='image']
		:global(.image-preview) {
		height: 100%;
	}

	.attachment-gallery[data-layout='grid']
		.gallery-item[data-category='image']
		:global(.image-preview img) {
		object-fit: cover;
		height: 100%;
	}
</style>

<script lang="ts">
	/**
	 * PendingAttachmentPreview Component
	 *
	 * Enhanced preview tile for pending attachments (before sending).
	 * Shows thumbnails for images/videos, detailed info for files.
	 * Click to open full preview modal for verification.
	 */
	import type { MessageAttachment } from '../types.js';
	import { getFileTypeIcon, formatFileSize } from '../utils.js';

	interface Props {
		/** Attachment to preview */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
		/** Click handler to open full preview */
		onclick?: () => void;
		/** Remove handler */
		onremove?: () => void;
	}

	let { attachment, class: className = '', onclick, onremove }: Props = $props();

	// Determine if we can show a visual preview
	const hasVisualPreview = $derived(
		attachment.type === 'image' || attachment.type === 'video'
	);
</script>

<div class="pending-attachment {className}">
	<button
		type="button"
		class="pending-attachment__content"
		onclick={onclick}
		aria-label="Preview {attachment.filename}"
		title="Click to preview"
	>
		{#if attachment.type === 'image'}
			<!-- Image thumbnail -->
			<div class="pending-attachment__thumbnail">
				<img src={attachment.url} alt={attachment.filename} />
			</div>
		{:else if attachment.type === 'video'}
			<!-- Video thumbnail -->
			<div class="pending-attachment__thumbnail pending-attachment__thumbnail--video">
				<video src={attachment.url} preload="metadata" />
				<div class="pending-attachment__play-icon">▶</div>
			</div>
		{:else}
			<!-- File icon -->
			<div class="pending-attachment__icon">
				<span class="pending-attachment__icon-text">
					{getFileTypeIcon(attachment.type)}
				</span>
			</div>
		{/if}

		<!-- File info -->
		<div class="pending-attachment__info">
			<span class="pending-attachment__filename" title={attachment.filename}>
				{attachment.filename}
			</span>
			<span class="pending-attachment__meta">
				{formatFileSize(attachment.size)}
				{#if attachment.metadata}
					{#if attachment.metadata.width && attachment.metadata.height}
						• {attachment.metadata.width}×{attachment.metadata.height}
					{:else if attachment.metadata.duration}
						• {Math.floor(attachment.metadata.duration)}s
					{/if}
				{/if}
			</span>
		</div>
	</button>

	<!-- Remove button -->
	{#if onremove}
		<button
			type="button"
			class="pending-attachment__remove"
			onclick={(e) => {
				e.stopPropagation();
				onremove?.();
			}}
			aria-label="Remove {attachment.filename}"
			title="Remove attachment"
		>
			✕
		</button>
	{/if}
</div>

<style>
	.pending-attachment {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.pending-attachment:hover {
		border-color: #007aff;
		box-shadow: 0 2px 8px rgba(0, 122, 255, 0.1);
	}

	.pending-attachment__content {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.pending-attachment__thumbnail {
		width: 60px;
		height: 60px;
		border-radius: 6px;
		overflow: hidden;
		flex-shrink: 0;
		background: #f5f5f5;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	.pending-attachment__thumbnail img,
	.pending-attachment__thumbnail video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.pending-attachment__thumbnail--video::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.3));
		pointer-events: none;
	}

	.pending-attachment__play-icon {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 24px;
		height: 24px;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 10px;
		padding-left: 2px;
		pointer-events: none;
	}

	.pending-attachment__icon {
		width: 60px;
		height: 60px;
		border-radius: 6px;
		background: #f5f5f5;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border: 1px solid #e0e0e0;
	}

	.pending-attachment__icon-text {
		font-size: 28px;
	}

	.pending-attachment__info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.pending-attachment__filename {
		font-size: 14px;
		font-weight: 600;
		color: #1a1a1a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pending-attachment__meta {
		font-size: 12px;
		color: #666;
	}

	.pending-attachment__remove {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #f5f5f5;
		border: 1px solid #e0e0e0;
		color: #666;
		font-size: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.2s, color 0.2s, border-color 0.2s;
		flex-shrink: 0;
	}

	.pending-attachment__remove:hover {
		background: #fee;
		color: #c00;
		border-color: #fcc;
	}

	.pending-attachment__remove:active {
		transform: scale(0.95);
	}

	/* Dark mode support */
	:global(.dark) .pending-attachment {
		background: #2a2a2a;
		border-color: #444;
	}

	:global(.dark) .pending-attachment:hover {
		border-color: #0066cc;
		box-shadow: 0 2px 8px rgba(0, 102, 204, 0.2);
	}

	:global(.dark) .pending-attachment__thumbnail,
	:global(.dark) .pending-attachment__icon {
		background: #1a1a1a;
		border-color: #444;
	}

	:global(.dark) .pending-attachment__filename {
		color: #e0e0e0;
	}

	:global(.dark) .pending-attachment__meta {
		color: #999;
	}

	:global(.dark) .pending-attachment__remove {
		background: #1a1a1a;
		border-color: #444;
		color: #999;
	}

	:global(.dark) .pending-attachment__remove:hover {
		background: #3a1a1a;
		color: #f66;
		border-color: #644;
	}
</style>

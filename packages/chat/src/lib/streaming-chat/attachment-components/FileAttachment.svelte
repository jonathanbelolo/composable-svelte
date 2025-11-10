<script lang="ts">
	/**
	 * FileAttachment Component
	 *
	 * Generic file display for attachments without specialized previews.
	 * Shows file icon, name, size, type, and download button.
	 */
	import type { MessageAttachment } from '../types.js';
	import { formatFileSize } from '../utils.js';

	interface Props {
		/** File attachment to display */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
		/** Whether to show download button (default: true) */
		showDownload?: boolean;
	}

	let { attachment, class: className = '', showDownload = true }: Props = $props();

	// Get file extension
	const fileExtension = $derived(
		attachment.filename.includes('.')
			? attachment.filename.split('.').pop()?.toUpperCase()
			: 'FILE'
	);

	// Get file icon based on MIME type
	const fileIcon = $derived(getFileIcon(attachment.mimeType));

	function getFileIcon(mimeType: string): string {
		// Map MIME types to emoji icons
		if (mimeType.startsWith('text/')) return '📄';
		if (mimeType.startsWith('application/pdf')) return '📕';
		if (mimeType.startsWith('application/zip')) return '📦';
		if (mimeType.startsWith('application/x-zip')) return '📦';
		if (mimeType.startsWith('application/x-rar')) return '📦';
		if (mimeType.startsWith('application/x-7z')) return '📦';
		if (mimeType.startsWith('application/msword')) return '📘';
		if (mimeType.startsWith('application/vnd.openxmlformats-officedocument.word')) return '📘';
		if (mimeType.startsWith('application/vnd.ms-excel')) return '📗';
		if (mimeType.startsWith('application/vnd.openxmlformats-officedocument.spreadsheet'))
			return '📗';
		if (mimeType.startsWith('application/vnd.ms-powerpoint')) return '📙';
		if (mimeType.startsWith('application/vnd.openxmlformats-officedocument.presentation'))
			return '📙';
		if (mimeType.startsWith('application/json')) return '📋';
		if (mimeType.startsWith('application/xml')) return '📋';
		return '📎'; // Default file icon
	}

	function handleDownload() {
		// Create temporary link and trigger download
		const link = document.createElement('a');
		link.href = attachment.url;
		link.download = attachment.filename;
		link.click();
	}
</script>

<div class="file-attachment {className}">
	<div class="file-attachment-container">
		<!-- File Icon Section -->
		<div class="file-icon-section">
			<div class="file-icon-wrapper">
				<span class="file-icon">{fileIcon}</span>
				{#if fileExtension}
					<span class="file-extension">{fileExtension}</span>
				{/if}
			</div>
		</div>

		<!-- File Info Section -->
		<div class="file-info-section">
			<div class="file-details">
				<h3 class="file-name" title={attachment.filename}>
					{attachment.filename}
				</h3>
				<div class="file-meta">
					<span class="file-size">{formatFileSize(attachment.size)}</span>
					<span class="file-type-separator">•</span>
					<span class="file-type">{attachment.type}</span>
				</div>
			</div>

			<!-- Download Button -->
			{#if showDownload}
				<button class="download-btn" onclick={handleDownload} aria-label="Download file">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path
							d="M10 12.5a.5.5 0 01-.354-.146l-4-4a.5.5 0 11.708-.708L10 11.293l3.646-3.647a.5.5 0 01.708.708l-4 4A.5.5 0 0110 12.5z"
						/>
						<path d="M10 3a.5.5 0 01.5.5v8a.5.5 0 01-1 0v-8A.5.5 0 0110 3z" />
						<path
							d="M4 14.5a.5.5 0 01.5-.5h11a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-11a.5.5 0 01-.5-.5v-2z"
						/>
					</svg>
					<span>Download</span>
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.file-attachment {
		display: flex;
		flex-direction: column;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 600px;
	}

	.file-attachment-container {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem;
	}

	.file-icon-section {
		flex-shrink: 0;
	}

	.file-icon-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 4rem;
		height: 4rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
	}

	.file-icon {
		font-size: 2rem;
	}

	.file-extension {
		position: absolute;
		bottom: 0.25rem;
		right: 0.25rem;
		font-size: 0.625rem;
		font-weight: 600;
		color: #6b7280;
		background: white;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		border: 1px solid #e5e7eb;
		line-height: 1;
	}

	.file-info-section {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.file-details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.file-name {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #111827;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: #6b7280;
	}

	.file-size {
		font-weight: 500;
	}

	.file-type-separator {
		color: #d1d5db;
	}

	.file-type {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.download-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		background: #3b82f6;
		border: none;
		border-radius: 0.375rem;
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s;
		flex-shrink: 0;
	}

	.download-btn:hover {
		background: #2563eb;
	}

	.download-btn:active {
		background: #1d4ed8;
	}

	.download-btn:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.download-btn svg {
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.file-attachment-container {
			flex-direction: column;
			align-items: flex-start;
		}

		.file-info-section {
			width: 100%;
			flex-direction: column;
			align-items: flex-start;
		}

		.download-btn {
			width: 100%;
			justify-content: center;
		}
	}
</style>

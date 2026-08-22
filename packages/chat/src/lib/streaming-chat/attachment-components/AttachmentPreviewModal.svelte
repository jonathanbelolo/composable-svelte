<script lang="ts">
	/**
	 * AttachmentPreviewModal Component
	 *
	 * Full-screen modal for verifying pending attachments before sending.
	 * Shows large preview with metadata and remove option.
	 */
	import type { MessageAttachment } from '../types.js';
	import type { PresentationState } from '@composable-svelte/core';
	import {
		animateBackdropIn,
		animateBackdropOut,
		animatePopoverIn,
		animatePopoverOut
	} from '@composable-svelte/core/animation';
	import { formatFileSize } from '../utils.js';
	import ImagePreview from './ImagePreview.svelte';
	import VideoPlayer from './VideoPlayer.svelte';
	import AudioPlayer from './AudioPlayer.svelte';
	import PDFViewer from './PDFViewer.svelte';
	import FileAttachment from './FileAttachment.svelte';

	interface Props {
		/** Attachment to preview */
		attachment: MessageAttachment | null;
		/** Whether modal is open */
		open: boolean;
		/** Close handler */
		onclose: () => void;
		/** Remove attachment handler */
		onremove?: () => void;
		/**
		 * Animation lifecycle, when a store owns one.
		 *
		 * Optional on purpose. Left undefined the modal behaves exactly as it did
		 * before it could animate — appears and disappears instantly — which is how
		 * it is mounted standalone in tests and how any consumer holding it open
		 * with a plain boolean still gets a working dialog.
		 */
		presentation?: PresentationState<MessageAttachment> | undefined;
		onPresentationComplete?: (() => void) | undefined;
		onDismissalComplete?: (() => void) | undefined;
	}

	let {
		attachment,
		open,
		onclose,
		onremove,
		presentation = undefined,
		onPresentationComplete = undefined,
		onDismissalComplete = undefined
	}: Props = $props();

	// The element must outlive `open`. `open` goes false the moment a dismissal
	// starts — it is what the parent's UI reads — but the dialog has to stay
	// mounted for the exit animation to have something to animate.
	const visible = $derived(open || presentation?.status === 'dismissing');

	// Interactions are refused until the entrance finishes, mirroring the
	// reducer's own guards. With no `presentation` there is no entrance to wait
	// for, so the instant path stays fully interactive — which is what keeps
	// Escape working when the component is mounted standalone.
	const interactive = $derived(presentation ? presentation.status === 'presented' : true);

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && interactive) {
			onclose();
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && interactive) {
			onclose();
		}
	}

	// Format metadata for display
	const metadataDisplay = $derived(() => {
		if (!attachment?.metadata) return null;

		const items: string[] = [];

		if (attachment.metadata.width && attachment.metadata.height) {
			items.push(`${attachment.metadata.width} × ${attachment.metadata.height}`);
		}

		if (attachment.metadata.duration) {
			const minutes = Math.floor(attachment.metadata.duration / 60);
			const seconds = Math.floor(attachment.metadata.duration % 60);
			items.push(`${minutes}:${seconds.toString().padStart(2, '0')}`);
		}

		return items.length > 0 ? items.join(' • ') : null;
	});

	let dialogElement: HTMLDivElement | undefined = $state();
	let containerElement: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	// Without this the dialog is never focused, so keydown never reaches it and
	// Escape does nothing — the warning about the missing tabindex was pointing
	// at a modal with no keyboard exit. Mirrors ImageLightbox in core.
	// Keyed on `visible`, not `open`. Focus is taken as soon as the dialog exists
	// — synchronously, never behind the animation, because a 300ms window where
	// focus sits on a trigger behind an `aria-modal` overlay is a real defect and
	// because the Escape test dispatches from `document.activeElement` right after
	// mount. It is *restored* on unmount; keying the teardown on `open` would snap
	// focus back to the trigger the instant a dismissal began, while the dialog
	// was still on screen still claiming `aria-modal`.
	$effect(() => {
		if (!visible || !dialogElement) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		dialogElement.focus();
		return () => previouslyFocused?.focus();
	});

	// The (status, content) pair this effect last acted on.
	//
	// A plain `let`, never `$state`: the effect reads and writes it, and a
	// reactive guard would re-trigger the effect it lives in. Keyed on the pair
	// rather than "have I animated yet", because those diverge when a component
	// mounts already `presented` — and that difference is a permanent deadlock.
	let lastAnimated: { status: string; content: unknown } | null = null;

	// One effect fanning out over both elements, not two racing each other.
	// `animateBackdropIn/Out` for the dialog root, which is itself the backdrop,
	// and `animatePopoverIn/Out` for the container — deliberately not
	// `animateModalIn`, which hard-codes `translate(-50%, -50%)` for an
	// absolutely-positioned element and would shove this flex-centred container
	// up and left by half its own size, permanently.
	$effect(() => {
		if (!presentation || !dialogElement || !containerElement) return;

		if (presentation.status === 'idle') {
			lastAnimated = null;
			return;
		}

		const { status, content } = presentation;
		if (lastAnimated?.status === status && lastAnimated.content === content) return;
		lastAnimated = { status, content };

		if (status === 'presenting') {
			Promise.all([
				animateBackdropIn(dialogElement),
				animatePopoverIn(containerElement)
			]).then(() => queueMicrotask(() => onPresentationComplete?.()));
		}

		if (status === 'dismissing') {
			Promise.all([
				animateBackdropOut(dialogElement),
				animatePopoverOut(containerElement)
			]).then(() => queueMicrotask(() => onDismissalComplete?.()));
		}
	});
</script>

{#if visible && attachment}
	<!-- This element is itself the backdrop (fixed, inset 0, dark), so
	     handleBackdropClick's target check is what distinguishes a click outside
	     the container from one inside it. The dropped
	     `svelte-ignore a11y_no_noninteractive_element_interactions` suppressed
	     nothing: `dialog` is an interactive role, so that rule could never fire
	     here. -->
	<div
		bind:this={dialogElement}
		class="attachment-preview-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="preview-title"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="attachment-preview-modal__container" bind:this={containerElement}>
			<!-- Header -->
			<div class="attachment-preview-modal__header">
				<h2 id="preview-title" class="attachment-preview-modal__title">
					{attachment.filename}
				</h2>
				<button
					type="button"
					class="attachment-preview-modal__close"
					onclick={onclose}
					aria-label="Close preview"
				>
					✕
				</button>
			</div>

			<!-- Content -->
			<div class="attachment-preview-modal__content">
				{#if attachment.type === 'image'}
					<div class="attachment-preview-modal__image-wrapper">
						<ImagePreview {attachment} />
					</div>
				{:else if attachment.type === 'video'}
					<VideoPlayer {attachment} />
				{:else if attachment.type === 'audio'}
					<AudioPlayer {attachment} />
				{:else if attachment.type === 'pdf'}
					<PDFViewer {attachment} maxWidth={800} />
				{:else}
					<FileAttachment {attachment} showDownload={false} />
				{/if}
			</div>

			<!-- Footer with metadata -->
			<div class="attachment-preview-modal__footer">
				<div class="attachment-preview-modal__metadata">
					<div class="metadata-row">
						<span class="metadata-label">Size:</span>
						<span class="metadata-value">{formatFileSize(attachment.size)}</span>
					</div>
					<div class="metadata-row">
						<span class="metadata-label">Type:</span>
						<span class="metadata-value">{attachment.mimeType}</span>
					</div>
					{#if metadataDisplay()}
						<div class="metadata-row">
							<span class="metadata-label">Details:</span>
							<span class="metadata-value">{metadataDisplay()}</span>
						</div>
					{/if}
				</div>

				<!-- Actions -->
				<div class="attachment-preview-modal__actions">
					<button
						type="button"
						class="modal-button modal-button--secondary"
						onclick={onclose}
					>
						Close
					</button>
					{#if onremove}
						<button
							type="button"
							class="modal-button modal-button--danger"
							onclick={() => {
								onremove?.();
								onclose();
							}}
						>
							Remove
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.attachment-preview-modal {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}


	.attachment-preview-modal__container {
		background: white;
		border-radius: 12px;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}


	.attachment-preview-modal__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #e0e0e0;
		flex-shrink: 0;
	}

	.attachment-preview-modal__title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: #1a1a1a;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		padding-right: 16px;
	}

	.attachment-preview-modal__close {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: #f5f5f5;
		border: none;
		color: #666;
		font-size: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
	}

	.attachment-preview-modal__close:hover {
		background: #e0e0e0;
		color: #1a1a1a;
	}

	.attachment-preview-modal__content {
		flex: 1;
		overflow-y: auto;
		padding: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.attachment-preview-modal__image-wrapper {
		max-width: 100%;
		max-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.attachment-preview-modal__image-wrapper :global(.image-preview) {
		max-width: 100%;
		max-height: 60vh;
	}

	.attachment-preview-modal__image-wrapper :global(.image-preview img) {
		max-width: 100%;
		max-height: 60vh;
		width: auto;
		height: auto;
		object-fit: contain;
	}

	.attachment-preview-modal__footer {
		border-top: 1px solid #e0e0e0;
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex-shrink: 0;
	}

	.attachment-preview-modal__metadata {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.metadata-row {
		display: flex;
		gap: 12px;
		font-size: 14px;
	}

	.metadata-label {
		font-weight: 600;
		color: #666;
		min-width: 60px;
	}

	.metadata-value {
		color: #1a1a1a;
		word-break: break-word;
	}

	.attachment-preview-modal__actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
	}

	.modal-button {
		padding: 10px 20px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.modal-button:hover {
		opacity: 0.9;
	}

	.modal-button:active {
		transform: scale(0.98);
	}

	.modal-button--secondary {
		background: #f5f5f5;
		color: #1a1a1a;
	}

	.modal-button--secondary:hover {
		background: #e0e0e0;
	}

	.modal-button--danger {
		background: #dc2626;
		color: white;
	}

	.modal-button--danger:hover {
		background: #b91c1c;
	}

	/* Dark mode support */
	:global(.dark) .attachment-preview-modal__container {
		background: #1a1a1a;
	}

	:global(.dark) .attachment-preview-modal__header {
		border-bottom-color: #333;
	}

	:global(.dark) .attachment-preview-modal__title {
		color: #e0e0e0;
	}

	:global(.dark) .attachment-preview-modal__close {
		background: #2a2a2a;
		color: #999;
	}

	:global(.dark) .attachment-preview-modal__close:hover {
		background: #333;
		color: #e0e0e0;
	}

	:global(.dark) .attachment-preview-modal__footer {
		border-top-color: #333;
	}

	:global(.dark) .metadata-label {
		color: #999;
	}

	:global(.dark) .metadata-value {
		color: #e0e0e0;
	}

	:global(.dark) .modal-button--secondary {
		background: #2a2a2a;
		color: #e0e0e0;
	}

	:global(.dark) .modal-button--secondary:hover {
		background: #333;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.attachment-preview-modal {
			padding: 0;
		}

		.attachment-preview-modal__container {
			max-width: 100%;
			max-height: 100vh;
			border-radius: 0;
		}

		.attachment-preview-modal__header,
		.attachment-preview-modal__content,
		.attachment-preview-modal__footer {
			padding: 16px;
		}

		.attachment-preview-modal__actions {
			flex-direction: column-reverse;
		}

		.modal-button {
			width: 100%;
		}
	}
</style>

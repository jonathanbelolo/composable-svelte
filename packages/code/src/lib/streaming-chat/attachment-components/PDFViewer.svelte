<script lang="ts">
	/**
	 * PDFViewer Component
	 *
	 * Renders PDF attachments using PDF.js with navigation controls.
	 * Supports zoom, page navigation, and responsive rendering.
	 */
	import { onMount } from 'svelte';
	import type { MessageAttachment } from '../types.js';
	import * as pdfjsLib from 'pdfjs-dist';

	interface Props {
		/** PDF attachment to display */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
		/** Max width in pixels (default: 800) */
		maxWidth?: number;
	}

	let { attachment, class: className = '', maxWidth = 800 }: Props = $props();

	// State
	let canvasRef: HTMLCanvasElement | undefined = $state();
	let pdf: pdfjsLib.PDFDocumentProxy | null = $state(null);
	let currentPage = $state(1);
	let totalPages = $state(0);
	let scale = $state(1.5);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Configure PDF.js worker
	onMount(() => {
		// Set worker source from CDN
		pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
		loadPDF();
	});

	async function loadPDF() {
		try {
			isLoading = true;
			error = null;

			const loadingTask = pdfjsLib.getDocument(attachment.url);
			pdf = await loadingTask.promise;
			totalPages = pdf.numPages;

			await renderPage(currentPage);
			isLoading = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load PDF';
			isLoading = false;
		}
	}

	async function renderPage(pageNum: number) {
		if (!pdf || !canvasRef) return;

		try {
			const page = await pdf.getPage(pageNum);
			const viewport = page.getViewport({ scale });

			const context = canvasRef.getContext('2d');
			if (!context) return;

			// Set canvas dimensions
			canvasRef.width = viewport.width;
			canvasRef.height = viewport.height;

			// Render PDF page
			await page.render({
				canvasContext: context,
				viewport: viewport
			}).promise;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to render page';
		}
	}

	function previousPage() {
		if (currentPage > 1) {
			currentPage--;
			renderPage(currentPage);
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			renderPage(currentPage);
		}
	}

	function zoomIn() {
		scale = Math.min(scale + 0.25, 3);
		renderPage(currentPage);
	}

	function zoomOut() {
		scale = Math.max(scale - 0.25, 0.5);
		renderPage(currentPage);
	}

	function resetZoom() {
		scale = 1.5;
		renderPage(currentPage);
	}
</script>

<div class="pdf-viewer {className}" style="max-width: {maxWidth}px">
	<!-- Header -->
	<div class="pdf-viewer-header">
		<div class="pdf-viewer-title">
			<span class="pdf-icon">📄</span>
			<span class="pdf-filename">{attachment.filename}</span>
			{#if attachment.metadata?.pageCount}
				<span class="pdf-page-count">({attachment.metadata.pageCount} pages)</span>
			{/if}
		</div>
	</div>

	<!-- Loading State -->
	{#if isLoading}
		<div class="pdf-viewer-loading">
			<div class="spinner"></div>
			<p>Loading PDF...</p>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="pdf-viewer-error">
			<span class="error-icon">⚠️</span>
			<p>{error}</p>
		</div>
	{/if}

	<!-- PDF Canvas -->
	{#if !isLoading && !error}
		<div class="pdf-viewer-canvas-container">
			<canvas bind:this={canvasRef}></canvas>
		</div>

		<!-- Controls -->
		<div class="pdf-viewer-controls">
			<!-- Page Navigation -->
			<div class="pdf-viewer-pagination">
				<button
					class="pdf-btn"
					onclick={previousPage}
					disabled={currentPage === 1}
					aria-label="Previous page"
				>
					←
				</button>
				<span class="pdf-page-info">
					Page {currentPage} of {totalPages}
				</span>
				<button
					class="pdf-btn"
					onclick={nextPage}
					disabled={currentPage === totalPages}
					aria-label="Next page"
				>
					→
				</button>
			</div>

			<!-- Zoom Controls -->
			<div class="pdf-viewer-zoom">
				<button class="pdf-btn" onclick={zoomOut} disabled={scale <= 0.5} aria-label="Zoom out">
					−
				</button>
				<button class="pdf-btn" onclick={resetZoom} aria-label="Reset zoom">
					{Math.round(scale * 100)}%
				</button>
				<button class="pdf-btn" onclick={zoomIn} disabled={scale >= 3} aria-label="Zoom in">
					+
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.pdf-viewer {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.pdf-viewer-header {
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.pdf-viewer-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #111827;
	}

	.pdf-icon {
		font-size: 1.25rem;
	}

	.pdf-filename {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pdf-page-count {
		color: #6b7280;
		font-size: 0.75rem;
		font-weight: 400;
	}

	.pdf-viewer-loading,
	.pdf-viewer-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 1rem;
	}

	.pdf-viewer-loading p,
	.pdf-viewer-error p {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}

	.pdf-viewer-error {
		color: #dc2626;
	}

	.error-icon {
		font-size: 2rem;
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.pdf-viewer-canvas-container {
		display: flex;
		justify-content: center;
		padding: 1rem;
		overflow: auto;
		background: #f9fafb;
	}

	canvas {
		display: block;
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
		background: white;
	}

	.pdf-viewer-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-top: 1px solid #e5e7eb;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.pdf-viewer-pagination,
	.pdf-viewer-zoom {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pdf-page-info {
		font-size: 0.875rem;
		color: #6b7280;
		min-width: 8rem;
		text-align: center;
	}

	.pdf-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		height: 2.5rem;
		padding: 0 0.75rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s;
	}

	.pdf-btn:hover:not(:disabled) {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.pdf-btn:active:not(:disabled) {
		background: #f3f4f6;
	}

	.pdf-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.pdf-btn:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	@media (max-width: 640px) {
		.pdf-viewer-controls {
			flex-direction: column;
		}

		.pdf-viewer-pagination,
		.pdf-viewer-zoom {
			width: 100%;
			justify-content: center;
		}
	}
</style>

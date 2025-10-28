<script lang="ts">
  import { createStore } from '../../../store.svelte.js';
  import { fileUploadReducer } from './file-upload.reducer.js';
  import { createInitialFileUploadState, formatFileSize } from './file-upload.types.js';
  import type { FileValidationConfig } from './file-upload.types.js';

  interface Props {
    accept?: string;
    multiple?: boolean;
    showPreviews?: boolean;
    maxSize?: number;
    maxFiles?: number;
    dropzoneText?: string;
    onFilesChange?: (files: import('./file-upload.types.js').UploadedFile[]) => void;
    onUpload?: (file: File) => Promise<void>;
    class?: string;
    disabled?: boolean;
  }

  let {
    accept = '',
    multiple = true,
    showPreviews = true,
    maxSize = 5 * 1024 * 1024, // 5MB default
    maxFiles,
    dropzoneText = 'Drop files here or click to browse',
    onFilesChange,
    onUpload,
    class: className = '',
    disabled = false
  }: Props = $props();

  // Build validation config from props
  const validation = $derived<FileValidationConfig>({
    maxSize,
    acceptedTypes: accept ? accept.split(',').map((t) => t.trim()) : [],
    maxFiles
  });

  // Create file upload store with reducer
  const store = createStore({
    initialState: createInitialFileUploadState(),
    reducer: fileUploadReducer,
    dependencies: {
      onFilesChange,
      onUpload,
      validation
    }
  });

  let fileInputElement: HTMLInputElement | undefined = $state();

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (files && files.length > 0) {
      store.dispatch({ type: 'filesSelected', files: Array.from(files) });
    }

    // Reset input so same file can be selected again
    input.value = '';
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (!disabled) {
      store.dispatch({ type: 'dragEntered' });
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    // Only trigger if leaving the dropzone itself, not child elements
    const target = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement | null;

    if (!relatedTarget || !target.contains(relatedTarget)) {
      store.dispatch({ type: 'dragLeft' });
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (disabled) {
      store.dispatch({ type: 'dragLeft' });
      return;
    }

    const files = event.dataTransfer?.files;

    if (files && files.length > 0) {
      store.dispatch({ type: 'filesSelected', files: Array.from(files) });
    } else {
      store.dispatch({ type: 'dragLeft' });
    }
  }

  function handleDropzoneClick() {
    if (!disabled && fileInputElement) {
      fileInputElement.click();
    }
  }

  function handleRemoveFile(fileId: string) {
    store.dispatch({ type: 'fileRemoved', fileId });
  }

  function handleClearAll() {
    store.dispatch({ type: 'allFilesCleared' });
  }

  function handleDismissError(index: number) {
    store.dispatch({ type: 'errorDismissed', index });
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'text-gray-500';
      case 'uploading':
        return 'text-blue-500';
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return '○';
      case 'uploading':
        return '↻';
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      default:
        return '○';
    }
  }
</script>

<div class={`file-upload-container ${className}`}>
  <!-- Hidden file input -->
  <input
    bind:this={fileInputElement}
    type="file"
    {accept}
    {multiple}
    {disabled}
    onchange={handleFileInputChange}
    class="hidden"
    aria-label="File input"
  />

  <!-- Dropzone -->
  <div
    class={`file-dropzone relative border-2 border-dashed rounded-lg p-8 text-center
            transition-colors duration-200
            ${store.state.isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    ondragenter={handleDragEnter}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    onclick={handleDropzoneClick}
    role="button"
    tabindex={disabled ? -1 : 0}
    aria-label="File upload dropzone"
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDropzoneClick();
      }
    }}
  >
    <div class="flex flex-col items-center gap-2">
      <svg
        class="w-12 h-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>

      <p class="text-gray-600 font-medium">{dropzoneText}</p>

      {#if maxSize}
        <p class="text-sm text-gray-500">Maximum file size: {formatFileSize(maxSize)}</p>
      {/if}

      {#if maxFiles}
        <p class="text-sm text-gray-500">
          Maximum {maxFiles} file{maxFiles === 1 ? '' : 's'}
        </p>
      {/if}
    </div>
  </div>

  <!-- Validation Errors -->
  {#if store.state.errors.length > 0}
    <div class="mt-4 space-y-2">
      {#each store.state.errors as error, index (index)}
        <div
          class="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3
                 transition-opacity duration-200"
        >
          <div class="flex items-center gap-2">
            <span class="text-red-500">⚠</span>
            <p class="text-sm text-red-700">{error.message}</p>
          </div>
          <button
            onclick={() => handleDismissError(index)}
            class="text-red-400 hover:text-red-600 transition-colors"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- File List -->
  {#if store.state.files.length > 0}
    <div class="mt-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-gray-700">
          Files ({store.state.files.length})
        </h3>
        <button
          onclick={handleClearAll}
          class="text-sm text-red-600 hover:text-red-700 transition-colors"
          disabled={store.state.isUploading}
          aria-label="Clear all files"
        >
          Clear All
        </button>
      </div>

      <div class="space-y-3">
        {#each store.state.files as file (file.id)}
          <div
            class="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3
                   transition-opacity duration-200"
          >
            <!-- Preview (for images) -->
            {#if showPreviews && file.previewUrl}
              <img
                src={file.previewUrl}
                alt={file.file.name}
                class="w-12 h-12 object-cover rounded"
              />
            {/if}

            <!-- File Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class={`text-lg ${getStatusColor(file.status)}`}>
                  {getStatusIcon(file.status)}
                </span>
                <p class="text-sm font-medium text-gray-900 truncate">
                  {file.file.name}
                </p>
              </div>

              <p class="text-xs text-gray-500">
                {formatFileSize(file.file.size)}
              </p>

              <!-- Progress Bar (for uploading files) -->
              {#if file.status === 'uploading'}
                <div class="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style:width={`${file.progress}%`}
                  ></div>
                </div>
              {/if}

              <!-- Error Message -->
              {#if file.error}
                <p class="text-xs text-red-600 mt-1">{file.error}</p>
              {/if}
            </div>

            <!-- Remove Button -->
            <button
              onclick={() => handleRemoveFile(file.id)}
              class="text-gray-400 hover:text-gray-600 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={file.status === 'uploading'}
              aria-label={`Remove ${file.file.name}`}
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .file-upload-container {
    width: 100%;
  }

  .hidden {
    display: none;
  }
</style>

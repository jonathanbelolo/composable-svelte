<script lang="ts">
  import { FileUpload } from '@composable-svelte/core/components/ui/file-upload/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import type { UploadedFile } from '@composable-svelte/core/components/ui/file-upload/index.js';

  // State for different upload demos
  let basicFiles = $state<UploadedFile[]>([]);
  let imageFiles = $state<UploadedFile[]>([]);
  let singleFile = $state<UploadedFile[]>([]);
  let customFiles = $state<UploadedFile[]>([]);

  // Event logs
  let eventLog = $state<string[]>([]);

  function logEvent(message: string) {
    eventLog = [message, ...eventLog.slice(0, 4)]; // Keep last 5 events
  }

  function handleBasicFilesChange(files: UploadedFile[]) {
    basicFiles = files;
    logEvent(`Basic: ${files.length} file(s) selected`);
  }

  function handleImageFilesChange(files: UploadedFile[]) {
    imageFiles = files;
    logEvent(`Images: ${files.length} file(s) selected`);
  }

  function handleSingleFileChange(files: UploadedFile[]) {
    singleFile = files;
    if (files.length > 0) {
      logEvent(`Single: ${files[0].file.name} selected`);
    } else {
      logEvent('Single: File cleared');
    }
  }

  function handleCustomFilesChange(files: UploadedFile[]) {
    customFiles = files;
    logEvent(`Custom: ${files.length} file(s) selected`);
  }

  // Simulated upload function
  async function simulateUpload(file: File): Promise<void> {
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate random failures (20% chance)
    if (Math.random() < 0.2) {
      throw new Error('Upload failed: Network error');
    }
  }

  // Format bytes to human readable
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
</script>

<div class="space-y-12">
  <!-- Basic File Upload -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic File Upload</h3>
      <p class="text-muted-foreground text-sm">
        Simple drag & drop file upload with multiple files support
      </p>
    </div>

    <div class="space-y-4">
      <FileUpload
        multiple={true}
        maxSize={10 * 1024 * 1024}
        onFilesChange={handleBasicFilesChange}
      />

      {#if basicFiles.length > 0}
        <div class="text-sm">
          <p class="font-medium mb-2">Selected Files:</p>
          <div class="flex flex-wrap gap-2">
            {#each basicFiles as file}
              <Badge variant="secondary">
                {file.file.name} ({formatBytes(file.file.size)})
              </Badge>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Image Upload with Previews -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Image Upload with Previews</h3>
      <p class="text-muted-foreground text-sm">
        Upload images with preview thumbnails
      </p>
    </div>

    <div class="space-y-4">
      <FileUpload
        accept="image/*"
        multiple={true}
        showPreviews={true}
        maxSize={5 * 1024 * 1024}
        maxFiles={5}
        dropzoneText="Drop images here or click to browse"
        onFilesChange={handleImageFilesChange}
      />

      {#if imageFiles.length > 0}
        <div class="text-sm space-y-2">
          <div class="flex items-center gap-2">
            <Badge variant="primary">
              {imageFiles.length} image{imageFiles.length === 1 ? '' : 's'} selected
            </Badge>
            <span class="text-muted-foreground">•</span>
            <span class="text-muted-foreground">
              Total: {formatBytes(imageFiles.reduce((sum, f) => sum + f.file.size, 0))}
            </span>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Single File Upload -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Single File Upload</h3>
      <p class="text-muted-foreground text-sm">
        Upload only one file at a time
      </p>
    </div>

    <div class="space-y-4">
      <FileUpload
        accept=".pdf,.doc,.docx"
        multiple={false}
        maxSize={2 * 1024 * 1024}
        maxFiles={1}
        dropzoneText="Drop a document here (PDF, DOC, DOCX only)"
        onFilesChange={handleSingleFileChange}
      />

      {#if singleFile.length > 0}
        <div class="p-4 bg-muted rounded-lg">
          <p class="text-sm font-medium mb-2">Selected Document:</p>
          <div class="space-y-1">
            <p class="text-sm">{singleFile[0].file.name}</p>
            <p class="text-xs text-muted-foreground">
              {formatBytes(singleFile[0].file.size)} • {singleFile[0].file.type || 'Unknown type'}
            </p>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- Upload with Progress Simulation -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Upload with Progress Tracking</h3>
      <p class="text-muted-foreground text-sm">
        File upload with simulated progress and error handling
      </p>
    </div>

    <div class="space-y-4">
      <FileUpload
        multiple={true}
        maxSize={5 * 1024 * 1024}
        onFilesChange={handleCustomFilesChange}
        onUpload={simulateUpload}
        dropzoneText="Drop files to upload with progress tracking"
      />

      {#if customFiles.length > 0}
        <div class="text-sm space-y-2">
          <div class="flex items-center gap-2">
            <Badge variant={customFiles.some(f => f.status === 'uploading') ? 'default' : 'success'}>
              {customFiles.filter(f => f.status === 'success').length} / {customFiles.length} uploaded
            </Badge>
            {#if customFiles.some(f => f.status === 'error')}
              <Badge variant="destructive">
                {customFiles.filter(f => f.status === 'error').length} failed
              </Badge>
            {/if}
            {#if customFiles.some(f => f.status === 'uploading')}
              <span class="text-muted-foreground animate-pulse">Uploading...</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- File Size Constraints -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">File Size Constraints</h3>
      <p class="text-muted-foreground text-sm">
        Upload with strict file size limits (max 1MB)
      </p>
    </div>

    <FileUpload
      multiple={true}
      maxSize={1 * 1024 * 1024}
      dropzoneText="Only files under 1MB accepted"
    />
  </section>

  <!-- Event Callbacks -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Event Callbacks</h3>
      <p class="text-muted-foreground text-sm">
        File upload with event logging
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <FileUpload
          multiple={true}
          onFilesChange={(files) => {
            logEvent(`Files changed: ${files.map(f => f.file.name).join(', ')}`);
          }}
        />
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">Event Log</p>
        {#if eventLog.length > 0}
          <div class="space-y-1">
            {#each eventLog as event}
              <div class="text-xs bg-muted p-2 rounded">
                {event}
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-muted-foreground">Upload files to see events</p>
        {/if}
      </div>
    </div>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled State</h3>
      <p class="text-muted-foreground text-sm">
        File upload in disabled state
      </p>
    </div>

    <FileUpload
      disabled={true}
      dropzoneText="Upload is disabled"
    />
  </section>

  <!-- Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        File upload component applications
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📸</span>
          <span class="font-medium">Profile Pictures</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Upload user avatars and profile images
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📄</span>
          <span class="font-medium">Document Upload</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Upload PDFs, Word docs, and other documents
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🖼️</span>
          <span class="font-medium">Gallery Upload</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Multiple image uploads for photo galleries
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📊</span>
          <span class="font-medium">Data Import</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Upload CSV/Excel files for data import
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">📎</span>
          <span class="font-medium">Attachments</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Email and message attachments
        </p>
      </div>

      <div class="p-4 border rounded-lg space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-lg">🎥</span>
          <span class="font-medium">Media Upload</span>
        </div>
        <p class="text-muted-foreground text-xs">
          Upload videos and media files
        </p>
      </div>
    </div>
  </section>
</div>

# Multi-Modal Support: File Attachments & Previews

This document outlines the architecture for adding file attachment support to StreamingChat.

## Current Status

### ✅ Already Implemented in Core
- **FileUpload Component** (`@composable-svelte/core/components/ui/file-upload`)
  - Drag & drop support
  - File validation (size, type, max files)
  - Image previews
  - Upload progress tracking
  - Error handling
  - Built with Composable Architecture pattern
- **ImageGallery**: Displays images with lightbox
- **VideoEmbed**: Supports YouTube, Vimeo, Twitch videos

### ✅ Already in StreamingChat
- **Images**: ImageGallery extracts images from markdown in assistant messages
- **Videos**: VideoEmbed extracts video links from markdown

### ❌ What We Need to Build
- **Attachment support in Message type**: Add `attachments` field
- **Preview components**: PDF, Audio, Video (uploaded), Document viewers
- **Integration**: Connect FileUpload to chat input
- **State management**: Handle pending attachments before sending
- **Message rendering**: Display attachments in ChatMessage

---

## Architecture Overview

### 1. Message Type Extension

Extend the `Message` type to support attachments:

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: MessageAttachment[];  // NEW
}

interface MessageAttachment {
  id: string;
  type: 'image' | 'video' | 'pdf' | 'document' | 'audio' | 'file';
  filename: string;
  url: string;  // URL to file (uploaded, data URL, or blob URL)
  size: number;
  mimeType: string;
  metadata?: AttachmentMetadata;
}

interface AttachmentMetadata {
  // Images
  width?: number;
  height?: number;

  // Videos/Audio
  duration?: number;

  // PDFs/Documents
  pageCount?: number;

  // Generic
  thumbnail?: string;
}
```

### 2. State Management

Add attachment handling to state:

```typescript
interface StreamingChatState {
  // ... existing fields

  // NEW: File upload state
  pendingAttachments: PendingAttachment[];
  uploadingAttachments: Map<string, UploadProgress>;
}

interface PendingAttachment {
  id: string;
  file: File;
  preview?: string;  // Data URL for preview
}

interface UploadProgress {
  attachmentId: string;
  filename: string;
  loaded: number;
  total: number;
  percent: number;
}
```

### 3. Actions for File Handling

Add new actions to `StreamingChatAction`:

```typescript
type StreamingChatAction =
  | /* ... existing actions */

  // File attachment actions
  | { type: 'addPendingAttachment'; file: File }
  | { type: 'removePendingAttachment'; attachmentId: string }
  | { type: 'uploadAttachment'; attachmentId: string }
  | { type: 'uploadProgress'; attachmentId: string; loaded: number; total: number }
  | { type: 'uploadComplete'; attachmentId: string; url: string }
  | { type: 'uploadError'; attachmentId: string; error: string };
```

### 4. Dependencies Extension

Add upload capability to dependencies:

```typescript
interface StreamingChatDependencies {
  // ... existing fields

  // NEW: File upload handler
  uploadFile?: (
    file: File,
    onProgress: (loaded: number, total: number) => void
  ) => Promise<string>;  // Returns URL to uploaded file
}
```

---

## Component Architecture

### Preview Components

All preview components follow the same interface pattern:

```typescript
interface PreviewProps {
  attachment: MessageAttachment;
  maxHeight?: number;
  onClick?: () => void;
}
```

#### 1. PDFViewer.svelte
**Purpose**: Display PDF files inline with page navigation

**Features**:
- Page-by-page rendering using PDF.js
- Page navigation (prev/next, jump to page)
- Zoom controls (fit width, fit page, custom zoom)
- Full-screen mode
- Download button
- Page count display

**Libraries**:
- `pdfjs-dist` for PDF rendering
- Canvas-based rendering for each page

**Usage**:
```svelte
<PDFViewer
  attachment={{
    type: 'pdf',
    url: '/uploads/document.pdf',
    filename: 'document.pdf',
    size: 1024000,
    mimeType: 'application/pdf',
    metadata: { pageCount: 10 }
  }}
  maxHeight={600}
/>
```

#### 2. DocumentPreview.svelte
**Purpose**: Preview office documents (Word, Excel, PowerPoint)

**Options**:
1. **Server-side rendering**: Convert to images/PDF on server, display with PDFViewer
2. **Third-party viewer**: Use Google Docs Viewer, Office Online, or similar
3. **Thumbnail + Download**: Show thumbnail with download button

**Recommended**: Option 1 (server converts to PDF, then use PDFViewer)

**Supported formats**:
- Word: .doc, .docx
- Excel: .xls, .xlsx
- PowerPoint: .ppt, .pptx

**Usage**:
```svelte
<DocumentPreview
  attachment={{
    type: 'document',
    url: '/uploads/report.docx',
    filename: 'report.docx',
    size: 512000,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    metadata: { pageCount: 5, thumbnail: '/thumbnails/report.jpg' }
  }}
/>
```

#### 3. AudioPlayer.svelte
**Purpose**: Play audio files with controls

**Features**:
- Play/pause button
- Seek bar (progress + click to seek)
- Volume control
- Current time / duration display
- Playback speed control (0.5x, 1x, 1.5x, 2x)
- Download button
- Waveform visualization (optional)

**Supported formats**:
- MP3, WAV, OGG, M4A

**Usage**:
```svelte
<AudioPlayer
  attachment={{
    type: 'audio',
    url: '/uploads/recording.mp3',
    filename: 'recording.mp3',
    size: 2048000,
    mimeType: 'audio/mpeg',
    metadata: { duration: 180 }
  }}
/>
```

#### 4. VideoPlayer.svelte
**Purpose**: Play uploaded video files (not YouTube/Vimeo)

**Features**:
- Native HTML5 video player
- Play/pause, seek, volume controls
- Full-screen mode
- Playback speed
- Download button
- Thumbnail poster image

**Supported formats**:
- MP4, WebM, OGV

**Usage**:
```svelte
<VideoPlayer
  attachment={{
    type: 'video',
    url: '/uploads/demo.mp4',
    filename: 'demo.mp4',
    size: 10240000,
    mimeType: 'video/mp4',
    metadata: {
      duration: 120,
      width: 1920,
      height: 1080,
      thumbnail: '/thumbnails/demo.jpg'
    }
  }}
/>
```

#### 5. FileAttachment.svelte
**Purpose**: Generic file display for unsupported types

**Features**:
- File icon based on type
- Filename and size display
- Download button
- Open in new tab button (if browser can preview)

**For**: ZIP, RAR, CSV, TXT, JSON, XML, etc.

**Usage**:
```svelte
<FileAttachment
  attachment={{
    type: 'file',
    url: '/uploads/data.zip',
    filename: 'data.zip',
    size: 5120000,
    mimeType: 'application/zip'
  }}
/>
```

#### 6. AttachmentGallery.svelte
**Purpose**: Display multiple attachments in a message

**Features**:
- Grid layout for multiple attachments
- Type-specific rendering (uses appropriate preview component)
- Collapsible for many attachments
- "Show all" / "Show less" toggle
- Count badge

**Usage**:
```svelte
<AttachmentGallery
  attachments={message.attachments}
  columns={2}
/>
```

---

### Upload Component (Already Exists!)

**Use existing `FileUpload` from `@composable-svelte/core`**

The FileUpload component already provides everything we need:
- Drag & drop support ✅
- File validation (size, type, max files) ✅
- Image previews ✅
- Upload progress tracking ✅
- Error handling ✅
- Built with Composable Architecture pattern ✅

**Usage in StreamingChat**:
```svelte
<script>
  import { FileUpload } from '@composable-svelte/core/components/ui/file-upload';

  // ... in chat input area
</script>

<FileUpload
  accept="image/*,video/*,.pdf,audio/*"
  multiple={true}
  maxSize={10 * 1024 * 1024}  // 10MB
  showPreviews={true}
  dropzoneText="Drop files to attach to your message"
  onFilesChange={(files) => {
    // Handle uploaded files
    files.forEach(file => {
      if (file.status === 'success') {
        // Add to message attachments
        store.dispatch({
          type: 'addAttachment',
          attachment: {
            id: file.id,
            type: detectFileType(file.file),
            filename: file.file.name,
            url: file.previewUrl || URL.createObjectURL(file.file),
            size: file.file.size,
            mimeType: file.file.type
          }
        });
      }
    });
  }}
  onUpload={async (file) => {
    // Upload to server (if needed)
    const url = await uploadToServer(file);
    return url;
  }}
/>
```

**No need to build**:
- ❌ FileUploadButton - FileUpload already has this
- ❌ FileDropzone - FileUpload already has this
- ❌ AttachmentList - FileUpload already shows file list
- ❌ UploadProgress - FileUpload already has progress bars

---

## Integration with ChatMessage

Update `ChatMessage.svelte` to render attachments:

```svelte
<script lang="ts">
  import { AttachmentGallery } from './attachments/index.js';

  // ... existing code
</script>

<div class="chat-message" data-role={message.role}>
  <div class="chat-message__header">
    <!-- ... header content -->
  </div>

  <!-- NEW: Attachments (before or after text content) -->
  {#if message.attachments && message.attachments.length > 0}
    <div class="chat-message__attachments">
      <AttachmentGallery
        attachments={message.attachments}
        columns={message.attachments.length === 1 ? 1 : 2}
      />
    </div>
  {/if}

  <div class="chat-message__content">
    <!-- ... text content -->
  </div>
</div>
```

---

## Input Area Enhancement

Update the chat input area to support file attachments:

```svelte
<form class="streaming-chat__input-area">
  <!-- NEW: Pending attachments -->
  {#if $store.pendingAttachments.length > 0}
    <div class="streaming-chat__pending-attachments">
      <AttachmentList
        pending={$store.pendingAttachments}
        uploading={$store.uploadingAttachments}
        onRemove={(id) => store.dispatch({ type: 'removePendingAttachment', attachmentId: id })}
      />
    </div>
  {/if}

  <div class="streaming-chat__input-row">
    <!-- NEW: File upload button -->
    <FileUploadButton
      accept="image/*,video/*,.pdf,audio/*"
      multiple={true}
      maxSizeMB={10}
      onFiles={(files) => {
        files.forEach(file => {
          store.dispatch({ type: 'addPendingAttachment', file });
        });
      }}
    />

    <textarea
      value={inputValue}
      placeholder={placeholder}
      oninput={(e) => setInputValue(e.currentTarget.value)}
    />

    <button type="submit">Send</button>
  </div>
</form>
```

---

## Upload Flow

### 1. User Selects Files
```typescript
// User clicks upload button or drops files
dispatch({ type: 'addPendingAttachment', file });

// Reducer: Add to pendingAttachments with preview
case 'addPendingAttachment': {
  const preview = await generatePreview(action.file);
  return [
    {
      ...state,
      pendingAttachments: [
        ...state.pendingAttachments,
        { id: generateId(), file: action.file, preview }
      ]
    },
    Effect.none()
  ];
}
```

### 2. User Sends Message
```typescript
// When user clicks send
case 'sendMessage': {
  // Upload all pending attachments first
  return [
    { ...state, isWaitingForResponse: true },
    Effect.batch(
      // Upload each attachment
      ...state.pendingAttachments.map(pending =>
        Effect.run(async (dispatch) => {
          try {
            const url = await deps.uploadFile?.(
              pending.file,
              (loaded, total) => {
                dispatch({
                  type: 'uploadProgress',
                  attachmentId: pending.id,
                  loaded,
                  total
                });
              }
            );

            dispatch({
              type: 'uploadComplete',
              attachmentId: pending.id,
              url
            });
          } catch (error) {
            dispatch({
              type: 'uploadError',
              attachmentId: pending.id,
              error: error.message
            });
          }
        })
      )
    )
  ];
}
```

### 3. Attachments Uploaded
```typescript
// After all uploads complete, create message with attachments
case 'uploadComplete': {
  // Check if all attachments are uploaded
  const allUploaded = state.pendingAttachments.every(
    pending => state.uploadedUrls.has(pending.id)
  );

  if (allUploaded) {
    // Create message with attachments
    const attachments: MessageAttachment[] = state.pendingAttachments.map(
      pending => ({
        id: pending.id,
        type: detectFileType(pending.file),
        filename: pending.file.name,
        url: state.uploadedUrls.get(pending.id)!,
        size: pending.file.size,
        mimeType: pending.file.type,
        metadata: extractMetadata(pending.file)
      })
    );

    const message: Message = {
      id: generateId(),
      role: 'user',
      content: state.inputValue,
      timestamp: Date.now(),
      attachments
    };

    // Clear pending attachments and send message
    return [
      {
        ...state,
        messages: [...state.messages, message],
        pendingAttachments: [],
        uploadedUrls: new Map(),
        inputValue: ''
      },
      // Start streaming response with context of attachments
      Effect.run(async (dispatch) => {
        deps.streamMessage(
          message.content,
          (chunk) => dispatch({ type: 'chunkReceived', chunk }),
          () => dispatch({ type: 'streamComplete' }),
          (error) => dispatch({ type: 'streamError', error }),
          { attachments }  // Pass attachments as context
        );
      })
    ];
  }
}
```

---

## File Type Detection

```typescript
function detectFileType(file: File): MessageAttachment['type'] {
  const mime = file.type;

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('powerpoint') ||
    mime.includes('openxmlformats')
  ) {
    return 'document';
  }

  return 'file';
}
```

---

## Metadata Extraction

```typescript
async function extractMetadata(file: File): Promise<AttachmentMetadata> {
  const metadata: AttachmentMetadata = {};

  if (file.type.startsWith('image/')) {
    const img = await loadImage(file);
    metadata.width = img.width;
    metadata.height = img.height;
  }

  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    const media = await loadMedia(file);
    metadata.duration = media.duration;

    if (file.type.startsWith('video/')) {
      metadata.width = media.videoWidth;
      metadata.height = media.videoHeight;
      metadata.thumbnail = await generateVideoThumbnail(file);
    }
  }

  if (file.type === 'application/pdf') {
    const pdf = await loadPDF(file);
    metadata.pageCount = pdf.numPages;
  }

  return metadata;
}
```

---

## Implementation Phases (REVISED - Using Existing FileUpload!)

### Phase 1: Core Infrastructure (Day 1)
1. Extend `Message` type with `attachments` field
2. Add attachment handling actions to reducer
3. Add file type detection utility
4. Create mock upload implementation for testing

**Files to create/modify**:
- `src/lib/streaming-chat/types.ts` - Add `MessageAttachment` type
- `src/lib/streaming-chat/reducer.ts` - Add attachment actions
- `src/lib/streaming-chat/utils.ts` - File detection, metadata extraction

**Estimated time**: 1 day (was 2 days - simplified because we're using existing FileUpload)

### Phase 2: Preview Components (Day 2-4)
1. Create `PDFViewer.svelte` with PDF.js
2. Create `AudioPlayer.svelte`
3. Create `VideoPlayer.svelte` (for uploaded videos, not YouTube)
4. Create `FileAttachment.svelte` (generic file display)
5. Create `AttachmentGallery.svelte`

**Files to create**:
- `src/lib/streaming-chat/attachments/PDFViewer.svelte`
- `src/lib/streaming-chat/attachments/AudioPlayer.svelte`
- `src/lib/streaming-chat/attachments/VideoPlayer.svelte`
- `src/lib/streaming-chat/attachments/FileAttachment.svelte`
- `src/lib/streaming-chat/attachments/AttachmentGallery.svelte`
- `src/lib/streaming-chat/attachments/index.ts`

**Estimated time**: 3 days

### Phase 3: Document Preview (Day 5)
1. Create `DocumentPreview.svelte`
2. Integrate with PDFViewer for converted docs (or show thumbnail + download)

**Files to create**:
- `src/lib/streaming-chat/attachments/DocumentPreview.svelte`

**Estimated time**: 1 day

### Phase 4: Integration (Day 6-7)
1. Import and integrate `FileUpload` from `@composable-svelte/core`
2. Update `ChatMessage.svelte` to render attachments
3. Update input area to show FileUpload
4. Connect FileUpload to reducer actions
5. Update variants to support file uploads

**Files to modify**:
- `src/lib/streaming-chat/primitives/ChatMessage.svelte`
- `src/lib/streaming-chat/StreamingChat.svelte` (add FileUpload)
- `src/lib/streaming-chat/variants/*`

**Estimated time**: 2 days

### Phase 5: Examples & Testing (Day 8)
1. Create comprehensive examples in styleguide
2. Write tests for attachment handling
3. Update documentation

**Files to modify/create**:
- `examples/styleguide/src/lib/components/demos/StreamingChatDemo.svelte`
- `tests/streaming-chat/attachments.test.ts`
- Documentation updates

**Estimated time**: 1 day

---

## Total Timeline: 8 days (down from 12 days!)

**Savings**: 4 days saved by using existing FileUpload component from core instead of building upload UI from scratch.

---

## Dependencies to Add

```json
{
  "dependencies": {
    "pdfjs-dist": "^4.0.0"  // For PDF rendering
  }
}
```

---

## Questions to Resolve

1. **Upload Destination**: Where should files be uploaded?
   - Options: S3, Cloudflare R2, local server, in-memory (data URLs)
   - Recommendation: Make it dependency-injectable, provide examples for each

2. **Document Conversion**: How to handle Word/Excel/PowerPoint?
   - Options: Server-side conversion, third-party viewer, thumbnail only
   - Recommendation: Server-side to PDF, then use PDFViewer

3. **File Size Limits**: What's the maximum file size?
   - Recommendation: Configurable, default 10MB for images/PDFs, 50MB for videos

4. **Storage**: Where to store attachment metadata?
   - Options: In message content (JSON), separate attachments field, server-side
   - Recommendation: Separate `attachments` field in `Message` type

5. **Markdown Integration**: Should we extract attachments from markdown like we do for images?
   - Recommendation: Yes, support markdown syntax: `![Image](url)`, `[Video](url)`, `[PDF](url)`

---

## Next Steps

1. Review this plan and approve architecture
2. Decide on upload destination and conversion strategy
3. Start with Phase 1 (Core Infrastructure)
4. Implement incrementally with tests
5. Update examples and documentation

---

## Notes

- **Backward Compatibility**: Existing messages without attachments continue to work
- **Progressive Enhancement**: Features degrade gracefully if dependencies not provided
- **Type Safety**: Full TypeScript support throughout
- **Testing**: Each component unit-tested + integration tests
- **Accessibility**: All components keyboard-navigable, screen-reader friendly
- **Performance**: Virtual scrolling for large attachment lists, lazy loading for previews

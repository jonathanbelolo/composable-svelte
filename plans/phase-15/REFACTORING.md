# Phase 15: Package Refactoring - Media & Chat Separation

## Executive Summary

**Goal**: Create clean package boundaries by extracting media and chat components from `@composable-svelte/code` into two new packages: `@composable-svelte/media` and `@composable-svelte/chat`.

**Rationale**: The current `code` package contains components with vastly different concerns:
- **Code-related**: CodeEditor, CodeHighlight, NodeCanvas (visual programming)
- **Media-related**: AudioPlayer, VideoEmbed, VoiceInput
- **Communication**: StreamingChat (real-time collaboration)

This refactoring creates logical boundaries and improves maintainability.

## Current State Analysis

### Existing Package Structure
```
packages/
├── charts/          # Data visualization
├── code/            # ⚠️ MIXED CONCERNS - needs refactoring
│   ├── audio-player/      → MOVE to media/
│   ├── code-editor/       → KEEP
│   ├── code-highlight/    → KEEP
│   ├── node-canvas/       → KEEP
│   ├── streaming-chat/    → MOVE to chat/
│   ├── video-embed/       → MOVE to media/
│   └── voice-input/       → MOVE to media/
├── core/            # Core architecture
├── graphics/        # 3D graphics (Babylon.js)
└── maps/            # Interactive maps
```

### Component Analysis

#### Components to KEEP in `@composable-svelte/code`
1. **CodeEditor** (5 files)
   - Interactive code editor with CodeMirror
   - Language support, syntax highlighting, autocomplete
   - Dependencies: `codemirror`, `@codemirror/*` packages

2. **CodeHighlight** (5 files)
   - Read-only syntax highlighting with Prism.js
   - Dependencies: `prismjs`, `prism-themes`

3. **NodeCanvas** (6 files)
   - Node-based visual programming canvas
   - Dependencies: `@xyflow/svelte`

#### Components to MOVE to `@composable-svelte/media`
1. **AudioPlayer** (11 files)
   - Minimal and full audio player variants
   - Playlist support, shuffle, repeat modes
   - Dependencies: Web Audio API (browser native)

2. **VideoEmbed** (4 files)
   - Video embedding for YouTube, Vimeo, Twitch, etc.
   - Platform detection, markdown extraction
   - Dependencies: None (uses iframes)

3. **VoiceInput** (6 files)
   - Voice recording with push-to-talk and conversation modes
   - AudioManager for recording
   - Dependencies: Web Audio API, MediaRecorder API (browser native)

#### Components to MOVE to `@composable-svelte/chat`
1. **StreamingChat** (48+ files)
   - Transport-agnostic streaming chat for LLMs
   - Collaborative features (presence, typing, cursors)
   - WebSocket manager, cleanup tracker
   - Markdown rendering, attachments, reactions
   - Dependencies: `marked`, `pdfjs-dist`

### Dependency Analysis

**Code Package Dependencies (Current)**:
```json
"dependencies": {
  "@codemirror/*": "...",           // → KEEP in code
  "@xyflow/svelte": "^1.4.1",       // → KEEP in code
  "codemirror": "^6.0.2",           // → KEEP in code
  "marked": "^16.4.1",              // → MOVE to chat
  "pdfjs-dist": "^5.4.394",         // → MOVE to chat
  "prism-themes": "^1.9.0",         // → KEEP in code
  "prismjs": "^1.29.0"              // → KEEP in code
}
```

**New Media Package Dependencies**:
```json
"dependencies": {
  // None! All media components use browser native APIs
}
```

**New Chat Package Dependencies**:
```json
"dependencies": {
  "marked": "^16.4.1",      // Markdown rendering
  "pdfjs-dist": "^5.4.394"  // PDF attachment previews
}
```

## Target Structure

### After Refactoring
```
packages/
├── charts/
├── chat/            # ✅ NEW - Real-time communication
│   └── src/lib/
│       └── streaming-chat/
├── code/            # ✅ CLEANED - Only code-related components
│   └── src/lib/
│       ├── code-editor/
│       ├── code-highlight/
│       └── node-canvas/
├── core/
├── graphics/
├── maps/
└── media/           # ✅ NEW - Media playback & input
    └── src/lib/
        ├── audio-player/
        ├── video-embed/
        └── voice-input/
```

### Package Names & Descriptions

**`@composable-svelte/code`** (updated)
- **Name**: `@composable-svelte/code`
- **Description**: Code editor, syntax highlighting, and node-based canvas components for Composable Svelte

**`@composable-svelte/media`** (new)
- **Name**: `@composable-svelte/media`
- **Description**: Audio player, video embed, and voice input components for Composable Svelte

**`@composable-svelte/chat`** (new)
- **Name**: `@composable-svelte/chat`
- **Description**: Streaming chat component with collaborative features for Composable Svelte

## Detailed File Movement Map

### Media Package Files (21 files total)

**audio-player/** (11 files)
```
packages/code/src/lib/audio-player/
├── PlaylistView.svelte
├── mock-playback.ts
├── MinimalAudioPlayer.svelte
├── types.ts
├── FullAudioPlayer.svelte
├── reducer.ts
├── audio-manager.ts
└── index.ts
└── tests/ (if any)

→ MOVE TO →

packages/media/src/lib/audio-player/
├── (same files)
```

**video-embed/** (4 files)
```
packages/code/src/lib/video-embed/
├── VideoEmbed.svelte
├── types.ts
├── utils.ts
└── index.ts

→ MOVE TO →

packages/media/src/lib/video-embed/
├── (same files)
```

**voice-input/** (6 files)
```
packages/code/src/lib/voice-input/
├── VoiceInput.svelte
├── AudioInput.svelte
├── reducer.ts
├── types.ts
├── audio-manager.ts
└── index.ts

→ MOVE TO →

packages/media/src/lib/voice-input/
├── (same files)
```

### Chat Package Files (48+ files)

**streaming-chat/** (48+ files)
```
packages/code/src/lib/streaming-chat/
├── StreamingChat.svelte
├── ChatMessage.svelte
├── reducer.ts
├── types.ts
├── index.ts
├── collaborative-reducer.ts
├── collaborative-types.ts
├── collaborative-hooks.ts
├── websocket-manager.ts
├── cleanup-tracker.ts
├── markdown.ts
├── utils.ts
├── variants/
│   ├── MinimalStreamingChat.svelte
│   ├── StandardStreamingChat.svelte
│   ├── FullStreamingChat.svelte
│   └── index.ts
├── primitives/
│   ├── ChatMessage.svelte
│   ├── ChatMessageWithActions.svelte
│   ├── ContextMenu.svelte
│   ├── ReactionPicker.svelte
│   ├── ActionButtons.svelte
│   ├── MessageReactions.svelte
│   └── index.ts
├── collaborative-primitives/
│   ├── PresenceAvatarStack.svelte
│   ├── CursorOverlay.svelte
│   ├── CursorMarker.svelte
│   ├── PresenceBadge.svelte
│   ├── TypingIndicator.svelte
│   ├── PresenceList.svelte
│   ├── TypingUsersList.svelte
│   └── index.ts
└── attachment-components/
    ├── ImagePreview.svelte
    ├── PDFPreview.svelte
    ├── FileAttachment.svelte
    └── index.ts

→ MOVE TO →

packages/chat/src/lib/streaming-chat/
├── (same directory structure)
```

### Files to KEEP in Code Package (16 files)

**code-editor/** (5 files)
```
packages/code/src/lib/code-editor/
├── codemirror-wrapper.ts
├── code-editor.reducer.ts
├── CodeEditor.svelte
├── code-editor.types.ts
└── index.ts
```

**code-highlight/** (5 files)
```
packages/code/src/lib/code-highlight/
├── code-highlight.reducer.ts
├── CodeHighlight.svelte
├── code-highlight.types.ts
├── prism-wrapper.ts
└── index.ts
```

**node-canvas/** (6 files)
```
packages/code/src/lib/node-canvas/
├── NodeCanvas.svelte
├── reducer.ts
├── types.ts
├── validators.ts
├── utils.ts
└── index.ts
```

## Package Configurations

### Media Package Configuration

**`packages/media/package.json`**
```json
{
  "name": "@composable-svelte/media",
  "version": "0.1.0",
  "description": "Audio player, video embed, and voice input components for Composable Svelte - Built with Web Audio API and MediaRecorder",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./*": {
      "types": "./dist/*.d.ts",
      "svelte": "./dist/*.js",
      "default": "./dist/*.js"
    }
  },
  "svelte": "./dist/index.js",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "svelte-package -o dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "pnpm run build && pnpm run typecheck && SILENT_TESTS=true pnpm test",
    "prepack": "pnpm run build"
  },
  "keywords": [
    "svelte",
    "svelte5",
    "audio-player",
    "video-embed",
    "voice-input",
    "speech-recognition",
    "media-player",
    "web-audio",
    "mediarecorder",
    "composable-architecture",
    "typescript"
  ],
  "author": "Jonathan Belolo",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jbelolo/composable-svelte.git",
    "directory": "packages/media"
  },
  "homepage": "https://github.com/jbelolo/composable-svelte#readme",
  "bugs": {
    "url": "https://github.com/jbelolo/composable-svelte/issues"
  },
  "peerDependencies": {
    "@composable-svelte/core": "^0.3.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.5.4",
    "@sveltejs/vite-plugin-svelte": "^6.2.1",
    "@types/node": "^20.0.0",
    "@vitest/browser-playwright": "^4.0.3",
    "@vitest/coverage-v8": "^4.0.7",
    "@vitest/ui": "^4.0.7",
    "playwright": "^1.56.1",
    "svelte": "^5.0.0",
    "typescript": "^5.5.4",
    "vite": "^6.4.1",
    "vitest": "^4.0.7"
  },
  "dependencies": {
    "@composable-svelte/core": "workspace:*"
  }
}
```

**`packages/media/tsconfig.json`**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src/lib",
    "composite": true,
    "types": ["svelte"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

**`packages/media/vite.config.ts`**
```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],

  // ============================================================================
  // Build Configuration
  // ============================================================================
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      // Externalize peer dependencies
      external: (id) => {
        return (
          id === 'svelte' ||
          id.startsWith('svelte/') ||
          id === '@composable-svelte/core' ||
          id.startsWith('@composable-svelte/core/')
        );
      },
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  }
});
```

**`packages/media/vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],

	test: {
		// Browser mode configuration (like core package)
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true
		},

		// Test file patterns
		include: ['tests/**/*.{test,spec}.{js,ts}'],

		// Suppress console output during tests (for CI/prepublish)
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true',

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['node_modules/', 'tests/', '**/*.spec.ts', '**/*.test.ts']
		}
	},

	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib')
		}
	}
});
```

**`packages/media/src/lib/index.ts`**
```typescript
/**
 * @composable-svelte/media
 *
 * Media components for Composable Svelte
 *
 * Built with Web Audio API and MediaRecorder following Composable Architecture patterns
 *
 * @packageDocumentation
 */

// AudioPlayer - Embeddable audio player with playlist support
export {
	MinimalAudioPlayer,
	FullAudioPlayer,
	PlaylistView,
	audioPlayerReducer,
	createInitialAudioPlayerState,
	createShuffleOrder,
	getNextTrackIndex,
	getPreviousTrackIndex,
	AudioManager as AudioPlayerManager,
	createAudioManager as createAudioPlayerManager,
	getAudioManager as getAudioPlayerManager,
	deleteAudioManager as deleteAudioPlayerManager,
	type AudioTrack,
	type LoopMode,
	type AudioPlayerState,
	type AudioPlayerAction,
	type AudioPlayerDependencies,
	type AudioManagerConfig as AudioPlayerManagerConfig
} from './audio-player/index';

// VideoEmbed - Video embedding for external platforms (YouTube, Vimeo, Twitch, etc.)
export {
	VideoEmbed,
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms,
	type VideoEmbedType,
	type VideoPlatform,
	type AspectRatio,
	type PlatformConfig,
	type EmbedOptions
} from './video-embed/index';

// VoiceInput - Standalone voice input component with push-to-talk and conversation modes
export {
	VoiceInput,
	voiceInputReducer,
	createInitialVoiceInputState,
	AudioManager,
	createAudioManager,
	getAudioManager,
	deleteAudioManager,
	type VoiceInputState,
	type VoiceInputAction,
	type VoiceInputDependencies
} from './voice-input/index';
```

### Chat Package Configuration

**`packages/chat/package.json`**
```json
{
  "name": "@composable-svelte/chat",
  "version": "0.1.0",
  "description": "Streaming chat component with collaborative features for Composable Svelte - Built for LLM interactions with transport-agnostic design",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./*": {
      "types": "./dist/*.d.ts",
      "svelte": "./dist/*.js",
      "default": "./dist/*.js"
    }
  },
  "svelte": "./dist/index.js",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "svelte-package -o dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "pnpm run build && pnpm run typecheck && SILENT_TESTS=true pnpm test",
    "prepack": "pnpm run build"
  },
  "keywords": [
    "svelte",
    "svelte5",
    "streaming-chat",
    "llm",
    "ai-chat",
    "collaborative",
    "websocket",
    "real-time",
    "markdown",
    "composable-architecture",
    "typescript"
  ],
  "author": "Jonathan Belolo",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jbelolo/composable-svelte.git",
    "directory": "packages/chat"
  },
  "homepage": "https://github.com/jbelolo/composable-svelte#readme",
  "bugs": {
    "url": "https://github.com/jbelolo/composable-svelte/issues"
  },
  "peerDependencies": {
    "@composable-svelte/core": "^0.3.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.5.4",
    "@sveltejs/vite-plugin-svelte": "^6.2.1",
    "@types/marked": "^6.0.0",
    "@types/node": "^20.0.0",
    "@vitest/browser-playwright": "^4.0.3",
    "@vitest/coverage-v8": "^4.0.7",
    "@vitest/ui": "^4.0.7",
    "playwright": "^1.56.1",
    "svelte": "^5.0.0",
    "typescript": "^5.5.4",
    "vite": "^6.4.1",
    "vitest": "^4.0.7"
  },
  "dependencies": {
    "@composable-svelte/core": "workspace:*",
    "marked": "^16.4.1",
    "pdfjs-dist": "^5.4.394"
  }
}
```

**`packages/chat/tsconfig.json`**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src/lib",
    "composite": true,
    "types": ["svelte"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

**`packages/chat/vite.config.ts`**
```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],

  // ============================================================================
  // Build Configuration
  // ============================================================================
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      // Externalize peer dependencies
      external: (id) => {
        return (
          id === 'svelte' ||
          id.startsWith('svelte/') ||
          id === '@composable-svelte/core' ||
          id.startsWith('@composable-svelte/core/')
        );
      },
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src/lib')
    }
  }
});
```

**`packages/chat/vitest.config.ts`**
```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],

	test: {
		// Browser mode configuration (like core package)
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true
		},

		// Test file patterns
		include: ['tests/**/*.{test,spec}.{js,ts}'],

		// Suppress console output during tests (for CI/prepublish)
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true',

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['node_modules/', 'tests/', '**/*.spec.ts', '**/*.test.ts']
		}
	},

	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib')
		}
	}
});
```

**`packages/chat/src/lib/index.ts`**
```typescript
/**
 * @composable-svelte/chat
 *
 * Streaming chat component for Composable Svelte
 *
 * Built for LLM interactions with transport-agnostic design following Composable Architecture patterns
 *
 * @packageDocumentation
 */

// StreamingChat - Transport-agnostic streaming chat for LLM interactions
export {
	// Variants (recommended)
	MinimalStreamingChat,
	StandardStreamingChat,
	FullStreamingChat,
	// Legacy
	StreamingChat,
	// Primitives
	ChatMessage,
	// Core
	streamingChatReducer,
	createInitialStreamingChatState,
	createMockStreamingChat,
	// Types
	type Message,
	type MessageAttachment,
	type AttachmentMetadata,
	type MessageReaction,
	type StreamingChatState,
	type StreamingChatAction,
	type StreamingChatDependencies,
	// Constants
	DEFAULT_REACTIONS,
	// Collaborative features
	collaborativeReducer,
	createInitialCollaborativeState,
	generateRandomUserColor,
	type CollaborativeUser,
	type UserPresence,
	type TypingInfo,
	type CursorPosition,
	type UserPermissions,
	type CollaborativeStreamingChatState,
	type CollaborativeAction,
	type CollaborativeDependencies,
	type WebSocketConnectionState,
	type PendingAction,
	type SyncState,
	DEFAULT_USER_PERMISSIONS,
	// Collaborative primitives
	PresenceBadge,
	PresenceAvatarStack,
	PresenceList,
	TypingIndicator,
	TypingUsersList,
	CursorMarker,
	CursorOverlay,
	// Collaborative hooks
	usePresenceTracking,
	useTypingEmitter,
	useCursorTracking,
	useHeartbeat,
	getTypingUsers,
	getActiveUsers,
	getCursorPositions,
	formatTypingIndicator,
	// WebSocket manager
	WebSocketManager,
	createWebSocketManager,
	type WebSocketConfig,
	type WebSocketMessage,
	// Cleanup utilities
	CleanupTracker,
	createCleanupTracker,
	type CleanupFunction
} from './streaming-chat/index';
```

### Updated Code Package Configuration

**`packages/code/package.json`** (updated)
```json
{
  "name": "@composable-svelte/code",
  "version": "0.1.0",
  "description": "Code editor, syntax highlighting, and node-based canvas components for Composable Svelte - Built with Prism.js, CodeMirror, and SvelteFlow",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./*": {
      "types": "./dist/*.d.ts",
      "svelte": "./dist/*.js",
      "default": "./dist/*.js"
    }
  },
  "svelte": "./dist/index.js",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "svelte-package -o dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "pnpm run build && pnpm run typecheck && SILENT_TESTS=true pnpm test",
    "prepack": "pnpm run build"
  },
  "keywords": [
    "svelte",
    "svelte5",
    "code-editor",
    "syntax-highlighting",
    "node-editor",
    "node-canvas",
    "flow-editor",
    "visual-programming",
    "prismjs",
    "codemirror",
    "svelteflow",
    "composable-architecture",
    "typescript"
  ],
  "author": "Jonathan Belolo",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jbelolo/composable-svelte.git",
    "directory": "packages/code"
  },
  "homepage": "https://github.com/jbelolo/composable-svelte#readme",
  "bugs": {
    "url": "https://github.com/jbelolo/composable-svelte/issues"
  },
  "peerDependencies": {
    "@composable-svelte/core": "^0.3.0",
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.5.4",
    "@sveltejs/vite-plugin-svelte": "^6.2.1",
    "@types/node": "^20.0.0",
    "@types/prismjs": "^1.26.0",
    "@vitest/browser-playwright": "^4.0.3",
    "@vitest/coverage-v8": "^4.0.7",
    "@vitest/ui": "^4.0.7",
    "playwright": "^1.56.1",
    "svelte": "^5.0.0",
    "typescript": "^5.5.4",
    "vite": "^6.4.1",
    "vitest": "^4.0.7"
  },
  "dependencies": {
    "@codemirror/autocomplete": "^6.19.1",
    "@codemirror/lang-css": "^6.3.1",
    "@codemirror/lang-html": "^6.4.11",
    "@codemirror/lang-javascript": "^6.2.4",
    "@codemirror/lang-json": "^6.0.2",
    "@codemirror/lang-markdown": "^6.5.0",
    "@codemirror/lang-python": "^6.2.1",
    "@codemirror/lang-rust": "^6.0.2",
    "@codemirror/lang-sql": "^6.10.0",
    "@codemirror/lint": "^6.9.2",
    "@codemirror/search": "^6.5.11",
    "@codemirror/state": "^6.5.2",
    "@codemirror/theme-one-dark": "^6.1.3",
    "@codemirror/view": "^6.38.6",
    "@composable-svelte/core": "workspace:*",
    "@xyflow/svelte": "^1.4.1",
    "codemirror": "^6.0.2",
    "prism-themes": "^1.9.0",
    "prismjs": "^1.29.0"
  }
}
```

**`packages/code/src/lib/index.ts`** (updated)
```typescript
/**
 * @composable-svelte/code
 *
 * Code editor and syntax highlighting components for Composable Svelte
 *
 * Built with Prism.js and CodeMirror following Composable Architecture patterns
 *
 * @packageDocumentation
 */

// CodeHighlight - Read-only syntax highlighting
export {
	CodeHighlight,
	codeHighlightReducer,
	highlightCode,
	loadLanguage,
	createInitialState,
	type CodeHighlightState,
	type CodeHighlightAction,
	type CodeHighlightDependencies,
	type SupportedLanguage
} from './code-highlight/index';

// CodeEditor - Interactive code editor with CodeMirror
export {
	CodeEditor,
	codeEditorReducer,
	createEditorView,
	loadLanguage as loadEditorLanguage,
	updateEditorValue,
	updateEditorLanguage,
	updateEditorTheme,
	updateEditorReadOnly,
	updateTabSize,
	focusEditor,
	blurEditor,
	createInitialState as createEditorInitialState,
	type CodeEditorState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type SupportedLanguage as EditorLanguage,
	type EditorSelection
} from './code-editor/index';

// NodeCanvas - Node-based canvas editor with SvelteFlow
export {
	NodeCanvas,
	nodeCanvasReducer,
	createConnectionValidator,
	permissiveValidator,
	strictValidator,
	composeValidators,
	createInitialNodeCanvasState,
	nodesToArray,
	edgesToArray,
	type NodeCanvasState,
	type NodeCanvasAction,
	type NodeCanvasDependencies,
	type NodeTypeDefinition,
	type PortDefinition,
	type ConnectionValidation,
	type ConnectionValidator
} from './node-canvas/index';
```

## Import Update Strategy

### Finding All Import References

**Step 1: Find all files that import from `@composable-svelte/code`**
```bash
grep -r "@composable-svelte/code" examples/ --include="*.ts" --include="*.svelte" -l
```

**Expected files** (based on earlier grep):
- `examples/styleguide/src/lib/components/demos/AudioPlayerDemo.svelte`
- `examples/styleguide/src/lib/components/demos/VoiceInputDemo.svelte`
- `examples/styleguide/src/lib/components/demos/StreamingChatDemo.svelte`
- `examples/styleguide/src/lib/components/demos/CollaborativeChatDemo.svelte`
- `examples/styleguide/src/lib/components/demos/NodeCanvasDemo.svelte`
- `examples/styleguide/src/lib/components/demos/CodeEditorDemo.svelte`
- `examples/styleguide/src/lib/components/demos/CodeHighlightDemo.svelte`
- `examples/styleguide/package.json`
- `examples/styleguide/vite.config.ts`

### Import Replacements

**Audio Player** (AudioPlayerDemo.svelte):
```typescript
// BEFORE
import {
  MinimalAudioPlayer,
  FullAudioPlayer,
  audioPlayerReducer
} from '@composable-svelte/code';

// AFTER
import {
  MinimalAudioPlayer,
  FullAudioPlayer,
  audioPlayerReducer
} from '@composable-svelte/media';
```

**Voice Input** (VoiceInputDemo.svelte):
```typescript
// BEFORE
import {
  VoiceInput,
  voiceInputReducer
} from '@composable-svelte/code';

// AFTER
import {
  VoiceInput,
  voiceInputReducer
} from '@composable-svelte/media';
```

**Streaming Chat** (StreamingChatDemo.svelte, CollaborativeChatDemo.svelte):
```typescript
// BEFORE
import {
  StreamingChat,
  StandardStreamingChat,
  streamingChatReducer
} from '@composable-svelte/code';

// AFTER
import {
  StreamingChat,
  StandardStreamingChat,
  streamingChatReducer
} from '@composable-svelte/chat';
```

**Code Components** (CodeEditorDemo.svelte, CodeHighlightDemo.svelte, NodeCanvasDemo.svelte):
```typescript
// NO CHANGE - still use @composable-svelte/code
import {
  CodeEditor,
  CodeHighlight,
  NodeCanvas
} from '@composable-svelte/code';
```

### Package.json Dependencies

**`examples/styleguide/package.json`**
```json
// BEFORE
"dependencies": {
  "@composable-svelte/code": "workspace:*",
  "@composable-svelte/core": "workspace:*",
  // ...
}

// AFTER
"dependencies": {
  "@composable-svelte/chat": "workspace:*",    // ✅ NEW
  "@composable-svelte/code": "workspace:*",    // ✅ KEEP (still uses CodeEditor, etc.)
  "@composable-svelte/core": "workspace:*",
  "@composable-svelte/media": "workspace:*",   // ✅ NEW
  // ...
}
```

## Testing Strategy

### Pre-Refactoring Verification
1. **Run existing tests**: `cd packages/code && pnpm test`
2. **Build existing package**: `cd packages/code && pnpm build`
3. **Verify styleguide works**: `cd examples/styleguide && pnpm dev`

### Post-Refactoring Verification
1. **Build all three packages**:
   ```bash
   cd packages/code && pnpm build
   cd packages/media && pnpm build
   cd packages/chat && pnpm build
   ```

2. **Run type checking**:
   ```bash
   cd packages/code && pnpm typecheck
   cd packages/media && pnpm typecheck
   cd packages/chat && pnpm typecheck
   ```

3. **Verify styleguide builds and runs**:
   ```bash
   cd examples/styleguide
   pnpm install  # Update dependencies
   pnpm dev      # Should start without errors
   ```

4. **Test each demo**:
   - AudioPlayerDemo (uses @composable-svelte/media)
   - VoiceInputDemo (uses @composable-svelte/media)
   - StreamingChatDemo (uses @composable-svelte/chat)
   - CollaborativeChatDemo (uses @composable-svelte/chat)
   - CodeEditorDemo (uses @composable-svelte/code)
   - CodeHighlightDemo (uses @composable-svelte/code)
   - NodeCanvasDemo (uses @composable-svelte/code)

5. **Run integration tests** (if any exist)

### Rollback Strategy

If issues occur, rollback steps:
1. **Revert package.json changes** in examples/styleguide
2. **Delete new packages**: `rm -rf packages/media packages/chat`
3. **Restore original code package**: `git restore packages/code/`
4. **Reinstall dependencies**: `pnpm install`
5. **Verify original state works**: `cd examples/styleguide && pnpm dev`

## Step-by-Step Execution Plan

### Phase 1: Create New Package Structures (DO NOT MOVE FILES YET)

**Step 1.1: Create media package skeleton**
```bash
mkdir -p packages/media/src/lib
```

**Step 1.2: Create media package configuration**
- Write `packages/media/package.json` (from template above)
- Write `packages/media/tsconfig.json` (from template above)
- Write `packages/media/vite.config.ts` (from template above)
- Write `packages/media/vitest.config.ts` (from template above)
- Create empty `packages/media/src/lib/index.ts` (will populate later)

**Step 1.3: Create chat package skeleton**
```bash
mkdir -p packages/chat/src/lib
```

**Step 1.4: Create chat package configuration**
- Write `packages/chat/package.json` (from template above)
- Write `packages/chat/tsconfig.json` (from template above)
- Write `packages/chat/vite.config.ts` (from template above)
- Write `packages/chat/vitest.config.ts` (from template above)
- Create empty `packages/chat/src/lib/index.ts` (will populate later)

### Phase 2: Move Component Files

**Step 2.1: Move audio-player to media**
```bash
mv packages/code/src/lib/audio-player packages/media/src/lib/
```

**Step 2.2: Move video-embed to media**
```bash
mv packages/code/src/lib/video-embed packages/media/src/lib/
```

**Step 2.3: Move voice-input to media**
```bash
mv packages/code/src/lib/voice-input packages/media/src/lib/
```

**Step 2.4: Move streaming-chat to chat**
```bash
mv packages/code/src/lib/streaming-chat packages/chat/src/lib/
```

### Phase 3: Update Package Index Files

**Step 3.1: Update `packages/media/src/lib/index.ts`**
- Use template from "Package Configurations" section above

**Step 3.2: Update `packages/chat/src/lib/index.ts`**
- Use template from "Package Configurations" section above

**Step 3.3: Update `packages/code/src/lib/index.ts`**
- Remove audio-player exports
- Remove video-embed exports
- Remove voice-input exports
- Remove streaming-chat exports
- Keep only code-editor, code-highlight, node-canvas exports
- Use template from "Package Configurations" section above

**Step 3.4: Update `packages/code/package.json`**
- Remove `marked` and `pdfjs-dist` from dependencies
- Update description (already correct)
- Use template from "Package Configurations" section above

### Phase 4: Install Dependencies

**Step 4.1: Install root dependencies**
```bash
cd /Users/jonathanbelolo/dev/claude/code/composable-svelte
pnpm install
```

**Step 4.2: Install media package dependencies**
```bash
cd packages/media
pnpm install
```

**Step 4.3: Install chat package dependencies**
```bash
cd packages/chat
pnpm install
```

### Phase 5: Build New Packages

**Step 5.1: Build media package**
```bash
cd packages/media
pnpm build
```
- Verify build succeeds
- Check `dist/` contains expected files

**Step 5.2: Build chat package**
```bash
cd packages/chat
pnpm build
```
- Verify build succeeds
- Check `dist/` contains expected files

**Step 5.3: Rebuild code package**
```bash
cd packages/code
pnpm build
```
- Verify build succeeds (should be smaller now)
- Verify `dist/` only contains code-related exports

### Phase 6: Update Examples (Styleguide)

**Step 6.1: Update styleguide package.json**
- Add `"@composable-svelte/media": "workspace:*"`
- Add `"@composable-svelte/chat": "workspace:*"`
- Keep `"@composable-svelte/code": "workspace:*"` (still needed)

**Step 6.2: Install styleguide dependencies**
```bash
cd examples/styleguide
pnpm install
```

**Step 6.3: Update AudioPlayerDemo.svelte**
- Change imports from `@composable-svelte/code` to `@composable-svelte/media`

**Step 6.4: Update VoiceInputDemo.svelte**
- Change imports from `@composable-svelte/code` to `@composable-svelte/media`

**Step 6.5: Update StreamingChatDemo.svelte**
- Change imports from `@composable-svelte/code` to `@composable-svelte/chat`

**Step 6.6: Update CollaborativeChatDemo.svelte**
- Change imports from `@composable-svelte/code` to `@composable-svelte/chat`

**Step 6.7: Verify CodeEditorDemo.svelte**
- No changes needed (still uses `@composable-svelte/code`)

**Step 6.8: Verify CodeHighlightDemo.svelte**
- No changes needed (still uses `@composable-svelte/code`)

**Step 6.9: Verify NodeCanvasDemo.svelte**
- No changes needed (still uses `@composable-svelte/code`)

### Phase 7: Verify Everything Works

**Step 7.1: Run type checking on all packages**
```bash
cd packages/code && pnpm typecheck
cd packages/media && pnpm typecheck
cd packages/chat && pnpm typecheck
```

**Step 7.2: Start styleguide dev server**
```bash
cd examples/styleguide
pnpm dev
```
- Open browser to http://localhost:5173
- Navigate to each demo and verify it works:
  - ✅ AudioPlayerDemo
  - ✅ VoiceInputDemo
  - ✅ StreamingChatDemo
  - ✅ CollaborativeChatDemo
  - ✅ CodeEditorDemo
  - ✅ CodeHighlightDemo
  - ✅ NodeCanvasDemo

**Step 7.3: Check for other examples that might use these components**
```bash
grep -r "@composable-svelte/code" examples/ --include="*.ts" --include="*.svelte" --exclude-dir=styleguide
```
- Update any other examples if needed

### Phase 8: Update Skills Documentation

**Step 8.1: Update composable-svelte-code skill**
- File: `.claude/skills/composable-svelte-code/SKILL.md`
- Remove AudioPlayer, VideoEmbed, VoiceInput, StreamingChat sections
- Keep only CodeEditor, CodeHighlight, NodeCanvas
- Update frontmatter description

**Step 8.2: Verify composable-svelte-media skill**
- File: `.claude/skills/composable-svelte-media/SKILL.md`
- Ensure it references `@composable-svelte/media` (not `@composable-svelte/code`)
- Update any package import examples

**Step 8.3: Verify composable-svelte-chat skill**
- File: `.claude/skills/composable-svelte-chat/SKILL.md`
- Ensure it references `@composable-svelte/chat` (not `@composable-svelte/code`)
- Update any package import examples

### Phase 9: Final Verification & Cleanup

**Step 9.1: Run full build from root**
```bash
cd /Users/jonathanbelolo/dev/claude/code/composable-svelte
pnpm -r build
```

**Step 9.2: Run type checking from root**
```bash
pnpm -r typecheck
```

**Step 9.3: Verify no broken imports**
```bash
# Search for any remaining imports that might be broken
grep -r "from '@composable-svelte/code'" packages/media packages/chat
# Should return NO results
```

**Step 9.4: Clean up any temporary files**
```bash
# Remove any .DS_Store or other temp files
find packages/media packages/chat -name ".DS_Store" -delete
```

**Step 9.5: Update CLAUDE.md**
- Update package structure diagram
- Update package descriptions
- Add media and chat to package list

**Step 9.6: Create completion summary**
- Write `plans/phase-15/COMPLETION-SUMMARY.md`
- Document what was done
- Record any issues encountered
- Note any follow-up tasks

## Risk Assessment & Mitigation

### High-Risk Areas

1. **Breaking imports in examples**
   - **Mitigation**: Comprehensive grep search before and after
   - **Verification**: Test styleguide and all examples

2. **Dependency conflicts**
   - **Mitigation**: Carefully copy dependencies to correct packages
   - **Verification**: Run `pnpm install` and check for errors

3. **Build failures**
   - **Mitigation**: Test builds incrementally (media → chat → code)
   - **Verification**: Each package must build successfully before proceeding

4. **TypeScript errors**
   - **Mitigation**: Run typecheck on each package individually
   - **Verification**: No TypeScript errors in any package

### Medium-Risk Areas

1. **Tests might reference old paths**
   - **Mitigation**: Check for test files in moved components
   - **Verification**: Run tests if they exist

2. **README files might need updates**
   - **Mitigation**: Create new READMEs for media and chat packages
   - **Follow-up**: Can be done after main refactoring

### Low-Risk Areas

1. **Documentation updates**
   - **Mitigation**: Update in final phase
   - **Follow-up**: Skills already created, just need verification

2. **Git history preservation**
   - **Note**: Using `mv` command preserves git history
   - **Alternative**: Could use `git mv` for explicit tracking

## Success Criteria

### Must Pass
- ✅ All three packages build successfully
- ✅ All three packages pass type checking
- ✅ Styleguide dev server starts without errors
- ✅ All 7 demo components work correctly in styleguide
- ✅ No broken imports in any files
- ✅ Dependencies correctly distributed between packages

### Should Pass
- ✅ Skills documentation updated
- ✅ CLAUDE.md updated with new structure
- ✅ All examples using these components still work

### Nice to Have
- ✅ Tests pass (if they exist)
- ✅ README files created for new packages
- ✅ Completion summary written

## Timeline Estimate

**Total estimated time**: 45-60 minutes

- Phase 1 (Create skeletons): 10 minutes
- Phase 2 (Move files): 5 minutes
- Phase 3 (Update index files): 10 minutes
- Phase 4 (Install deps): 5 minutes
- Phase 5 (Build packages): 10 minutes
- Phase 6 (Update examples): 10 minutes
- Phase 7 (Verification): 10 minutes
- Phase 8 (Update skills): 5 minutes
- Phase 9 (Final cleanup): 5 minutes

## Conclusion

This refactoring plan provides a systematic approach to separating concerns in the Composable Svelte codebase. By following these steps carefully and verifying at each stage, we can successfully create clean package boundaries without breaking existing functionality.

The key principles:
1. **Create before moving** - Set up package structures first
2. **Move files atomically** - All files for a component move together
3. **Update incrementally** - One package at a time
4. **Verify continuously** - Test after each major step
5. **Document thoroughly** - Update all references

This approach minimizes risk while maximizing clarity and maintainability.

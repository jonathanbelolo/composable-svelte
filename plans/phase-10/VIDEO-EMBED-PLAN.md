# Video Embed Component - Implementation Plan

**Phase**: 10
**Component**: VideoEmbed
**Status**: Planning
**Created**: 2025-11-06

## Overview

Add video embedding support to StreamingChat, allowing LLM responses to include embedded videos from popular platforms (YouTube, Vimeo, Twitch, etc.). Videos are detected from markdown URLs and rendered as responsive iframes.

## Goals

### Primary Goals
1. **Platform Support**: Auto-detect and embed videos from major platforms
2. **Responsive Design**: Videos adapt to container width with proper aspect ratios
3. **Markdown Integration**: Seamless detection in markdown responses
4. **Zero State Management**: Pure presentational component (no reducer needed)
5. **Consistent with ImageGallery**: Follow same detection → extraction → rendering pattern

### Non-Goals
- Custom video player controls (use platform's native player)
- Video hosting/upload functionality
- Playback state management (play/pause tracking)
- Video download capabilities
- Offline video support

## Architecture

### Component Hierarchy

```
ChatMessage.svelte
  └── (detects videos in markdown)
      └── VideoEmbed.svelte (presentational only)
```

### Data Flow

```
1. LLM streams response with video URLs
   ↓
2. Markdown renderer completes
   ↓
3. extractVideosFromMarkdown() parses URLs
   ↓
4. VideoEmbed components render iframes
   ↓
5. Platform-specific embed URLs generated
```

## Platform Support

### Tier 1: Core Platforms (Must Have)
- **YouTube**: `youtube.com/watch?v=`, `youtu.be/`
- **Vimeo**: `vimeo.com/`
- **Twitch**: `twitch.tv/videos/`

### Tier 2: Additional Platforms (Should Have)
- **Twitter/X**: `twitter.com/*/video/`, `x.com/*/video/`
- **TikTok**: `tiktok.com/@*/video/`
- **Dailymotion**: `dailymotion.com/video/`

### Tier 3: Future Platforms (Nice to Have)
- **Streamable**: `streamable.com/`
- **Wistia**: `wistia.com/`
- **Generic iframe**: Support any `<iframe>` embed code

## Types

```typescript
/**
 * Supported video platforms
 */
export type VideoPlatform =
  | 'youtube'
  | 'vimeo'
  | 'twitch'
  | 'twitter'
  | 'tiktok'
  | 'dailymotion'
  | 'generic';

/**
 * Aspect ratio presets
 */
export type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16';

/**
 * Video embed data
 */
export interface VideoEmbed {
  /** Original URL from markdown */
  url: string;

  /** Detected platform */
  platform: VideoPlatform;

  /** Extracted video ID */
  videoId: string;

  /** Optional video title */
  title?: string;

  /** Aspect ratio (default: 16:9) */
  aspectRatio?: AspectRatio;

  /** Platform-specific embed URL */
  embedUrl: string;

  /** Optional start time in seconds */
  startTime?: number;
}

/**
 * Platform configuration
 */
interface PlatformConfig {
  name: string;
  urlPatterns: RegExp[];
  extractId: (url: string) => string | null;
  buildEmbedUrl: (videoId: string, options?: EmbedOptions) => string;
  defaultAspectRatio: AspectRatio;
}

/**
 * Embed options
 */
interface EmbedOptions {
  autoplay?: boolean;
  muted?: boolean;
  startTime?: number;
  loop?: boolean;
}
```

## URL Detection Patterns

### YouTube
```typescript
const youtubePatterns = [
  /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
];

// Embed URL: https://www.youtube.com/embed/{videoId}
// With start time: ?start=123
```

### Vimeo
```typescript
const vimeoPatterns = [
  /(?:vimeo\.com\/)(\d+)/,
  /(?:player\.vimeo\.com\/video\/)(\d+)/
];

// Embed URL: https://player.vimeo.com/video/{videoId}
```

### Twitch
```typescript
const twitchPatterns = [
  /(?:twitch\.tv\/videos\/)(\d+)/,
  /(?:twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/
];

// Embed URL requires dynamic parent parameter
// Example: https://player.twitch.tv/?video={videoId}&parent=localhost
buildEmbedUrl: (videoId: string) => {
  // Get current domain dynamically (SSR-safe)
  const domain = typeof window !== 'undefined'
    ? window.location.hostname
    : 'localhost';
  return `https://player.twitch.tv/?video=${videoId}&parent=${domain}`;
}
```

## Implementation Steps

### Phase 1: Core Infrastructure (Simple)
1. ✅ Create `VideoEmbed.svelte` component
2. ✅ Implement YouTube detection and embed
3. ✅ Add responsive iframe container with aspect ratio
4. ✅ Basic styling (border-radius, shadow)

### Phase 2: Platform Detection (Moderate)
1. ✅ Create `video-detection.ts` utility
2. ✅ Implement platform registry with configs
3. ✅ Add URL parsing for YouTube, Vimeo, Twitch
4. ✅ Build embed URL generation

### Phase 3: Markdown Integration (Moderate)
1. ✅ Add `extractVideosFromMarkdown()` to `markdown.ts`
2. ✅ Detect video URLs in completed messages
3. ✅ Integrate VideoEmbed into ChatMessage.svelte
4. ✅ Add CSS styling for video grid layout

### Phase 4: Advanced Features (Optional)
1. ⏳ Support start time parameters (`?t=123`)
2. ⏳ Add loading skeleton during iframe load
3. ⏳ Error handling for invalid/private videos
4. ⏳ Support playlists (YouTube)
5. ⏳ Add "Open in new tab" button overlay

### Phase 5: Testing & Polish (Simple)
1. ✅ Test with various URL formats
2. ✅ Verify responsive behavior on mobile
3. ✅ Test with multiple videos in one message
4. ✅ Add to StreamingChat mock responses

## File Structure

```
packages/code/src/lib/
├── streaming-chat/
│   ├── ChatMessage.svelte          # [MODIFY] Add video rendering
│   ├── markdown.ts                 # [MODIFY] Add extractVideosFromMarkdown()
│   └── types.ts                    # [MODIFY] Add mock video responses
│
└── video-embed/
    ├── VideoEmbed.svelte           # [NEW] Main component
    ├── video-detection.ts          # [NEW] URL parsing utilities
    ├── types.ts                    # [NEW] Type definitions
    └── index.ts                    # [NEW] Exports

packages/code/src/lib/index.ts      # [MODIFY] Export VideoEmbed
```

## VideoEmbed Component API

### Simple Usage (Recommended)
```svelte
<script>
  import { VideoEmbed } from '@composable-svelte/code/video-embed';

  const video = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    platform: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    aspectRatio: '16:9'
  };
</script>

<VideoEmbed {video} />
```

### Props
```typescript
interface Props {
  /** Video embed data (required) */
  video: VideoEmbed;

  /** Custom CSS class */
  class?: string;

  /** Enable autoplay (default: false) */
  autoplay?: boolean;

  /** Show video title above embed (default: false) */
  showTitle?: boolean;
}
```

### CSS Structure
```css
.video-embed {
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.video-embed__container {
  position: relative;
  width: 100%;
  /* Aspect ratio handled via inline style */
}

.video-embed__iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.video-embed__title {
  padding: 8px 12px;
  background: #f5f5f5;
  font-size: 14px;
  font-weight: 500;
}
```

## Markdown Integration

### Detection in markdown.ts

```typescript
/**
 * Extract video URLs from markdown content.
 *
 * Uses platform-specific patterns to avoid conflicts with image URL detection.
 * Only detects URLs that match known video platform patterns.
 */
export function extractVideosFromMarkdown(markdown: string): VideoEmbed[] {
  const videos: VideoEmbed[] = [];

  // Use platform-specific patterns directly to avoid matching image URLs
  for (const [platform, config] of platforms) {
    for (const pattern of config.urlPatterns) {
      // Use matchAll to find all occurrences globally
      const matches = markdown.matchAll(new RegExp(pattern.source, 'g'));

      for (const match of matches) {
        if (match[1]) {
          const videoId = match[1];
          videos.push({
            url: match[0],
            platform,
            videoId,
            aspectRatio: config.defaultAspectRatio,
            embedUrl: config.buildEmbedUrl(videoId)
          });
        }
      }
    }
  }

  return videos;
}

/**
 * Detect video platform from a single URL.
 *
 * @param url - URL to check
 * @returns VideoEmbed if URL matches a known platform, null otherwise
 */
export function detectVideo(url: string): VideoEmbed | null {
  for (const [platform, config] of platforms) {
    for (const pattern of config.urlPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const videoId = match[1];
        return {
          url,
          platform,
          videoId,
          aspectRatio: config.defaultAspectRatio,
          embedUrl: config.buildEmbedUrl(videoId)
        };
      }
    }
  }

  return null;
}
```

### ChatMessage Integration

```svelte
<script lang="ts">
  import { extractVideosFromMarkdown } from './markdown.js';
  import { VideoEmbed } from '../video-embed/index.js';

  // Extract videos from completed messages
  const videos = $derived(() => {
    if (message.role === 'assistant' && !isStreaming) {
      return extractVideosFromMarkdown(message.content);
    }
    return [];
  });
</script>

<!-- Render videos after message content -->
{#if videos().length > 0}
  <div class="chat-message__videos">
    {#each videos() as video}
      <VideoEmbed {video} />
    {/each}
  </div>
{/if}
```

### Double Rendering Behavior

**Important**: Video URLs will appear in **two places** in the rendered output:

1. **As clickable links in the markdown**: The URL appears as a standard markdown link (`<a href="...">https://youtube.com/...</a>`)
2. **As embedded players below**: The VideoEmbed component renders an iframe player

This is **intentional** and provides several benefits:

- **Fallback**: If the embed fails to load, users can still click the link to open the video
- **User choice**: Users can choose to watch in-page or open in a new tab
- **Accessibility**: Screen readers announce both the link and the embedded player
- **Platform flexibility**: Some platforms may block embeds in certain contexts, link still works

**Example rendered output:**
```html
<!-- Markdown renders the link -->
<p>
  Check out this video:
  <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
  </a>
</p>

<!-- VideoEmbed renders the player -->
<div class="chat-message__videos">
  <div class="video-embed">
    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ">...</iframe>
  </div>
</div>
```

If this behavior is not desired, you could:
- Hide video URLs in markdown using CSS (`a[href*="youtube.com"] { display: none; }`)
- Strip video URLs from markdown before rendering
- Replace video URLs with placeholder text like `[Video Below]`

For the initial implementation, we recommend keeping both for maximum flexibility.

## Mock Streaming Chat Integration

Add video-containing responses to mock chat:

```typescript
const responses = [
  // ... existing responses

  `Here's a great tutorial on "${message}":\n\n` +
  `https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n` +
  `This video covers all the fundamentals you need to get started!`,

  `Check out these resources:\n\n` +
  `YouTube: https://www.youtube.com/watch?v=jNQXAC9IVRw\n` +
  `Vimeo: https://vimeo.com/123456789\n\n` +
  `Both videos provide excellent explanations.`
];
```

## Accessibility

### ARIA Labels
```html
<div class="video-embed" role="region" aria-label="Embedded video">
  <iframe
    src={embedUrl}
    title={video.title || 'Video player'}
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
    aria-label={`${video.platform} video player`}
  />
</div>
```

### Keyboard Support
- Tab navigation works natively with iframe
- Platform players handle keyboard controls (Space, K, arrows, etc.)

### Screen Readers
- Provide meaningful titles for each video
- Announce platform (YouTube, Vimeo, etc.)

## Security Considerations

### iframe Sandbox
```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-presentation"
  referrerpolicy="no-referrer"
/>
```

### Content Security Policy
```
frame-src youtube.com vimeo.com twitch.tv;
```

### URL Validation
- Whitelist allowed domains
- Validate video ID format
- Sanitize parameters

## Testing Strategy

### Unit Tests
```typescript
describe('video-detection', () => {
  it('detects YouTube URLs', () => {
    const video = detectVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(video?.platform).toBe('youtube');
    expect(video?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('detects YouTube short URLs', () => {
    const video = detectVideo('https://youtu.be/dQw4w9WgXcQ');
    expect(video?.videoId).toBe('dQw4w9WgXcQ');
  });

  it('detects Vimeo URLs', () => {
    const video = detectVideo('https://vimeo.com/123456789');
    expect(video?.platform).toBe('vimeo');
  });

  it('returns null for non-video URLs', () => {
    const video = detectVideo('https://example.com');
    expect(video).toBeNull();
  });
});
```

### Integration Tests
- Test markdown extraction with multiple videos
- Verify iframe rendering
- Test responsive behavior

### Manual Testing
- Test on mobile devices
- Verify playback on each platform
- Test with private/deleted videos

## Performance Considerations

### Lazy Loading
```html
<iframe loading="lazy" />
```

### Thumbnail Optimization
- Use platform thumbnail APIs for preview images
- Load iframe only when scrolled into view

### Multiple Videos
- Limit concurrent iframe loads
- Use Intersection Observer for lazy loading

## Error Handling

### Invalid URLs
- Silently ignore malformed URLs
- Log warnings for debugging

### Private/Deleted Videos
- Platform players show their own error messages
- No custom error UI needed

### Network Failures
- iframe handles loading states natively
- Platform players show loading spinners

## Future Enhancements

### Phase 11+ Possibilities
1. **Video Thumbnails**: Show preview image, load iframe on click
2. **Playlist Support**: Detect and embed YouTube playlists
3. **Timestamp Links**: Support `?t=123` for start time
4. **Video Gallery**: Multiple videos in grid layout (like ImageGallery)
5. **Picture-in-Picture**: Float video while scrolling
6. **Captions/Subtitles**: Extract and display captions
7. **Watch Later**: Save videos to a collection
8. **Playback Analytics**: Track watch time (with user consent)

## Dependencies

### New Dependencies
- None! Uses native iframe embed

### Peer Dependencies
- `@composable-svelte/core` (for ChatMessage integration)

## Migration Path

No breaking changes - purely additive feature.

### Adoption Steps
1. Update `@composable-svelte/code` package
2. Videos automatically detected in existing chat messages
3. No code changes required for users

## Success Metrics

### Phase 1 Success
- ✅ YouTube videos render in chat messages
- ✅ Responsive on mobile and desktop
- ✅ No console errors or warnings

### Full Success
- ✅ 3+ platforms supported (YouTube, Vimeo, Twitch)
- ✅ Automatic detection in markdown
- ✅ Smooth integration with StreamingChat
- ✅ Zero state management complexity

## Timeline Estimate

- **Phase 1** (Core): 2-3 hours
- **Phase 2** (Platforms): 2 hours
- **Phase 3** (Integration): 1-2 hours
- **Phase 4** (Advanced): 3-4 hours (optional)
- **Phase 5** (Testing): 1 hour

**Total**: 6-8 hours (core) + 3-4 hours (optional features)

## Open Questions

1. **Autoplay Policy**: Should videos autoplay (usually blocked by browsers)?
   - **Decision**: Default to no autoplay, respect browser policies

2. **Multiple Videos**: Grid layout or stacked?
   - **Decision**: Stacked vertically, similar to images

3. **Video Size**: Max width constraint?
   - **Decision**: 800px max-width, scales down on mobile

4. **Start Time**: Support `?t=` parameter?
   - **Decision**: Phase 4 feature, not critical for MVP

## Conclusion

This plan provides a clean, simple video embedding solution that:
- Follows the ImageGallery pattern for consistency
- Requires zero state management (pure presentational)
- Supports major platforms out of the box
- Integrates seamlessly with existing markdown rendering
- Maintains security and accessibility standards

Ready to implement when approved! 🎬

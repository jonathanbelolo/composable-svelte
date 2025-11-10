# Phase 16: Generalized WebGLOverlay Implementation Plan

**Status**: Planning
**Date**: November 10, 2025
**Goal**: Extract and generalize WebGLOverlay from shader-gallery into @composable-svelte/graphics package

---

## Executive Summary

The shader-gallery example demonstrates a powerful pattern: layering a full-screen WebGL canvas on top of HTML content and synchronizing DOM elements with GPU-rendered textures. This pattern has broad applicability beyond image galleries - it enables shader effects on text, video, and any HTML content.

This plan outlines the extraction and generalization of this overlay system into reusable, production-ready components.

---

## Motivation

### Current State
- WebGLOverlay exists only in shader-gallery example
- Hardcoded for image galleries
- Image-specific registration API
- No support for text, video, or complex HTML

### Desired State
- Reusable WebGLOverlay component in @composable-svelte/graphics
- Element-agnostic API (images, text, video, canvas, HTML)
- Specialized wrapper components (OverlayImage, OverlayText, etc.)
- Shader effect library
- Performance-optimized texture management

### Benefits
1. **Broader Applicability**: Apply shader effects to any content type
2. **Bundle Size Reduction**: Users only include shader-gallery if needed
3. **Reusable Pattern**: HTML + WebGL mixing is valuable for many apps
4. **DX Improvement**: Easy-to-use components vs manual WebGL
5. **Performance**: Optimized texture caching and updates

---

## Architecture Overview

### Package Structure

```
@composable-svelte/graphics/
├── overlay/
│   ├── WebGLOverlay.svelte          # Core full-screen canvas component
│   ├── OverlayImage.svelte          # Image wrapper (auto-registration)
│   ├── OverlayText.svelte           # Text wrapper (canvas rendering)
│   ├── OverlayVideo.svelte          # Video wrapper (frame updates)
│   ├── OverlayCanvas.svelte         # Canvas wrapper (direct texture)
│   ├── OverlayElement.svelte        # Generic element wrapper
│   ├── overlay-context.ts           # Context API types
│   ├── overlay-registry.ts          # Element registration management
│   ├── texture-factory.ts           # Texture creation strategies
│   ├── update-strategies.ts         # Update scheduling logic
│   └── index.ts
│
├── shaders/
│   ├── presets/
│   │   ├── wave.ts                  # Wave distortion
│   │   ├── pixelate.ts              # Pixelation effect
│   │   ├── chromatic.ts             # Chromatic aberration
│   │   ├── blur.ts                  # Gaussian blur (NEW)
│   │   ├── glow.ts                  # Glow effect (NEW)
│   │   ├── noise.ts                 # Perlin noise (NEW)
│   │   └── index.ts
│   ├── shader-compiler.ts           # GLSL compilation utilities
│   ├── shader-uniforms.ts           # Uniform management
│   └── index.ts
│
├── utils/
│   ├── gl-utils.ts                  # WebGL helper functions
│   ├── coordinate-converter.ts      # DOM ↔ NDC conversion
│   └── performance.ts               # Texture pooling, caching
│
└── index.ts                         # Main package exports
```

---

## Core Types

### Element Registration

```typescript
type ElementType = 'image' | 'video' | 'canvas' | 'text' | 'html';

type UpdateStrategy =
  | 'static'      // Update once (images, static text)
  | 'frame'       // Update every frame (video, animations)
  | 'manual'      // Update when requested
  | 'reactive';   // Update on element changes (MutationObserver)

interface ElementRegistration {
  id: string;
  element: HTMLElement;
  type: ElementType;
  texture: WebGLTexture | null;
  bounds: DOMRect;
  updateStrategy: UpdateStrategy;
  needsUpdate: boolean;
  metadata?: {
    // Element-specific data
    textContent?: string;          // For text elements
    videoCurrentTime?: number;     // For video elements
    canvasDataURL?: string;        // For canvas caching
  };
}
```

### Overlay Context API

```typescript
interface OverlayContextAPI {
  // Element registration
  registerElement(
    id: string,
    element: HTMLElement,
    options?: {
      type?: ElementType;
      updateStrategy?: UpdateStrategy;
      shaderOverride?: ShaderEffect;
    }
  ): Promise<void>;

  // Element updates
  updateElement(id: string): Promise<void>;
  updateElementBounds(id: string, bounds: DOMRect): void;

  // Element removal
  unregisterElement(id: string): void;

  // Shader control
  setShaderEffect(effect: ShaderEffect): void;
  setElementShader(id: string, effect: ShaderEffect): void;

  // Performance
  pauseUpdates(): void;
  resumeUpdates(): void;

  // Debugging
  getRegisteredElements(): ElementRegistration[];
  getStats(): OverlayStats;
}

interface OverlayStats {
  registeredElements: number;
  activeTextures: number;
  frameRate: number;
  textureMemory: number;
  updatesPending: number;
}
```

### Shader System

```typescript
type ShaderEffect =
  | 'none'
  | 'wave'
  | 'pixelate'
  | 'chromatic'
  | 'blur'
  | 'glow'
  | 'noise'
  | CustomShaderEffect;

interface CustomShaderEffect {
  name: string;
  vertex?: string;    // Optional custom vertex shader
  fragment: string;   // Required fragment shader
  uniforms?: Record<string, ShaderUniform>;
}

type ShaderUniform =
  | { type: 'float'; value: number }
  | { type: 'vec2'; value: [number, number] }
  | { type: 'vec3'; value: [number, number, number] }
  | { type: 'vec4'; value: [number, number, number, number] }
  | { type: 'sampler2D'; value: WebGLTexture };
```

---

## Implementation Phases

### **Phase 0: Foundation & Risk Mitigation** (Week 1)

**Purpose**: Establish critical infrastructure to handle production edge cases before building features.

#### 0.1 WebGL Context Management
**File**: `utils/webgl-context-manager.ts`

**Critical Need**: WebGL contexts can be lost due to GPU crashes, tab backgrounding, or power management. Without recovery, the overlay becomes permanently broken.

```typescript
export class WebGLContextManager {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private contextLost = false;
  private onContextLostCallbacks: (() => void)[] = [];
  private onContextRestoredCallbacks: (() => void)[] = [];

  initialize(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
    this.canvas = canvas;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('[WebGLOverlay] Context lost - will attempt to restore');
      this.notifyContextLost();
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.info('[WebGLOverlay] Context restored - recreating resources');
      this.contextLost = false;
      this.gl = this.createContext();
      this.notifyContextRestored();
    });

    this.gl = this.createContext();
    return this.gl;
  }

  private createContext(): WebGLRenderingContext | null {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      console.error('[WebGLOverlay] WebGL not supported');
      return null;
    }

    return gl;
  }

  onContextLost(callback: () => void): void {
    this.onContextLostCallbacks.push(callback);
  }

  onContextRestored(callback: () => void): void {
    this.onContextRestoredCallbacks.push(callback);
  }

  private notifyContextLost(): void {
    this.onContextLostCallbacks.forEach(cb => cb());
  }

  private notifyContextRestored(): void {
    this.onContextRestoredCallbacks.forEach(cb => cb());
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  getContext(): WebGLRenderingContext | null {
    return this.contextLost ? null : this.gl;
  }
}
```

**Tasks**:
- [ ] Implement WebGLContextManager class
- [ ] Add context loss event handlers
- [ ] Add resource recreation on context restore
- [ ] Test context loss scenarios (dev tools simulation)
- [ ] Document context loss recovery strategy

#### 0.2 Texture Size Validation
**File**: `utils/texture-validator.ts`

**Critical Need**: Devices have different texture size limits (8192 on desktop, 2048 on mobile). Exceeding limits causes silent failures.

```typescript
export class TextureValidator {
  private maxTextureSize: number;
  private maxMemoryBudget = 200 * 1024 * 1024; // 200MB
  private currentMemoryUsage = 0;

  constructor(gl: WebGLRenderingContext) {
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    console.info(`[WebGLOverlay] Max texture size: ${this.maxTextureSize}`);
  }

  validateSize(width: number, height: number): {
    valid: boolean;
    reason?: string;
    scaled?: { width: number; height: number };
  } {
    // Check individual dimensions
    if (width > this.maxTextureSize || height > this.maxTextureSize) {
      const scaled = this.scaleToFit(width, height);
      return {
        valid: false,
        reason: `Texture ${width}x${height} exceeds device max ${this.maxTextureSize}`,
        scaled
      };
    }

    // Check memory budget
    const estimatedBytes = width * height * 4; // RGBA
    if (this.currentMemoryUsage + estimatedBytes > this.maxMemoryBudget) {
      return {
        valid: false,
        reason: `Texture would exceed memory budget (${this.currentMemoryUsage + estimatedBytes} > ${this.maxMemoryBudget})`
      };
    }

    return { valid: true };
  }

  scaleToFit(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(
      this.maxTextureSize / width,
      this.maxTextureSize / height,
      1 // Don't upscale
    );

    return {
      width: Math.floor(width * scale),
      height: Math.floor(height * scale)
    };
  }

  trackAllocation(width: number, height: number): void {
    this.currentMemoryUsage += width * height * 4;
  }

  trackDeallocation(width: number, height: number): void {
    this.currentMemoryUsage -= width * height * 4;
  }

  getMemoryUsage(): { used: number; budget: number; percentage: number } {
    return {
      used: this.currentMemoryUsage,
      budget: this.maxMemoryBudget,
      percentage: (this.currentMemoryUsage / this.maxMemoryBudget) * 100
    };
  }
}
```

**Tasks**:
- [ ] Implement TextureValidator class
- [ ] Add device capability detection
- [ ] Implement auto-scaling for oversized textures
- [ ] Add memory budget tracking
- [ ] Add warning when approaching limits
- [ ] Test on low-end mobile devices

#### 0.3 Device Capabilities Detection
**File**: `utils/device-capabilities.ts`

**Critical Need**: Mobile devices have lower limits and different performance characteristics.

```typescript
export class DeviceCapabilities {
  readonly isMobile: boolean;
  readonly isIOS: boolean;
  readonly isAndroid: boolean;
  readonly maxTextureSize: number;
  readonly recommendedFPS: number;
  readonly recommendedMaxElements: number;
  readonly supportsWebGL2: boolean;

  constructor(gl: WebGLRenderingContext) {
    const ua = navigator.userAgent;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    this.isIOS = /iPhone|iPad|iPod/i.test(ua);
    this.isAndroid = /Android/i.test(ua);

    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // Check WebGL2 support
    const testCanvas = document.createElement('canvas');
    this.supportsWebGL2 = !!testCanvas.getContext('webgl2');

    // Set conservative limits for mobile
    if (this.isMobile) {
      // Mobile devices often support 4096 but we cap at 2048 for safety
      this.maxTextureSize = Math.min(this.maxTextureSize, 2048);
      this.recommendedFPS = 30;
      this.recommendedMaxElements = 10;
    } else {
      this.recommendedFPS = 60;
      this.recommendedMaxElements = 50;
    }

    this.logCapabilities();
  }

  private logCapabilities(): void {
    console.info('[WebGLOverlay] Device capabilities:', {
      isMobile: this.isMobile,
      platform: this.isIOS ? 'iOS' : this.isAndroid ? 'Android' : 'Desktop',
      maxTextureSize: this.maxTextureSize,
      recommendedFPS: this.recommendedFPS,
      recommendedMaxElements: this.recommendedMaxElements,
      webGL2: this.supportsWebGL2
    });
  }

  shouldReduceQuality(): boolean {
    return this.isMobile;
  }

  getTextureScaleFactor(): number {
    // Reduce texture resolution on mobile
    return this.isMobile ? 0.75 : 1.0;
  }
}
```

**Tasks**:
- [ ] Implement DeviceCapabilities class
- [ ] Add platform detection (iOS, Android, Desktop)
- [ ] Add WebGL2 support detection
- [ ] Set platform-specific performance targets
- [ ] Add device-specific optimizations
- [ ] Test across device spectrum

#### 0.4 Error Handling Framework
**File**: `utils/overlay-error.ts`

**Critical Need**: Generic error messages aren't helpful for debugging. Need structured errors with recovery suggestions.

```typescript
export enum OverlayErrorCode {
  WEBGL_NOT_SUPPORTED = 'WEBGL_NOT_SUPPORTED',
  CONTEXT_LOST = 'CONTEXT_LOST',
  TEXTURE_TOO_LARGE = 'TEXTURE_TOO_LARGE',
  SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
  CORS_TAINTED_CANVAS = 'CORS_TAINTED_CANVAS',
  MEMORY_BUDGET_EXCEEDED = 'MEMORY_BUDGET_EXCEEDED',
  INVALID_ELEMENT_TYPE = 'INVALID_ELEMENT_TYPE'
}

export class OverlayError extends Error {
  constructor(
    public code: OverlayErrorCode,
    message: string,
    public details?: Record<string, any>,
    public recovery?: string
  ) {
    super(message);
    this.name = 'OverlayError';
  }

  static webGLNotSupported(): OverlayError {
    return new OverlayError(
      OverlayErrorCode.WEBGL_NOT_SUPPORTED,
      'WebGL is not supported in this browser',
      {},
      'Use a modern browser that supports WebGL (Chrome, Firefox, Safari, Edge)'
    );
  }

  static textureTooLarge(width: number, height: number, maxSize: number): OverlayError {
    return new OverlayError(
      OverlayErrorCode.TEXTURE_TOO_LARGE,
      `Texture size ${width}x${height} exceeds device maximum ${maxSize}`,
      { width, height, maxSize },
      'Reduce image size or enable auto-scaling'
    );
  }

  static corsTaintedCanvas(elementId: string): OverlayError {
    return new OverlayError(
      OverlayErrorCode.CORS_TAINTED_CANVAS,
      `Cannot create texture from cross-origin image (element: ${elementId})`,
      { elementId },
      'Add crossOrigin="anonymous" attribute to image or serve images from same origin'
    );
  }

  static shaderCompilationFailed(shaderType: string, log: string): OverlayError {
    return new OverlayError(
      OverlayErrorCode.SHADER_COMPILATION_FAILED,
      `Failed to compile ${shaderType} shader`,
      { shaderType, log },
      'Check shader GLSL syntax and uniform declarations'
    );
  }

  toString(): string {
    let str = `[${this.code}] ${this.message}`;
    if (this.details && Object.keys(this.details).length > 0) {
      str += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
    }
    if (this.recovery) {
      str += `\nRecovery: ${this.recovery}`;
    }
    return str;
  }
}
```

**Tasks**:
- [ ] Implement OverlayError class with error codes
- [ ] Add recovery suggestions for each error type
- [ ] Add detailed error logging
- [ ] Create error documentation
- [ ] Test error scenarios

#### 0.5 Browser Compatibility Layer
**File**: `utils/browser-compatibility.ts`

**Critical Need**: Safari, Firefox, and Edge have subtle WebGL differences.

```typescript
export class BrowserCompatibility {
  readonly browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';
  readonly version: number;

  constructor() {
    const ua = navigator.userAgent;

    if (ua.includes('Edg/')) {
      this.browser = 'edge';
      this.version = parseInt(ua.match(/Edg\/(\d+)/)?.[1] || '0');
    } else if (ua.includes('Chrome/')) {
      this.browser = 'chrome';
      this.version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
    } else if (ua.includes('Firefox/')) {
      this.browser = 'firefox';
      this.version = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || '0');
    } else if (ua.includes('Safari/')) {
      this.browser = 'safari';
      this.version = parseInt(ua.match(/Version\/(\d+)/)?.[1] || '0');
    } else {
      this.browser = 'unknown';
      this.version = 0;
    }
  }

  needsCORSWorkaround(): boolean {
    // Safari is stricter with CORS
    return this.browser === 'safari';
  }

  supportsRequestVideoFrameCallback(): boolean {
    // Chrome 83+, Edge 83+
    return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  }

  getTextureFilteringHint(): number | null {
    // Safari benefits from WEBKIT_TEXTURE_FILTER_ANISOTROPIC
    if (this.browser === 'safari') {
      return 0x84FE; // WEBKIT_TEXTURE_FILTER_ANISOTROPIC_EXT
    }
    return null;
  }

  logBrowserInfo(): void {
    console.info('[WebGLOverlay] Browser:', {
      browser: this.browser,
      version: this.version,
      needsCORSWorkaround: this.needsCORSWorkaround(),
      supportsRequestVideoFrameCallback: this.supportsRequestVideoFrameCallback()
    });
  }
}
```

**Tasks**:
- [ ] Implement browser detection
- [ ] Add browser-specific WebGL workarounds
- [ ] Test on Chrome, Firefox, Safari, Edge
- [ ] Document known browser quirks
- [ ] Add compatibility matrix to docs

#### 0.6 Performance Infrastructure
**File**: `utils/render-loop.ts`

**Critical Need**: Don't waste battery rendering when tab is hidden. Add frame rate limiting.

```typescript
export class RenderLoop {
  private running = false;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private targetFPS = 60;
  private frameInterval: number;
  private tabVisible = true;

  constructor(targetFPS = 60) {
    this.targetFPS = targetFPS;
    this.frameInterval = 1000 / targetFPS;
    this.setupVisibilityListener();
  }

  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', () => {
      this.tabVisible = !document.hidden;

      if (this.tabVisible && this.running) {
        console.info('[WebGLOverlay] Tab visible - resuming rendering');
        this.lastFrameTime = performance.now();
      } else if (!this.tabVisible) {
        console.info('[WebGLOverlay] Tab hidden - pausing rendering');
      }
    });
  }

  start(callback: (deltaTime: number) => void): void {
    this.running = true;
    this.lastFrameTime = performance.now();

    const loop = (currentTime: number) => {
      if (!this.running) return;

      // Skip rendering if tab is hidden
      if (!this.tabVisible) {
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      const deltaTime = currentTime - this.lastFrameTime;

      // Frame rate limiting
      if (deltaTime >= this.frameInterval) {
        callback(deltaTime);
        this.lastFrameTime = currentTime - (deltaTime % this.frameInterval);
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setTargetFPS(fps: number): void {
    this.targetFPS = fps;
    this.frameInterval = 1000 / fps;
  }
}
```

**Tasks**:
- [ ] Implement RenderLoop with visibility detection
- [ ] Add frame rate limiting
- [ ] Pause rendering when tab hidden
- [ ] Add adaptive FPS based on device
- [ ] Test power consumption impact

#### 0.7 Security & Sanitization
**File**: `utils/html-sanitizer.ts`

**Critical Need**: html2canvas can execute scripts in rendered HTML. Must sanitize user-generated content.

```typescript
export class HTMLSanitizer {
  private allowedTags = new Set([
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'u', 'br', 'img', 'a'
  ]);

  private allowedAttributes = new Set([
    'class', 'style', 'id', 'src', 'alt', 'href'
  ]);

  /**
   * Check if element is safe to render with html2canvas
   * CRITICAL: html2canvas executes inline scripts and event handlers
   */
  isSafeToRender(element: HTMLElement): {
    safe: boolean;
    reason?: string;
  } {
    // Check for script tags
    if (element.querySelector('script')) {
      return {
        safe: false,
        reason: 'Contains <script> tags - potential XSS risk'
      };
    }

    // Check for inline event handlers
    const hasEventHandlers = this.hasInlineEventHandlers(element);
    if (hasEventHandlers) {
      return {
        safe: false,
        reason: 'Contains inline event handlers (onclick, onerror, etc.) - potential XSS risk'
      };
    }

    // Check for iframes (can't render cross-origin)
    if (element.querySelector('iframe')) {
      return {
        safe: false,
        reason: 'Contains <iframe> - cross-origin iframes cannot be rendered'
      };
    }

    // Check for javascript: URLs
    const hasJavascriptUrls = this.hasJavascriptUrls(element);
    if (hasJavascriptUrls) {
      return {
        safe: false,
        reason: 'Contains javascript: URLs - potential XSS risk'
      };
    }

    return { safe: true };
  }

  private hasInlineEventHandlers(element: HTMLElement): boolean {
    const eventAttributes = [
      'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onchange', 'onsubmit'
    ];

    const allElements = element.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      for (const attr of eventAttributes) {
        if (el.hasAttribute(attr)) {
          return true;
        }
      }
    }

    return false;
  }

  private hasJavascriptUrls(element: HTMLElement): boolean {
    const links = element.querySelectorAll('a[href], img[src]');
    for (const link of Array.from(links)) {
      const url = link.getAttribute('href') || link.getAttribute('src');
      if (url && url.trim().toLowerCase().startsWith('javascript:')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get recommended sanitization library
   * Returns null if content is trusted, library name if sanitization needed
   */
  getRecommendedSanitizer(isTrustedContent: boolean): string | null {
    if (isTrustedContent) {
      return null; // No sanitization needed for trusted content
    }

    // For user-generated content, recommend DOMPurify
    return 'DOMPurify (https://github.com/cure53/DOMPurify)';
  }
}
```

**Documentation Required**:

```markdown
# HTML Element Security

## ⚠️ CRITICAL: html2canvas Security Risks

html2canvas renders HTML to canvas by parsing DOM and executing some JavaScript:
- **Inline scripts** may execute during rendering
- **Event handlers** (onclick, onerror) may execute
- **javascript: URLs** may execute

## Safe Usage Patterns

### ✅ SAFE: Trusted, Static Content
```svelte
<WebGLOverlay>
  <OverlayElement type="html">
    <div class="hero">
      <h1>Static Title</h1>
      <p>Safe content from your codebase</p>
    </div>
  </OverlayElement>
</WebGLOverlay>
```

### ⚠️ UNSAFE: User-Generated Content
```svelte
<!-- DON'T DO THIS -->
<OverlayElement type="html">
  <div innerHTML={userContent}></div> <!-- ❌ XSS RISK -->
</OverlayElement>
```

### ✅ SAFE: Sanitized User Content
```svelte
<script>
  import DOMPurify from 'dompurify';
  const sanitized = DOMPurify.sanitize(userContent);
</script>

<OverlayElement type="html">
  <div innerHTML={sanitized}></div> <!-- ✅ Safe -->
</OverlayElement>
```

## Content Security Policy (CSP)

html2canvas may be blocked by strict CSP. If you see errors:
- Allow `script-src 'unsafe-inline'` (required by html2canvas)
- Or avoid using `type="html"` with strict CSP

## Alternatives to html2canvas

For untrusted content, consider:
1. **Don't use HTML rendering** - Use image/text/video instead
2. **Server-side rendering** - Render HTML to image on server
3. **SVG foreignObject** - Limited browser support, similar risks
```

**Tasks**:
- [ ] Implement HTMLSanitizer class
- [ ] Add safety checks for script tags, event handlers, javascript: URLs
- [ ] Add iframe detection (cross-origin iframes can't render)
- [ ] Document html2canvas security risks
- [ ] Recommend DOMPurify for user-generated content
- [ ] Add CSP compatibility warnings
- [ ] Create security documentation
- [ ] Add security tests (XSS prevention)

#### 0.8 Graceful Degradation
**File**: `overlay/WebGLOverlay.svelte`

**Strategy**: If WebGL fails or is unavailable, simply don't hide the original HTML elements.

```typescript
// In WebGLOverlay.svelte
let webglSupported = $state(false);
let contextManager: WebGLContextManager;

onMount(() => {
  const gl = contextManager.initialize(canvas);

  if (!gl) {
    console.warn('[WebGLOverlay] WebGL not supported - showing original HTML');
    webglSupported = false;
    // Don't hide elements - leave them visible as-is
    return;
  }

  webglSupported = true;
  // Continue with WebGL rendering...
});

// In element registration
function registerElement(id: string, element: HTMLElement, options?: RegisterOptions) {
  if (!webglSupported) {
    // Do nothing - element stays visible in original state
    console.debug(`[WebGLOverlay] Skipping registration for ${id} - WebGL not available`);
    return;
  }

  // Normal registration logic...
  element.style.opacity = '0'; // Hide original element
}
```

**Progressive Enhancement Approach**:
1. **Default State**: Elements render normally (no WebGL)
2. **Enhancement**: If WebGL available, hide originals and render to canvas
3. **Fallback**: If WebGL fails mid-render, restore original elements (opacity: 1)

**No Complex Fallbacks Needed**:
- ❌ Don't implement CSS filter fallbacks (different behavior)
- ❌ Don't show error messages (confusing for users)
- ✅ Simply show original HTML elements without effects

**Tasks**:
- [ ] Detect WebGL support on initialization
- [ ] Skip element hiding if WebGL unavailable
- [ ] Document progressive enhancement approach
- [ ] Test graceful degradation (disable WebGL in browser)
- [ ] Add feature detection example to docs

---

### **Phase 1: Core Infrastructure** (Week 2)

#### 1.1 Create Package Structure
- Create `packages/graphics/src/lib/overlay/` directory
- Setup exports in `packages/graphics/src/lib/index.ts`
- Add overlay section to graphics package README

#### 1.2 Extract WebGLOverlay Core
**File**: `overlay/WebGLOverlay.svelte`

Key changes from shader-gallery version:
```typescript
// BEFORE (shader-gallery)
registerImage: (id: string, img: HTMLImageElement) => { ... }

// AFTER (generalized)
registerElement: async (
  id: string,
  element: HTMLElement,
  options?: RegistrationOptions
) => { ... }
```

**Tasks**:
- [ ] Extract canvas setup and WebGL initialization
- [ ] Generalize registration API (remove image-specific code)
- [ ] Add element type detection
- [ ] Implement context provider with full API
- [ ] Add error handling and validation
- [ ] Add performance monitoring hooks

#### 1.3 Texture Factory System
**File**: `overlay/texture-factory.ts`

```typescript
export class TextureFactory {
  constructor(
    private gl: WebGLRenderingContext,
    private validator: TextureValidator
  ) {}

  async createTexture(
    element: HTMLElement,
    type: ElementType
  ): Promise<WebGLTexture | null> {
    switch (type) {
      case 'image':
        return this.createImageTexture(element as HTMLImageElement);
      case 'text':
        return this.createTextTexture(element);
      case 'video':
        return this.createVideoTexture(element as HTMLVideoElement);
      case 'canvas':
        return this.createCanvasTexture(element as HTMLCanvasElement);
      case 'html':
        return this.createHTMLTexture(element);
    }
  }

  private createImageTexture(img: HTMLImageElement): WebGLTexture | null {
    // CRITICAL: Check if image is CORS-tainted
    if (!this.isImageClean(img)) {
      throw OverlayError.corsTaintedCanvas(img.id || 'unknown');
    }

    // Validate size
    const validation = this.validator.validateSize(img.naturalWidth, img.naturalHeight);
    if (!validation.valid && validation.scaled) {
      console.warn(`Image too large, auto-scaling to ${validation.scaled.width}x${validation.scaled.height}`);
      return this.createScaledImageTexture(img, validation.scaled.width, validation.scaled.height);
    }

    const texture = this.gl.createTexture();
    if (!texture) return null;

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
    this.setTextureParameters();

    this.validator.trackAllocation(img.naturalWidth, img.naturalHeight);
    return texture;
  }

  private isImageClean(img: HTMLImageElement): boolean {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.getImageData(0, 0, 1, 1); // Throws if tainted
      return true;
    } catch (e) {
      return false;
    }
  }

  private createTextTexture(element: HTMLElement): WebGLTexture | null {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const styles = window.getComputedStyle(element);
    const text = element.textContent || '';

    // Wait for fonts to load to avoid FOUT/FOIT
    if (document.fonts && !document.fonts.check(`${styles.fontSize} ${styles.fontFamily}`)) {
      console.warn('[WebGLOverlay] Font not loaded, text may render incorrectly');
    }

    // Set font before measuring
    ctx.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    const metrics = ctx.measureText(text);

    // Use devicePixelRatio for high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const width = Math.ceil(metrics.width * dpr) || 1;
    const height = Math.ceil(parseFloat(styles.fontSize) * 1.5 * dpr);

    canvas.width = width;
    canvas.height = height;

    // Scale context for high-DPI
    ctx.scale(dpr, dpr);
    ctx.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    ctx.fillStyle = styles.color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 0, 0);

    return this.createCanvasTexture(canvas);
  }

  private createVideoTexture(video: HTMLVideoElement): WebGLTexture | null { ... }
  private createCanvasTexture(canvas: HTMLCanvasElement): WebGLTexture | null { ... }
  private async createHTMLTexture(element: HTMLElement): Promise<WebGLTexture | null> { ... }

  private setTextureParameters(): void {
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  }
}
```

**Tasks**:
- [ ] Implement image texture creation with CORS checking
- [ ] Implement text-to-canvas texture creation with font loading detection
- [ ] Implement high-DPI text rendering (devicePixelRatio)
- [ ] Implement video texture creation
- [ ] Implement canvas texture creation
- [ ] Research HTML texture creation options (html2canvas vs SVG foreignObject)
- [ ] Add texture parameter configuration (filtering, wrapping)
- [ ] Add auto-scaling for oversized textures
- [ ] Integrate with TextureValidator

#### 1.4 Update Strategy System
**File**: `overlay/update-strategies.ts`

```typescript
export class UpdateScheduler {
  private strategies = new Map<string, UpdateStrategy>();
  private updateQueue = new Set<string>();
  private frameUpdateIds = new Set<string>();
  private observers = new Map<string, MutationObserver>();

  scheduleUpdate(id: string, strategy: UpdateStrategy): void {
    this.strategies.set(id, strategy);

    switch (strategy) {
      case 'static':
        // No updates needed
        break;
      case 'frame':
        this.frameUpdateIds.add(id);
        break;
      case 'manual':
        // Update only when explicitly requested
        break;
      case 'reactive':
        this.setupReactiveObserver(id);
        break;
    }
  }

  private setupReactiveObserver(id: string): void {
    const registration = this.getRegistration(id);
    if (!registration) return;

    const observer = new MutationObserver(() => {
      this.updateQueue.add(id);
    });

    observer.observe(registration.element, {
      characterData: true,
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    this.observers.set(id, observer);
  }

  getFrameUpdates(): string[] {
    return Array.from(this.frameUpdateIds);
  }

  getPendingUpdates(): string[] {
    const pending = Array.from(this.updateQueue);
    this.updateQueue.clear();
    return pending;
  }

  cleanup(id: string): void {
    this.strategies.delete(id);
    this.frameUpdateIds.delete(id);
    this.updateQueue.delete(id);

    const observer = this.observers.get(id);
    if (observer) {
      observer.disconnect();
      this.observers.delete(id);
    }
  }
}
```

**Tasks**:
- [ ] Implement update scheduling logic
- [ ] Add frame-based update loop
- [ ] Implement MutationObserver for reactive updates
- [ ] Add debouncing for reactive updates
- [ ] Add update prioritization (visible elements first)
- [ ] Add performance metrics collection

---

### **Phase 2: Wrapper Components** (Week 3)

#### 2.1 OverlayImage Component
**File**: `overlay/OverlayImage.svelte`

```svelte
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { OverlayContextAPI } from './overlay-context';

  let {
    id = crypto.randomUUID(),
    src,
    alt = '',
    shaderEffect,
    ...props
  }: {
    id?: string;
    src: string;
    alt?: string;
    shaderEffect?: ShaderEffect;
    [key: string]: any;
  } = $props();

  let imgRef: HTMLImageElement;
  const overlay = getContext<OverlayContextAPI>('webgl-overlay');

  onMount(() => {
    if (!overlay) {
      console.warn('OverlayImage: No WebGLOverlay context found');
      return;
    }

    imgRef.onload = async () => {
      await overlay.registerElement(id, imgRef, {
        type: 'image',
        updateStrategy: 'static',
        shaderOverride: shaderEffect
      });
    };

    return () => overlay.unregisterElement(id);
  });
</script>

<img bind:this={imgRef} {src} {alt} {...props} />
```

**Tasks**:
- [ ] Implement image wrapper component
- [ ] Add loading state handling
- [ ] Add error handling (failed image load)
- [ ] Add lazy loading support
- [ ] Add srcset support for responsive images
- [ ] Document API and usage examples

#### 2.2 OverlayText Component
**File**: `overlay/OverlayText.svelte`

```svelte
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { OverlayContextAPI } from './overlay-context';

  let {
    id = crypto.randomUUID(),
    tag = 'span',
    reactive = false,
    shaderEffect,
    children,
    ...props
  }: {
    id?: string;
    tag?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
    reactive?: boolean;
    shaderEffect?: ShaderEffect;
    children?: Snippet;
    [key: string]: any;
  } = $props();

  let textRef: HTMLElement;
  const overlay = getContext<OverlayContextAPI>('webgl-overlay');

  onMount(() => {
    if (!overlay) {
      console.warn('OverlayText: No WebGLOverlay context found');
      return;
    }

    // Wait for next tick to ensure text is rendered
    requestAnimationFrame(async () => {
      await overlay.registerElement(id, textRef, {
        type: 'text',
        updateStrategy: reactive ? 'reactive' : 'static',
        shaderOverride: shaderEffect
      });
    });

    return () => overlay.unregisterElement(id);
  });
</script>

<svelte:element this={tag} bind:this={textRef} {...props}>
  {@render children?.()}
</svelte:element>
```

**Tasks**:
- [ ] Implement text wrapper component
- [ ] Add reactive text updates via MutationObserver
- [ ] Support all text tags (span, p, h1-h6, div)
- [ ] Capture computed styles (font, color, alignment)
- [ ] Handle multiline text properly
- [ ] Add text measurement and canvas sizing
- [ ] Document API and usage examples

#### 2.3 OverlayVideo Component
**File**: `overlay/OverlayVideo.svelte`

```svelte
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { OverlayContextAPI } from './overlay-context';

  let {
    id = crypto.randomUUID(),
    src,
    shaderEffect,
    ...props
  }: {
    id?: string;
    src: string;
    shaderEffect?: ShaderEffect;
    [key: string]: any;
  } = $props();

  let videoRef: HTMLVideoElement;
  const overlay = getContext<OverlayContextAPI>('webgl-overlay');

  onMount(() => {
    if (!overlay) {
      console.warn('OverlayVideo: No WebGLOverlay context found');
      return;
    }

    videoRef.onloadeddata = async () => {
      await overlay.registerElement(id, videoRef, {
        type: 'video',
        updateStrategy: 'frame', // Update every frame
        shaderOverride: shaderEffect
      });
    };

    return () => overlay.unregisterElement(id);
  });
</script>

<video bind:this={videoRef} {src} {...props} />
```

**Tasks**:
- [ ] Implement video wrapper component
- [ ] Handle video loading states
- [ ] Implement optimized frame updates with requestVideoFrameCallback (Chrome/Edge 83+)
- [ ] Add fallback to requestAnimationFrame for Firefox/Safari
- [ ] Only update texture when video is playing (check paused/ended state)
- [ ] Add play/pause event synchronization
- [ ] Handle video resize events
- [ ] Document API and usage examples

**Enhanced Video Update Strategy**:
```typescript
// Optimal video texture updates
function updateVideoTexture(video: HTMLVideoElement) {
  // Don't update if paused or ended
  if (video.paused || video.ended) return;

  // Use requestVideoFrameCallback if available (Chrome 83+)
  if ('requestVideoFrameCallback' in video) {
    video.requestVideoFrameCallback(() => {
      updateTexture(video);
      updateVideoTexture(video); // Schedule next frame
    });
  } else {
    // Fallback to RAF for other browsers
    requestAnimationFrame(() => {
      updateTexture(video);
      updateVideoTexture(video);
    });
  }
}
```

#### 2.4 OverlayCanvas Component
**File**: `overlay/OverlayCanvas.svelte`

**Tasks**:
- [ ] Implement canvas wrapper component
- [ ] Support manual update triggers
- [ ] Handle canvas resize events
- [ ] Document API and usage examples

#### 2.5 OverlayElement Component (Generic)
**File**: `overlay/OverlayElement.svelte`

**Tasks**:
- [ ] Implement generic element wrapper
- [ ] Support custom element types
- [ ] Support custom update strategies
- [ ] Document API and usage examples

---

### **Phase 3: Shader Library** (Week 4)

#### 3.1 Extract Existing Shaders
**Files**: `shaders/presets/*.ts`

Existing shaders from shader-gallery:
- Wave distortion
- Pixelate effect
- Chromatic aberration

**Tasks**:
- [ ] Extract wave shader with configurable parameters
- [ ] Extract pixelate shader with configurable parameters
- [ ] Extract chromatic shader with configurable parameters
- [ ] Create shader configuration API
- [ ] Add shader validation

#### 3.2 New Shader Effects

**Blur Shader** (`shaders/presets/blur.ts`):
```glsl
// Gaussian blur
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 u_resolution;
uniform float u_blurAmount; // 0-20 pixels

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec4 color = vec4(0.0);
  float total = 0.0;

  for (float x = -4.0; x <= 4.0; x++) {
    for (float y = -4.0; y <= 4.0; y++) {
      vec2 offset = vec2(x, y) * texelSize * u_blurAmount;
      float weight = exp(-(x*x + y*y) / 8.0);
      color += texture2D(textureSampler, vUV + offset) * weight;
      total += weight;
    }
  }

  gl_FragColor = color / total;
}
```

**Glow Shader** (`shaders/presets/glow.ts`):
```glsl
// Bloom/glow effect
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float u_glowIntensity; // 0-2

void main() {
  vec4 color = texture2D(textureSampler, vUV);
  float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  if (brightness > 0.7) {
    color.rgb += color.rgb * u_glowIntensity;
  }

  gl_FragColor = color;
}
```

**Noise Shader** (`shaders/presets/noise.ts`):
```glsl
// Perlin noise overlay
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float u_time;
uniform float u_noiseAmount; // 0-1

// Simple noise function
float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec4 color = texture2D(textureSampler, vUV);
  float n = noise(vUV * 100.0 + u_time);
  color.rgb = mix(color.rgb, vec3(n), u_noiseAmount);
  gl_FragColor = color;
}
```

**Tasks**:
- [ ] Implement blur shader with kernel size control
- [ ] Implement glow/bloom shader
- [ ] Implement noise/grain shader
- [ ] Add shader parameter validation
- [ ] Create shader preset library
- [ ] Document all shader parameters

#### 3.3 Shader Compiler Utilities
**File**: `shaders/shader-compiler.ts`

**Tasks**:
- [ ] Create GLSL compilation helpers
- [ ] Add shader error parsing
- [ ] Add shader hot-reloading (dev mode)
- [ ] Add shader caching
- [ ] Add shader validation

#### 3.4 Custom Shader Support

**Tasks**:
- [ ] Support user-provided GLSL code
- [ ] Validate custom shaders
- [ ] Document custom shader API
- [ ] Provide shader development examples

---

### **Phase 4: Performance Optimizations** (Week 5)

#### 4.1 Texture Pooling
**File**: `utils/texture-pool.ts`

```typescript
export class TexturePool {
  private pool = new Map<string, WebGLTexture[]>();
  private maxSize = 50; // Max textures to pool

  getTexture(
    gl: WebGLRenderingContext,
    width: number,
    height: number
  ): WebGLTexture {
    const key = `${width}x${height}`;
    const textures = this.pool.get(key) || [];

    if (textures.length > 0) {
      return textures.pop()!;
    }

    // Create new texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    return texture;
  }

  returnTexture(
    texture: WebGLTexture,
    width: number,
    height: number
  ): void {
    const key = `${width}x${height}`;
    const textures = this.pool.get(key) || [];

    if (textures.length < this.maxSize) {
      textures.push(texture);
      this.pool.set(key, textures);
    } else {
      // Pool is full, delete texture
      gl.deleteTexture(texture);
    }
  }

  clear(gl: WebGLRenderingContext): void {
    this.pool.forEach((textures) => {
      textures.forEach(t => gl.deleteTexture(t));
    });
    this.pool.clear();
  }
}
```

**Tasks**:
- [ ] Implement texture pooling system
- [ ] Add size-based pooling strategy
- [ ] Add texture memory tracking
- [ ] Add pool statistics

#### 4.2 Visibility Culling

**Tasks**:
- [ ] Implement viewport intersection checking
- [ ] Skip rendering for offscreen elements
- [ ] Add scroll-based culling
- [ ] Add configurable culling margins

#### 4.3 Texture Caching

**Tasks**:
- [ ] Cache text textures (recreate only on text change)
- [ ] Cache static image textures
- [ ] Implement LRU cache eviction
- [ ] Add cache size limits

#### 4.4 Performance Monitoring
**File**: `utils/performance.ts`

**Tasks**:
- [ ] Track frame rate
- [ ] Track texture memory usage
- [ ] Track update frequency
- [ ] Add performance debugging tools
- [ ] Add dev mode performance warnings

---

### **Phase 5: Testing & Documentation** (Week 6)

#### 5.1 Unit Tests (Non-WebGL Logic)

**Test Coverage**:
- [ ] Element type detection (Vitest + jsdom)
- [ ] UpdateScheduler strategies (Vitest + jsdom)
- [ ] Coordinate conversion utilities (Vitest + jsdom)
- [ ] Error handling and OverlayError (Vitest + jsdom)
- [ ] Device capabilities detection (Vitest + jsdom)
- [ ] Browser compatibility layer (Vitest + jsdom)

**Test Framework**: Vitest + jsdom (for non-WebGL logic only)

**Configuration**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.webgl.test.ts'] // Exclude WebGL tests
  }
});
```

**CRITICAL**: jsdom **CANNOT** test WebGL. All WebGL-related tests must use Playwright (see 5.2).

#### 5.2 Integration Tests (WebGL Required)

**Test Framework**: Playwright (real browser testing)

**Why Playwright**:
- jsdom does NOT support WebGL contexts
- WebGL requires actual GPU and browser implementation
- Playwright runs tests in real Chrome/Firefox/Safari instances

**Test Scenarios**:
- [ ] WebGL context initialization
- [ ] Texture creation from all element types (image, text, video, canvas)
- [ ] Shader compilation and rendering
- [ ] WebGLOverlay with multiple element types
- [ ] Dynamic element registration/unregistration
- [ ] Shader effect switching
- [ ] Performance under load (100+ elements)
- [ ] Memory leak detection
- [ ] Context loss and recovery
- [ ] CORS-tainted canvas handling

**Browser Matrix**:
- [ ] Chrome (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Edge (desktop)
- [ ] Chrome Mobile (emulated)
- [ ] Safari iOS (emulated)

**Playwright Configuration**:
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/webgl',
  use: {
    screenshot: 'on',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'chrome-mobile', use: { ...devices['Pixel 5'] } },
  ],
});
```

**Example Playwright Test**:
```typescript
// tests/webgl/overlay.webgl.test.ts
import { test, expect } from '@playwright/test';

test('WebGLOverlay renders with wave effect', async ({ page }) => {
  await page.goto('/test/webgl-overlay');

  // Wait for WebGL context to initialize
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.getContext('webgl') !== null;
  });

  // Verify canvas is rendering
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Visual regression test
  await expect(page).toHaveScreenshot('wave-effect.png', {
    maxDiffPixels: 100
  });
});

test('handles WebGL context loss', async ({ page }) => {
  await page.goto('/test/webgl-overlay');

  // Simulate context loss using Chrome DevTools Protocol
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl');
    const loseContext = gl.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
  });

  // Verify error handling
  const errorMessage = await page.locator('[data-testid="error"]').textContent();
  expect(errorMessage).toContain('Context lost');

  // Restore context
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl');
    const loseContext = gl.getExtension('WEBGL_lose_context');
    loseContext?.restoreContext();
  });

  // Verify recovery
  await expect(page.locator('[data-testid="error"]')).not.toBeVisible();
});

test('creates textures from different element types', async ({ page }) => {
  await page.goto('/test/texture-factory');

  // Test image texture
  await page.click('[data-testid="add-image"]');
  await expect(page.locator('[data-testid="texture-count"]')).toHaveText('1');

  // Test text texture
  await page.click('[data-testid="add-text"]');
  await expect(page.locator('[data-testid="texture-count"]')).toHaveText('2');

  // Test video texture
  await page.click('[data-testid="add-video"]');
  await expect(page.locator('[data-testid="texture-count"]')).toHaveText('3');

  // Visual regression - all textures rendered
  await expect(page).toHaveScreenshot('all-textures.png');
});
```

**Visual Regression Testing**:
```bash
# Capture baseline screenshots
pnpm playwright test --update-snapshots

# Run tests with visual comparison
pnpm playwright test

# View test report with screenshot diffs
pnpm playwright show-report
```

#### 5.3 Component Documentation

**Documentation Required**:
- [ ] WebGLOverlay API reference
- [ ] All wrapper component APIs
- [ ] Shader effect catalog with examples
- [ ] Custom shader guide
- [ ] Performance optimization guide
- [ ] Troubleshooting guide

#### 5.4 Examples

**Example Applications**:
- [ ] Image gallery with effects (migrate shader-gallery)
- [ ] Text with shader effects
- [ ] Video with effects
- [ ] Mixed content (images + text + video)
- [ ] Custom shader example
- [ ] Performance comparison

---

## Migration Strategy

### Shader Gallery Migration

The existing shader-gallery example should be migrated to use the new components:

**BEFORE**:
```svelte
<script>
  import WebGLOverlay from './WebGLOverlay.svelte';
  import GalleryImage from './GalleryImage.svelte';
</script>

<WebGLOverlay shaderEffect={effect}>
  {#each images as img}
    <GalleryImage src={img.src} />
  {/each}
</WebGLOverlay>
```

**AFTER**:
```svelte
<script>
  import { WebGLOverlay, OverlayImage } from '@composable-svelte/graphics/overlay';
</script>

<WebGLOverlay shaderEffect={effect}>
  {#each images as img}
    <OverlayImage src={img.src} />
  {/each}
</WebGLOverlay>
```

**Migration Tasks**:
- [ ] Update shader-gallery to use new overlay components
- [ ] Remove local WebGLOverlay implementation
- [ ] Update imports
- [ ] Verify functionality is identical
- [ ] Update README

---

## API Examples

### Basic Usage

```svelte
<script>
  import { WebGLOverlay, OverlayImage, OverlayText } from '@composable-svelte/graphics/overlay';
</script>

<WebGLOverlay shaderEffect="wave">
  <OverlayImage src="/hero.jpg" alt="Hero image" />
  <OverlayText style="font-size: 64px; color: white;">
    Hero Title
  </OverlayText>
</WebGLOverlay>
```

### Multiple Element Types

```svelte
<WebGLOverlay shaderEffect="chromatic">
  <!-- Images -->
  <OverlayImage src="/photo1.jpg" />
  <OverlayImage src="/photo2.jpg" />

  <!-- Text -->
  <OverlayText tag="h1" style="font-size: 48px;">
    Welcome
  </OverlayText>

  <!-- Video -->
  <OverlayVideo src="/background.mp4" autoplay muted loop />

  <!-- Regular HTML (unaffected) -->
  <div>This content has no shader effect</div>
</WebGLOverlay>
```

### Dynamic Shader Switching

```svelte
<script>
  import { WebGLOverlay, OverlayImage } from '@composable-svelte/graphics/overlay';

  let effect = $state<ShaderEffect>('none');

  function cycleEffect() {
    const effects: ShaderEffect[] = ['none', 'wave', 'pixelate', 'chromatic', 'blur', 'glow'];
    const index = effects.indexOf(effect);
    effect = effects[(index + 1) % effects.length];
  }
</script>

<button onclick={cycleEffect}>Cycle Effect: {effect}</button>

<WebGLOverlay shaderEffect={effect}>
  <OverlayImage src="/demo.jpg" />
</WebGLOverlay>
```

### Reactive Text

```svelte
<script>
  let score = $state(0);

  setInterval(() => score++, 1000);
</script>

<WebGLOverlay shaderEffect="glow">
  <OverlayText reactive={true} style="font-size: 72px;">
    Score: {score}
  </OverlayText>
</WebGLOverlay>
```

### Custom Shader

```svelte
<script>
  import { WebGLOverlay, OverlayImage } from '@composable-svelte/graphics/overlay';

  const customShader = {
    name: 'rainbow',
    fragment: `
      precision highp float;
      varying vec2 vUV;
      uniform sampler2D textureSampler;
      uniform float u_time;

      void main() {
        vec4 color = texture2D(textureSampler, vUV);
        float hue = mod(vUV.x + u_time * 0.1, 1.0);
        vec3 rainbow = vec3(
          sin(hue * 6.28) * 0.5 + 0.5,
          sin((hue + 0.33) * 6.28) * 0.5 + 0.5,
          sin((hue + 0.67) * 6.28) * 0.5 + 0.5
        );
        gl_FragColor = vec4(mix(color.rgb, rainbow, 0.5), color.a);
      }
    `,
    uniforms: {
      u_time: { type: 'float', value: 0 }
    }
  };
</script>

<WebGLOverlay shaderEffect={customShader}>
  <OverlayImage src="/colorful.jpg" />
</WebGLOverlay>
```

### Per-Element Shader Override

```svelte
<WebGLOverlay shaderEffect="none">
  <!-- This image has wave effect -->
  <OverlayImage src="/wavy.jpg" shaderEffect="wave" />

  <!-- This image has pixelate effect -->
  <OverlayImage src="/retro.jpg" shaderEffect="pixelate" />

  <!-- This text has glow effect -->
  <OverlayText shaderEffect="glow">Glowing Text</OverlayText>
</WebGLOverlay>
```

---

## Performance Targets

### Frame Rate
- **60 FPS**: Up to 20 elements with simple shaders (wave, chromatic)
- **60 FPS**: Up to 10 elements with complex shaders (blur, glow)
- **30 FPS**: Up to 50 elements with simple shaders

### Memory
- **< 50MB**: For typical use (10-20 elements)
- **< 200MB**: For heavy use (50+ elements)
- **Texture pooling**: Reuse textures when possible

### Startup
- **< 100ms**: WebGL initialization
- **< 16ms**: First frame render
- **Progressive**: Textures load asynchronously

---

## Bundle Size Impact

### Core Package
- **WebGLOverlay**: ~10KB (gzipped)
- **TextureFactory**: ~5KB (gzipped)
- **UpdateScheduler**: ~3KB (gzipped)
- **Shader presets**: ~2KB per shader (gzipped)

### Wrapper Components
- **OverlayImage**: ~1KB (gzipped)
- **OverlayText**: ~2KB (gzipped)
- **OverlayVideo**: ~1KB (gzipped)

### Optional Dependencies
- **html2canvas**: ~50KB (gzipped) - only if HTML element support needed
- **Lazy-loaded**: Only loaded when `type: 'html'` is used

**Total Impact**: ~25-30KB for core functionality (without html2canvas)

---

## Risks and Mitigations

### Risk 1: Performance on Low-End Devices
**Mitigation**:
- Add WebGL capability detection
- Graceful fallback (show original HTML)
- Adjustable quality settings
- Frame rate adaptive rendering

### Risk 2: Text Rendering Quality
**Mitigation**:
- Use high DPI canvas (devicePixelRatio)
- Anti-aliasing in WebGL context
- Subpixel text rendering
- Font hinting support

### Risk 3: Cross-Browser Compatibility
**Mitigation**:
- Test on Chrome, Firefox, Safari, Edge
- Polyfills for older browsers (if needed)
- Feature detection for WebGL extensions
- Comprehensive browser testing suite

### Risk 4: Memory Leaks
**Mitigation**:
- Strict cleanup in onDestroy
- Texture pooling and reuse
- Memory profiling during development
- Automated leak detection tests

---

## Success Metrics

### Developer Experience
- [ ] < 5 lines of code for basic usage
- [ ] Clear error messages
- [ ] Comprehensive documentation
- [ ] Working examples for all use cases

### Performance
- [ ] 60 FPS with 20 elements
- [ ] < 100ms initialization
- [ ] < 50MB memory for typical use

### Adoption
- [ ] Migrate shader-gallery to use new components
- [ ] Add to styleguide with interactive demo
- [ ] Positive community feedback
- [ ] Usage in real-world projects

---

## Timeline

### Week 1: Foundation & Risk Mitigation (Phase 0)
- Days 1-2: WebGL context management and error handling
- Days 3-4: Texture validation and device capabilities
- Days 5-6: Browser compatibility and performance infrastructure
- Day 7: Testing Phase 0 components

### Week 2: Core Infrastructure (Phase 1)
- Days 1-2: Package structure and WebGLOverlay extraction
- Days 3-4: TextureFactory implementation with CORS and validation
- Days 5-7: UpdateScheduler and context API

### Week 3: Wrapper Components (Phase 2)
- Days 1-2: OverlayImage and OverlayText
- Days 3-4: OverlayVideo with optimized frame updates
- Days 5-7: OverlayCanvas, OverlayElement and polish

### Week 4: Shader Library (Phase 3)
- Days 1-3: Extract and enhance existing shaders
- Days 4-5: Implement new shader effects (blur, glow, noise)
- Days 6-7: Custom shader support and documentation

### Week 5: Performance & Polish (Phase 4)
- Days 1-3: Texture pooling and optimizations
- Days 4-5: Visibility culling and caching
- Days 6-7: Performance monitoring and debugging tools

### Week 6: Testing & Release (Phase 5)
- Days 1-2: Unit tests (Vitest) and Playwright setup
- Days 3-4: WebGL integration tests (Playwright) across browsers
- Days 5-6: Visual regression tests, documentation, and migration guide
- Day 7: Final review, release and announce

**Total: 6 weeks**

**Critical Addition**: Phase 0 (Week 1) was added based on production-readiness review to handle WebGL context loss, CORS, device limits, and browser compatibility before building features.

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Create Phase 16 branch** for development
3. **Setup package structure** in graphics package
4. **Begin Week 1 tasks** (Core Infrastructure)
5. **Regular progress updates** after each phase

---

## Related Documents

- `plans/phase-15/COMPLETION-SUMMARY.md` - Previous phase (package refactoring)
- `examples/shader-gallery/` - Original implementation
- `packages/graphics/` - Target package for overlay components
- `.claude/skills/composable-svelte-graphics/SKILL.md` - Graphics package skill (to be updated)

---

## Future Work

The following enhancements are planned for future phases after the initial 6-week implementation:

### Accessibility Improvements

**Goal**: Make WebGLOverlay accessible to screen readers and keyboard users.

**Features**:
- ARIA labels for canvas content
  ```svelte
  <canvas aria-label="Image gallery with wave distortion effect"></canvas>
  ```
- Alt text generation from registered elements
  ```typescript
  function generateCanvasDescription(registrations: ElementRegistration[]): string {
    return registrations
      .map(r => r.element.getAttribute('aria-label') || r.element.textContent || 'Image')
      .join(', ');
  }
  ```
- Reduced motion support (`prefers-reduced-motion`)
  ```typescript
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Disable shader animations, show static content
    shaderEffect = 'none';
  }
  ```
- High contrast mode detection
  ```typescript
  if (window.matchMedia('(prefers-contrast: high)').matches) {
    // Adjust shader parameters for higher contrast
  }
  ```
- Keyboard navigation for interactive elements
- Focus management (preserve focus when elements hidden)

**Implementation Tasks**:
- [ ] Add ARIA label generation
- [ ] Detect and respect `prefers-reduced-motion`
- [ ] Detect and respect `prefers-contrast`
- [ ] Provide skip-to-content links
- [ ] Document accessibility best practices
- [ ] Test with screen readers (NVDA, JAWS, VoiceOver)

---

### Advanced Use Cases

**Multiple Overlays Per Page**:
```svelte
<!-- Hero section with wave effect -->
<WebGLOverlay shaderEffect="wave" id="hero-overlay">
  <OverlayImage src="/hero.jpg" />
</WebGLOverlay>

<!-- Product gallery with pixelate effect -->
<WebGLOverlay shaderEffect="pixelate" id="gallery-overlay">
  {#each products as product}
    <OverlayImage src={product.image} />
  {/each}
</WebGLOverlay>
```

**Features**:
- Support multiple WebGLOverlay instances on same page
- Each overlay has independent shader and settings
- Shared texture pool across overlays (optional)
- Z-index auto-detection and management

**Z-Index Management**:
```typescript
function detectHighestZIndex(): number {
  const elements = document.querySelectorAll('*');
  let maxZ = 0;
  for (const el of Array.from(elements)) {
    const z = parseInt(getComputedStyle(el).zIndex) || 0;
    if (z > maxZ) maxZ = z;
  }
  return maxZ;
}

// Set overlay z-index to highest + 1000
canvas.style.zIndex = (detectHighestZIndex() + 1000).toString();
```

**Shadow DOM Support**:
```svelte
<custom-gallery>
  #shadow-root
    <WebGLOverlay>
      <OverlayImage src="/image.jpg" />
    </WebGLOverlay>
</custom-gallery>
```

**Server-Side Rendering (SSR)**:
```typescript
// Skip WebGL on server, mount on client
let isBrowser = $state(false);

onMount(() => {
  isBrowser = true;
});

{#if isBrowser}
  <WebGLOverlay shaderEffect="wave">
    <OverlayImage src="/hero.jpg" />
  </WebGLOverlay>
{:else}
  <!-- SSR: Show original HTML -->
  <img src="/hero.jpg" alt="Hero image" />
{/if}
```

**Implementation Tasks**:
- [ ] Support multiple overlay instances
- [ ] Implement z-index auto-detection
- [ ] Test Shadow DOM compatibility
- [ ] Document SSR/hydration strategy
- [ ] Add overlay instance management
- [ ] Support overlay-to-overlay texture sharing (advanced)

---

### Production Deployment Optimizations

**Bundle Size Monitoring**:
```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "size-check": "bundlesize"
  },
  "bundlesize": [
    {
      "path": "./dist/overlay/index.js",
      "maxSize": "35 KB",
      "compression": "gzip"
    },
    {
      "path": "./dist/shaders/presets/*.js",
      "maxSize": "2 KB",
      "compression": "gzip"
    }
  ]
}
```

**Tree-Shaking Verification**:
```bash
# Verify unused exports are removed
pnpm build --analyze
# Check bundle for unused code
```

**Performance Budgets in CI**:
```yaml
# .github/workflows/performance.yml
- name: Check bundle size
  run: pnpm bundlesize

- name: Lighthouse CI
  run: |
    npm install -g @lhci/cli
    lhci autorun
  env:
    LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_TOKEN }}
```

**CDN Optimization**:
```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        // Hash filenames for long-term caching
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
};
```

**Implementation Tasks**:
- [ ] Add bundlesize to CI pipeline
- [ ] Set up Lighthouse CI
- [ ] Configure bundle analyzer
- [ ] Add performance regression detection
- [ ] Document CDN deployment strategy
- [ ] Generate source maps (separate files)
- [ ] Optimize chunk splitting

---

### Error Recovery Enhancements

**Circuit Breaker Pattern**:
```typescript
export class CircuitBreaker {
  private failureCount = 0;
  private failureThreshold = 5;
  private resetTimeout = 60000; // 1 minute
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      setTimeout(() => {
        this.state = 'half-open';
        this.failureCount = 0;
      }, this.resetTimeout);
    }
  }
}
```

**Retry with Exponential Backoff**:
```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}
```

**Shader Compilation Timeout**:
```typescript
async function compileShaderWithTimeout(
  gl: WebGLRenderingContext,
  source: string,
  type: number,
  timeout = 5000
): Promise<WebGLShader> {
  return Promise.race([
    compileShader(gl, source, type),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Shader compilation timeout')), timeout)
    )
  ]);
}
```

**Implementation Tasks**:
- [ ] Implement circuit breaker for texture creation
- [ ] Add exponential backoff retry logic
- [ ] Add shader compilation timeout
- [ ] Detect and handle OOM errors
- [ ] Add graceful degradation on repeated failures
- [ ] Document error recovery patterns

---

### Production Monitoring

**Performance Marks & Measures**:
```typescript
export class PerformanceMonitoring {
  mark(name: string): void {
    performance.mark(`overlay-${name}`);
  }

  measure(name: string, startMark: string, endMark: string): void {
    performance.measure(
      `overlay-${name}`,
      `overlay-${startMark}`,
      `overlay-${endMark}`
    );
  }

  getMetrics(): PerformanceMeasure[] {
    return performance.getEntriesByType('measure') as PerformanceMeasure[];
  }

  reportToAnalytics(): void {
    const metrics = this.getMetrics();

    // Send to Google Analytics, DataDog, etc.
    for (const metric of metrics) {
      gtag('event', 'timing_complete', {
        name: metric.name,
        value: Math.round(metric.duration),
        event_category: 'WebGLOverlay'
      });
    }
  }
}

// Usage:
monitoring.mark('texture-creation-start');
await createTexture(element);
monitoring.mark('texture-creation-end');
monitoring.measure('texture-creation', 'texture-creation-start', 'texture-creation-end');
```

**Sentry Integration**:
```typescript
import * as Sentry from '@sentry/browser';

// Capture overlay-specific errors
try {
  await createTexture(element);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'WebGLOverlay',
      operation: 'texture-creation'
    },
    contexts: {
      webgl: {
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
      }
    }
  });
  throw error;
}
```

**Real User Monitoring (RUM)**:
```typescript
// Track overlay initialization time
const startTime = performance.now();
await initializeOverlay();
const duration = performance.now() - startTime;

// Send to analytics
sendToAnalytics({
  metric: 'overlay_init_time',
  value: duration,
  device: isMobile ? 'mobile' : 'desktop',
  browser: getBrowserName()
});
```

**Implementation Tasks**:
- [ ] Add performance marks throughout codebase
- [ ] Integrate with Sentry for error tracking
- [ ] Add Google Analytics custom metrics
- [ ] Add DataDog RUM integration examples
- [ ] Track Core Web Vitals impact
- [ ] Create monitoring dashboard examples
- [ ] Document analytics integration patterns

---

## Future Work Summary

| Category | Priority | Estimated Effort |
|----------|----------|------------------|
| Accessibility | High | 1-2 weeks |
| Advanced Use Cases | Medium | 2-3 weeks |
| Production Deployment | Medium | 1 week |
| Error Recovery | Medium | 1 week |
| Production Monitoring | Low | 1 week |

**Total Estimated Effort**: 6-10 weeks (Phase 17+)

These enhancements will be planned and implemented in future phases based on user feedback and adoption metrics from the initial release.

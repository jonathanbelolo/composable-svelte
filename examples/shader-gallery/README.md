# DOM/WebGL Hybrid Image Gallery

A demonstration of mixing DOM and WebGL rendering where images remain in the HTML for layout, SEO, and accessibility, but are enhanced with WebGL shaders.

## Concept

This example showcases a hybrid rendering approach:

1. **DOM for Structure**: Images are regular `<img>` tags that:
   - Handle page layout naturally with CSS
   - Remain accessible to screen readers
   - Are indexed by search engines
   - Degrade gracefully without JavaScript

2. **WebGL for Enhancement**: A WebGL canvas overlays each image to:
   - Apply real-time shader effects
   - Render with GPU acceleration
   - Provide visual enhancements
   - Maintain smooth animations

3. **Zero-Opacity Trick**: When WebGL loads successfully:
   - DOM image gets `opacity: 0` (NOT `display: none`)
   - Image still affects layout and page flow
   - No content reflow or layout shifts
   - WebGL canvas renders the visible result

## Features

- **Multiple Shader Effects**:
  - Wave distortion (animated sine waves)
  - Pixelation
  - Chromatic aberration (RGB channel separation)

- **Graceful Degradation**:
  - Falls back to DOM images if WebGL fails
  - No runtime errors if shaders fail to compile
  - Images load normally without JavaScript

- **Performance**:
  - GPU-accelerated rendering
  - Efficient texture reuse
  - RequestAnimationFrame for smooth updates

## Running the Example

```bash
cd examples/shader-gallery
pnpm install
pnpm dev
```

Visit `http://localhost:5175`

## Technical Details

### ShaderImage Component

The core component that implements the hybrid rendering:

- Renders a standard `<img>` tag
- Creates a WebGL canvas positioned absolutely over it
- Loads image as WebGL texture
- Applies fragment shaders to the texture
- Sets DOM image to `opacity: 0` when WebGL is ready

### Shader Programs

Three fragment shaders demonstrate different effects:

1. **Wave**: Sine wave distortion on X-axis
2. **Pixelate**: Mosaic effect with configurable pixel size
3. **Chromatic**: RGB channel offset for glitch effect

## Use Cases

This pattern is useful for:

- Image galleries with visual effects
- Product showcases with hover effects
- Interactive photo displays
- Art portfolios with shader enhancements
- Any scenario where you need both SEO/accessibility AND visual effects

## Limitations

- Requires WebGL support (falls back gracefully)
- CORS restrictions apply to cross-origin images
- Additional memory overhead for WebGL textures
- Not suitable for very large numbers of images (texture limits)

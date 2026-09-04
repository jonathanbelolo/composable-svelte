# DOM/WebGL Hybrid Image Gallery

A demonstration of mixing DOM and WebGL rendering where images remain in the HTML for layout, SEO, and accessibility, but are enhanced with WebGL shaders.

## Concept

This example showcases a hybrid rendering approach:

1. **DOM for Structure**: Images are regular `<img>` tags that:
   - Handle page layout naturally with CSS
   - Remain accessible to screen readers
   - Are indexed by search engines
   - Degrade gracefully without JavaScript

2. **WebGL for Enhancement**: One full-viewport canvas — not one per image —
   draws over them to:
   - Apply real-time shader effects
   - Render with GPU acceleration
   - Provide visual enhancements
   - Maintain smooth animations

3. **Fading the DOM image out**: once its texture exists, the `<img>` is faded
   to transparent — never `display: none`:
   - Image still affects layout and page flow
   - No content reflow or layout shifts
   - The overlay renders the visible result in its place

   The fade is `animateFadeOut` from `@composable-svelte/core/animation` rather
   than a CSS transition, because it is a state-driven lifecycle and because
   that helper honours `prefers-reduced-motion` by writing the end state — which
   a `transition` on a class toggle cannot.

## Features

- **Multiple Shader Effects**:
  - Wave distortion and pixelation, from `@composable-svelte/graphics`'s preset
    library (21 presets: `ripple-*`, `wave-*`, `pixelate-*`, `blur-*`,
    `glitch-*`, `zoom-*`)
  - Chromatic aberration, a custom effect defined in `src/lib/custom-shaders.ts`

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

This example was rewritten onto `<WebGLOverlay>` from
`@composable-svelte/graphics`, and this section described the architecture it
had before that — a `ShaderImage` component creating its own canvas and texture
per image. None of that is here any more.

### One overlay, not one canvas per image

`ShaderGallery.svelte` mounts a single `<WebGLOverlay bind:this={…} />`. That is
one `position: fixed`, full-viewport, `pointer-events: none` canvas for the
whole page, and it owns every texture, program and frame.

### `ShaderImage2.svelte`

Renders a plain `<img>` and registers it with the overlay through Svelte
context — `registerImageElement(id, element, src, shader, onTextureLoaded?)` —
then unregisters on destroy. It creates no canvas and no texture of its own; the
overlay draws over the element where it sits, and tracks its position as the
page scrolls.

That last parameter is what the fade above depends on: the `<img>` is faded out
when the texture exists, and `onTextureLoaded` is how the overlay says so. It
fires whether the texture was created immediately or deferred because the
context was lost at registration time.

The DOM image stays in the document, which is what keeps the gallery accessible
and indexable, and what makes WebGL failure a graceful degradation rather than a
blank page: if the overlay cannot initialise, the plain images are still there.

### Where the shaders come from

`wave-*` and `pixelate-*` are presets shipped by the package and addressed by
name. The chromatic-aberration family is defined locally in
`src/lib/custom-shaders.ts` as a `CustomShaderEffect` — fragment source plus
uniforms — which is the escape hatch for anything the presets do not cover.

## Use Cases

This pattern is useful for:

- Image galleries with visual effects
- Product showcases with hover effects
- Interactive photo displays
- Art portfolios with shader enhancements
- Any scenario where you need both SEO/accessibility AND visual effects

## Limitations

- Requires WebGL support (falls back gracefully — the DOM images remain)
- CORS restrictions apply to cross-origin images
- Additional memory overhead for WebGL textures. The overlay tracks this against
  a `memoryBudget` and refuses registrations that would exceed it
- Not suitable for very large numbers of images (texture limits)

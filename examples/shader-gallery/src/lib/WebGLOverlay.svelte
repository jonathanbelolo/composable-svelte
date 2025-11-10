<script lang="ts">
import { onMount, setContext } from 'svelte';
import type { Snippet } from 'svelte';

// Type for image registration
export type ImageRegistration = {
  id: string;
  imgElement: HTMLImageElement;
  texture: WebGLTexture | null;
  bounds: DOMRect;
};

let {
  shaderEffect = 'none',
  children
}: {
  shaderEffect?: 'none' | 'wave' | 'pixelate' | 'chromatic';
  children?: Snippet;
} = $props();

let canvasRef: HTMLCanvasElement | null = $state(null);
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let animationFrameId: number | null = null;
let startTime = 0;

// Store all registered images
const images = new Map<string, ImageRegistration>();

// Setup overlay API and expose via context IMMEDIATELY
// (before children mount, so they can access it)
const overlayAPI = {
  registerImage: (id: string, img: HTMLImageElement) => {
    if (!gl) {
      // Queue registration for when WebGL is ready
      setTimeout(() => overlayAPI.registerImage(id, img), 100);
      return;
    }

    // Create texture for this image
    const texture = gl.createTexture();
    if (!texture) return;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const bounds = img.getBoundingClientRect();
    images.set(id, { id, imgElement: img, texture, bounds });

    // Make the DOM image transparent
    img.style.opacity = '0';
  },

  unregisterImage: (id: string) => {
    const registration = images.get(id);
    if (registration) {
      if (gl && registration.texture) {
        gl.deleteTexture(registration.texture);
      }
      registration.imgElement.style.opacity = '1';
      images.delete(id);
    }
  },

  updateImageBounds: (id: string, bounds: DOMRect) => {
    const registration = images.get(id);
    if (registration) {
      registration.bounds = bounds;
    }
  }
};

// Set context so child components can access it
setContext('webgl-overlay', overlayAPI);

onMount(() => {
  if (!canvasRef) return;

  // Initialize WebGL
  gl = canvasRef.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) {
    console.error('WebGL not supported');
    return;
  }

  // Enable blending for transparency
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Create shader program
  createShaderProgram(shaderEffect);

  // Handle resize
  const handleResize = () => {
    if (!canvasRef) return;

    canvasRef.width = window.innerWidth * window.devicePixelRatio;
    canvasRef.height = window.innerHeight * window.devicePixelRatio;

    // Update all image bounds
    images.forEach((reg) => {
      reg.bounds = reg.imgElement.getBoundingClientRect();
    });
  };

  handleResize();
  window.addEventListener('resize', handleResize);

  // Start render loop
  startTime = performance.now();
  render();

  return () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
    window.removeEventListener('resize', handleResize);

    // Clean up textures
    if (gl) {
      images.forEach((reg) => {
        if (reg.texture) {
          gl!.deleteTexture(reg.texture);
        }
        reg.imgElement.style.opacity = '1';
      });
    }

    if (gl && program) {
      gl.deleteProgram(program);
    }
  };
});

// Update shader when effect changes
$effect(() => {
  if (gl && shaderEffect) {
    createShaderProgram(shaderEffect);
  }
});

function createShaderProgram(effectType: string): boolean {
  if (!gl) return false;

  // Delete old program
  if (program) {
    gl.deleteProgram(program);
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, getFragmentShader(effectType));

  if (!vertexShader || !fragmentShader) return false;

  program = gl.createProgram();
  if (!program) return false;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Failed to link program:', gl.getProgramInfoLog(program));
    return false;
  }

  gl.useProgram(program);
  return true;
}

function compileShader(type: number, source: string): WebGLShader | null {
  if (!gl) return null;

  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function render() {
  if (!gl || !program || !canvasRef) return;

  // Clear canvas
  gl.viewport(0, 0, canvasRef.width, canvasRef.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const time = (performance.now() - startTime) / 1000;

  // Render each image at its DOM position
  images.forEach((reg) => {
    if (!gl || !program || !reg.texture) return;

    // Update bounds every frame for smooth scrolling
    reg.bounds = reg.imgElement.getBoundingClientRect();

    // Skip if image is offscreen
    if (reg.bounds.bottom < 0 || reg.bounds.top > window.innerHeight) return;
    if (reg.bounds.right < 0 || reg.bounds.left > window.innerWidth) return;

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, reg.texture);

    // Set uniforms
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    gl.uniform1f(timeLocation, time);

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    gl.uniform2f(resolutionLocation, canvasRef!.width, canvasRef!.height);

    const textureLocation = gl.getUniformLocation(program, 'u_texture');
    gl.uniform1i(textureLocation, 0);

    // Calculate normalized device coordinates
    const dpr = window.devicePixelRatio;
    const x = reg.bounds.left * dpr;
    const y = reg.bounds.top * dpr;
    const w = reg.bounds.width * dpr;
    const h = reg.bounds.height * dpr;

    // Convert to NDC (-1 to 1)
    const x1 = (x / canvasRef!.width) * 2 - 1;
    const y1 = 1 - (y / canvasRef!.height) * 2;
    const x2 = ((x + w) / canvasRef!.width) * 2 - 1;
    const y2 = 1 - ((y + h) / canvasRef!.height) * 2;

    // Create position buffer for this quad
    const positions = new Float32Array([
      x1, y1,
      x2, y1,
      x1, y2,
      x2, y2
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinates
    const texCoords = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1
    ]);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Draw this image
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Clean up buffers
    gl.deleteBuffer(positionBuffer);
    gl.deleteBuffer(texCoordBuffer);
  });

  // Continue animation loop
  animationFrameId = requestAnimationFrame(render);
}

function getFragmentShader(effectType: string): string {
  switch (effectType) {
    case 'wave':
      return WAVE_FRAGMENT_SHADER;
    case 'pixelate':
      return PIXELATE_FRAGMENT_SHADER;
    case 'chromatic':
      return CHROMATIC_FRAGMENT_SHADER;
    default:
      return BASIC_FRAGMENT_SHADER;
  }
}

// Vertex Shader
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Basic Fragment Shader (no effect)
const BASIC_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_texCoord;

  void main() {
    gl_FragColor = texture2D(u_texture, v_texCoord);
  }
`;

// Wave Distortion Shader
const WAVE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float u_time;
  varying vec2 v_texCoord;

  void main() {
    vec2 uv = v_texCoord;
    float wave = sin(uv.y * 10.0 + u_time * 2.0) * 0.02;
    uv.x += wave;
    gl_FragColor = texture2D(u_texture, uv);
  }
`;

// Pixelate Shader
const PIXELATE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  varying vec2 v_texCoord;

  void main() {
    vec2 uv = v_texCoord;
    float pixelSize = 0.05;
    vec2 pixelated = floor(uv / pixelSize) * pixelSize;
    gl_FragColor = texture2D(u_texture, pixelated);
  }
`;

// Chromatic Aberration Shader
const CHROMATIC_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float u_time;
  varying vec2 v_texCoord;

  void main() {
    vec2 uv = v_texCoord;
    float offset = 0.003 + sin(u_time) * 0.002;
    float r = texture2D(u_texture, uv + vec2(offset, 0.0)).r;
    float g = texture2D(u_texture, uv).g;
    float b = texture2D(u_texture, uv - vec2(offset, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
  }
`;
</script>

<style>
  canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
  }
</style>

<!-- Render children (gallery content) -->
{@render children?.()}

<!-- WebGL canvas overlay -->
<canvas bind:this={canvasRef}></canvas>

/**
 * The WebGPU backend is explicit and never silently falls back: without WebGPU, `initialize` rejects with a
 * clear error (the `<Scene>` then reports `rendererError`), and no engine is left behind. The default adapter
 * is untouched: it still builds Babylon's WebGL `Engine` path and never loads the WebGPU engine.
 */
import { describe, expect, it } from 'vitest';
import { BabylonAdapter } from '../src/adapters/babylon-adapter.js';

describe('BabylonAdapter WebGPU backend without WebGPU', () => {
  it('rejects explicitly instead of relabelling or falling back to WebGL', async () => {
    expect((globalThis.navigator as Navigator & { gpu?: unknown }).gpu).toBeUndefined();
    const adapter = new BabylonAdapter({ renderer: 'webgpu' });
    await expect(adapter.initialize(document.createElement('canvas'))).rejects.toThrow('WebGPU is not available');
    expect(adapter.renderAuthority()).toBeNull();
    adapter.dispose();
  });
});

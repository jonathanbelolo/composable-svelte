/**
 * Partial WebGPU initialisation failure (review finding 15:46Z): when `GPUAdapter.requestDevice` rejects, the
 * adapter reports the ORIGINAL failure and leaves no engine behind in Babylon's `EngineStore`. Positive control:
 * a normal WebGPU initialisation on the same real adapter succeeds and its disposal also leaves the store as found.
 */
import { expect, it } from 'vitest';
import { EngineStore } from '@babylonjs/core/Engines/engineStore.js';
import { BabylonAdapter } from '../../src/adapters/babylon-adapter.js';

it('requestDevice rejection: original reason preserved, no orphaned engine, no render authority', async () => {
  const original = GPUAdapter.prototype.requestDevice;
  const before = EngineStore.Instances.length;
  GPUAdapter.prototype.requestDevice = async function () { throw new Error('device-allocation-denied'); };
  const adapter = new BabylonAdapter({ renderer: 'webgpu' });
  let message = '';
  try { await adapter.initialize(document.createElement('canvas')); } catch (error) { message = String(error); }
  finally { GPUAdapter.prototype.requestDevice = original; }
  const result = { message, orphaned: EngineStore.Instances.length - before, authority: adapter.renderAuthority() !== null };
  adapter.dispose();
  console.info('WEBGPU init failure', JSON.stringify(result));
  expect(result).toEqual({ message: 'Error: WebGPU initialisation failed: device-allocation-denied', orphaned: 0, authority: false });
  expect(EngineStore.Instances.length).toBe(before);
});

it('positive control: a real WebGPU initialisation succeeds and disposal restores the store', async () => {
  const before = EngineStore.Instances.length;
  const adapter = new BabylonAdapter({ renderer: 'webgpu' });
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  document.body.append(canvas);
  const result = await adapter.initialize(canvas);
  const during = EngineStore.Instances.length - before;
  adapter.dispose();
  canvas.remove();
  console.info('WEBGPU init control', JSON.stringify({ renderer: result.renderer, during, after: EngineStore.Instances.length - before }));
  expect(result.renderer).toBe('webgpu');
  expect(during).toBe(1);
  expect(EngineStore.Instances.length).toBe(before);
});

it('adapter unavailable (requestAdapter resolves null): explicit error, no engine', async () => {
  const original = GPU.prototype.requestAdapter;
  const before = EngineStore.Instances.length;
  GPU.prototype.requestAdapter = (async function () { return null; }) as never;
  const adapter = new BabylonAdapter({ renderer: 'webgpu' });
  let message = '';
  try { await adapter.initialize(document.createElement('canvas')); } catch (error) { message = String(error); }
  finally { GPU.prototype.requestAdapter = original; }
  const result = { message, orphaned: EngineStore.Instances.length - before, authority: adapter.renderAuthority() !== null };
  adapter.dispose();
  console.info('WEBGPU adapter null', JSON.stringify(result));
  expect(result.message).toMatch(/^Error: WebGPU (is not available|initialisation failed)/);
  expect(result).toMatchObject({ orphaned: 0, authority: false });
});

it('failure AFTER a device was allocated: original reason preserved, the allocated device is destroyed, no engine left', async () => {
  const requestDevice = GPUAdapter.prototype.requestDevice;
  const configure = GPUCanvasContext.prototype.configure;
  const before = EngineStore.Instances.length;
  let allocated: GPUDevice | undefined, allocatedLost = false;
  GPUAdapter.prototype.requestDevice = async function (descriptor) { allocated = await requestDevice.call(this, descriptor); allocated.lost.then(() => { allocatedLost = true; }); return allocated; };
  GPUCanvasContext.prototype.configure = function () { throw new Error('context-configuration-denied'); };
  const adapter = new BabylonAdapter({ renderer: 'webgpu' });
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64; document.body.append(canvas);
  let message = '';
  try { await adapter.initialize(canvas); } catch (error) { message = String(error); }
  finally { GPUAdapter.prototype.requestDevice = requestDevice; GPUCanvasContext.prototype.configure = configure; }
  for (let i = 0; i < 50 && !allocatedLost; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const result = { message, deviceAllocated: !!allocated, deviceReleased: allocatedLost, orphaned: EngineStore.Instances.length - before, authority: adapter.renderAuthority() !== null };
  adapter.dispose(); canvas.remove();
  if (!allocatedLost) allocated?.destroy();
  console.info('WEBGPU post-allocation failure', JSON.stringify(result));
  expect(result).toEqual({ message: 'Error: WebGPU initialisation failed: context-configuration-denied', deviceAllocated: true, deviceReleased: true, orphaned: 0, authority: false });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../src/lib/voice-input/types.js';
import type { VoiceInputAction, VoiceInputState, VoiceInputDependencies } from '../src/lib/voice-input/types.js';
import { AudioManager } from '../src/lib/voice-input/audio/audio-manager.js';
import { getAudioManager } from '../src/lib/voice-input/audio/audio-manager-registry.js';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
class FakeDevice {
  permission = deferred<void>();
  streamLive = false;
  recording = false;
  started = 0;
  cleanups = 0;
  async requestMicrophone(): Promise<MediaStream> {
    await this.permission.promise;
    this.streamLive = true;
    return {} as MediaStream;
  }
  startRecording() { if (!this.streamLive) throw new Error('No live microphone'); this.recording = true; this.started++; }
  async stopRecording() { this.recording = false; return new Blob(); }
  startAudioLevelMonitoring(_cb: (level: number) => void) { return 1; }
  stopInterval(_id: number) {}
  detectVoiceActivity() { return false; }
  cleanup() { this.cleanups++; this.streamLive = false; this.recording = false; }
}
function setup(options: { synchronousFailure?: boolean } = {}) {
  const managers = new Map<string, FakeDevice>();
  const created: FakeDevice[] = [];
  const dependencies: VoiceInputDependencies = {
    transcribeAudio: async () => 'transcript',
    createAudioManager: id => { const manager = new FakeDevice(); if (options.synchronousFailure) manager.requestMicrophone = () => { throw new Error('synchronous device failure'); }; managers.set(id, manager); created.push(manager); return manager as unknown as AudioManager; },
    getAudioManager: id => managers.get(id) as unknown as AudioManager | undefined,
    deleteAudioManager: id => { managers.get(id)?.cleanup(); managers.delete(id); }
  };
  const store = createStore<VoiceInputState, VoiceInputAction, VoiceInputDependencies>({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies, ssr: { deferEffects: false } });
  cleanups.push(() => store.destroy());
  return { store, managers, created };
}
describe('microphone acquisition owns device lifetime', () => {
  it('factory/getter mismatch terminates after one acquisition instead of requesting repeatedly', async () => {
    let created = 0;
    const devices: FakeDevice[] = [];
    const dependencies: VoiceInputDependencies = {
      transcribeAudio: async () => 'transcript',
      getAudioManager: () => undefined,
      createAudioManager: () => {
        created++;
        // Bound the baseline loop so a regression cannot starve the test runner.
        if (created > 3) throw new Error('bounded mismatch probe');
        const device = new FakeDevice(); device.permission.resolve(); devices.push(device);
        return device as unknown as AudioManager;
      }
    };
    const store = createStore({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: 'startPushToTalkRecording' });
    await tick();
    expect(created).toBe(1);
    expect(store.state.status).toBe('error');
    expect(store.state.errorMessage).toBe('Audio manager not initialized');
    expect(store.state._audioManagerId).toBeNull();
    expect(devices[0]!.cleanups).toBe(1);
  });
  for (const modeAction of ['startPushToTalkRecording', 'activateConversationMode'] as const) {
  it(`${modeAction}: legacy id-agnostic device with granted permission and null ID starts without reacquisition`, () => {
    const device = new FakeDevice(); device.streamLive = true;
    const create = vi.fn();
    const dependencies: VoiceInputDependencies = { transcribeAudio: async () => '', getAudioManager: () => device as unknown as AudioManager, createAudioManager: create };
    const store = createStore({ initialState: { ...createInitialVoiceInputState(), permission: 'granted' as const }, reducer: voiceInputReducer, dependencies, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: modeAction });
    expect(create).not.toHaveBeenCalled(); expect(device.started).toBe(1);
  });
  }
  it('bare legacy denial retains an application-owned device', () => {
    const device = new FakeDevice(); device.streamLive = true;
    const dependencies: VoiceInputDependencies = { transcribeAudio: async () => '', getAudioManager: () => device as unknown as AudioManager };
    const store = createStore({ initialState: { ...createInitialVoiceInputState(), permission: 'granted' as const, status: 'ready' as const, _audioManagerId: 'app-device' }, reducer: voiceInputReducer, dependencies, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: 'microphonePermissionDenied', error: 'legacy report' });
    expect(store.state.status).toBe('error'); expect(store.state._audioManagerId).toBe('app-device'); expect(device.cleanups).toBe(0);
  });
  it('retired acquisition that partially acquires then rejects still releases late resources', async () => {
    const { store, created } = setup();
    store.dispatch({ type: 'requestMicrophonePermission' });
    const device = created[0]!;
    store.destroy(); expect(device.cleanups).toBe(1);
    // Simulate getUserMedia succeeding after retirement, followed by AudioContext
    // initialization failing: rejection does not mean no resources were acquired.
    device.streamLive = true;
    device.permission.reject(new Error('analysis initialization failed'));
    await tick(); expect(device.cleanups).toBe(2); expect(device.streamLive).toBe(false);
  });
  it('synchronous acquisition failure releases the device before subscription setup returns', async () => {
    const { store, managers, created } = setup({ synchronousFailure: true });
    store.dispatch({ type: 'startPushToTalkRecording' });
    await tick();
    expect(store.state.status).toBe('error'); expect(managers.size).toBe(0); expect(created[0]!.cleanups).toBe(1);
    store.destroy(); expect(created[0]!.cleanups).toBe(1);
  });
  for (const type of ['activateConversationMode', 'startPushToTalkRecording'] as const) {
    it(`${type}: deactivation releases registry and reactivation reacquires despite retained permission`, async () => {
      const { store, managers, created } = setup();
      store.dispatch({ type }); created[0]!.permission.resolve(); await tick();
      expect(store.state.status).toBe('recording');
      store.dispatch({ type: 'deactivateVoiceInput' });
      expect(store.state.permission).toBe('granted'); expect(store.state._audioManagerId).toBeNull();
      expect(managers.size).toBe(0); expect(created[0]!.streamLive).toBe(false); expect(created[0]!.cleanups).toBe(1);
      store.dispatch({ type });
      expect(created).toHaveLength(2); expect(store.state.status).toBe('requesting-permission');
      created[1]!.permission.resolve(); await tick();
      expect(store.state.status).toBe('recording'); expect(created[1]!.started).toBe(1);
      store.destroy(); expect(managers.size).toBe(0); expect(created[1]!.cleanups).toBe(1);
    });
  }
  it('denial releases failed manager, and retry clears the error', async () => {
    const { store, managers, created } = setup();
    store.dispatch({ type: 'startPushToTalkRecording' }); created[0]!.permission.reject(new Error('denied')); await tick();
    expect(store.state.status).toBe('error'); expect(store.state._audioManagerId).toBeNull(); expect(managers.size).toBe(0);
    store.dispatch({ type: 'startPushToTalkRecording' }); expect(store.state.errorMessage).toBeNull();
    created[1]!.permission.resolve(); await tick(); expect(store.state.status).toBe('recording');
  });
  for (const termination of ['deactivate', 'destroy'] as const) {
    for (const result of ['grant', 'deny'] as const) {
      it(`${termination} while permission is pending safely disposes late ${result}`, async () => {
        const { store, managers, created } = setup();
        store.dispatch({ type: 'activateConversationMode' });
        if (termination === 'destroy') store.destroy(); else store.dispatch({ type: 'deactivateVoiceInput' });
        const state = store.state;
        if (result === 'grant') created[0]!.permission.resolve(); else created[0]!.permission.reject(new Error('old denial'));
        await tick();
        expect(store.state).toBe(state); expect(managers.size).toBe(0); expect(created[0]!.streamLive).toBe(false); expect(created[0]!.started).toBe(0); expect(created[0]!.cleanups).toBe(2);
      });
    }
  }
  for (const result of ['grant', 'deny'] as const) {
    it(`superseded request's late ${result} cannot alter the current device`, async () => {
      const { store, managers, created } = setup();
      store.dispatch({ type: 'startPushToTalkRecording' }); const oldId = store.state._audioManagerId!;
      store.dispatch({ type: 'requestMicrophonePermission' }); const newId = store.state._audioManagerId!;
      created[1]!.permission.resolve(); await tick();
      if (result === 'grant') created[0]!.permission.resolve(); else created[0]!.permission.reject(new Error('old failure'));
      await tick();
      expect(store.state.status).toBe('recording'); expect(store.state._audioManagerId).toBe(newId);
      expect(created[0]!.streamLive).toBe(false); expect(created[1]!.streamLive).toBe(true); expect(managers.has(oldId)).toBe(false);
      store.dispatch({ type: 'microphonePermissionDenied', managerId: oldId, error: 'stale external callback' });
      store.dispatch({ type: 'microphonePermissionGranted', managerId: oldId });
      await tick(); expect(store.state._audioManagerId).toBe(newId); expect(store.state.status).toBe('recording');
    });
  }
  it('pending activation is coalesced while latest requested mode is honored', async () => {
    const { store, created } = setup();
    store.dispatch({ type: 'activateConversationMode' });
    store.dispatch({ type: 'activateConversationMode' });
    store.dispatch({ type: 'startPushToTalkRecording' });
    expect(created).toHaveLength(1);
    created[0]!.permission.resolve(); await tick();
    expect(store.state.mode).toBe('push-to-talk'); expect(store.state.status).toBe('recording'); expect(created[0]!.started).toBe(1);
    store.dispatch({ type: 'microphonePermissionGranted', managerId: store.state._audioManagerId! });
    await tick(); expect(created[0]!.started).toBe(1);
  });
  it('built-in registry ownership takes precedence over an injected foreign deleter', async () => {
    vi.spyOn(AudioManager.prototype, 'requestMicrophone').mockResolvedValue({} as MediaStream);
    const cleanup = vi.spyOn(AudioManager.prototype, 'cleanup');
    const foreignDelete = vi.fn();
    const store = createStore({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies: { transcribeAudio: async () => '', getAudioManager, deleteAudioManager: foreignDelete }, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: 'requestMicrophonePermission' }); await tick();
    const id = store.state._audioManagerId!;
    store.dispatch({ type: 'deactivateVoiceInput' });
    expect(getAudioManager(id)).toBeUndefined(); expect(cleanup).toHaveBeenCalledTimes(1); expect(foreignDelete).not.toHaveBeenCalled();
  });
  it('custom registry without deletion hook releases its captured device', async () => {
    const device = new FakeDevice(); device.permission.resolve();
    const managers = new Map<string, FakeDevice>();
    const dependencies: VoiceInputDependencies = { transcribeAudio: async () => '', getAudioManager: id => managers.get(id) as unknown as AudioManager, createAudioManager: id => { managers.set(id, device); return device as unknown as AudioManager; } };
    const store = createStore({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: 'requestMicrophonePermission' }); await tick();
    store.dispatch({ type: 'deactivateVoiceInput' });
    expect(device.cleanups).toBe(1); expect(device.streamLive).toBe(false);
    // Without a deletion hook the framework cannot mutate the caller's map.
    expect(managers.size).toBe(1);
  });
  it('explicit reacquisition clears retired recording state', async () => {
    const { store, created } = setup();
    store.dispatch({ type: 'activateConversationMode' }); created[0]!.permission.resolve(); await tick();
    expect(store.state.recordingStartTime).not.toBeNull();
    store.dispatch({ type: 'requestMicrophonePermission' });
    expect(store.state.status).toBe('requesting-permission'); expect(store.state.recordingStartTime).toBeNull();
    expect(store.state.vadState).toBeNull(); expect(store.state.audioLevel).toBe(0); expect(created[0]!.recording).toBe(false);
  });
  it('default registry entry is deleted and cleaned exactly once after settled acquisition', async () => {
    vi.spyOn(AudioManager.prototype, 'requestMicrophone').mockResolvedValue({} as MediaStream);
    const cleanup = vi.spyOn(AudioManager.prototype, 'cleanup');
    const store = createStore({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies: { transcribeAudio: async () => '', getAudioManager }, ssr: { deferEffects: false } });
    cleanups.push(() => store.destroy());
    store.dispatch({ type: 'requestMicrophonePermission' }); await tick();
    const id = store.state._audioManagerId!; expect(getAudioManager(id)).toBeDefined();
    store.dispatch({ type: 'deactivateVoiceInput' }); expect(getAudioManager(id)).toBeUndefined();
    store.destroy(); expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

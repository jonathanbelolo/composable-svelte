import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { VoiceInputAudioManager, VoiceInputDependencies } from '@composable-svelte/media';
import ManagedPlayer from './ManagedPlayer.svelte';
import ManagedVoice from './ManagedVoice.svelte';

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = ''; paused = true; currentTime = 0; volume = 1; playbackRate = 1;
  buffered = { length: 0, end: () => 0 };
  constructor() { super(); FakeAudio.instances.push(this); }
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('managed player plays and retires its audio element', async () => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  const target = document.createElement('div'); document.body.append(target);
  const app = mount(ManagedPlayer, { target });
  try {
    flushSync();
    const button = (text: string) => [...target.querySelectorAll('button')].find(b => b.textContent === text || b.ariaLabel === text) as HTMLButtonElement;
    button('Listen').click(); flushSync();
    const audio = FakeAudio.instances[0]!;
    expect(audio.src).toBe('/audio/episode1.mp3');
    button('Play').click(); flushSync(); await Promise.resolve();
    expect(audio.paused).toBe(false);
    button('Close player').click(); flushSync();
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe('');
  } finally { await unmount(app); target.remove(); }
});

it('managed voice sends a transcript to parent state and releases the device on close', async () => {
  let recording = false; let cleanups = 0;
  const device = {
    requestMicrophone: async () => ({} as MediaStream),
    startRecording: () => { recording = true; },
    stopRecording: async () => { recording = false; return new Blob(['voice']); },
    startAudioLevelMonitoring: () => 1,
    stopInterval: () => {},
    detectVoiceActivity: () => false,
    cleanup: () => { recording = false; cleanups++; }
  };
  const dependencies: VoiceInputDependencies = {
    transcribeAudio: async () => 'installed transcript',
    createAudioManager: () => device as unknown as VoiceInputAudioManager,
    getAudioManager: () => device as unknown as VoiceInputAudioManager,
    deleteAudioManager: () => device.cleanup()
  };
  const target = document.createElement('div'); document.body.append(target);
  const app = mount(ManagedVoice, { target, props: { dependencies } });
  const settle = () => new Promise<void>(r => setTimeout(r, 0));
  try {
    flushSync();
    const button = (text: string) => [...target.querySelectorAll('button')].find(b => b.textContent === text) as HTMLButtonElement;
    button('Dictate').click(); flushSync();
    const mic = target.querySelector<HTMLButtonElement>('.voice-input button')!;
    expect(mic).not.toBeNull();
    mic.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    flushSync(); await settle(); flushSync();
    expect(recording).toBe(true);
    mic.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    flushSync(); await settle(); await settle(); flushSync();
    expect(target.textContent).toContain('installed transcript');
    button('Stop dictating').click(); flushSync();
    expect(cleanups).toBeGreaterThan(0);
  } finally { await unmount(app); target.remove(); }
});

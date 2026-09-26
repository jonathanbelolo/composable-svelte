import type { VoiceInputAudioManager, VoiceInputDependencies } from '@composable-svelte/media';
import type { StreamingChatDependencies, MessageAttachment } from '@composable-svelte/chat';
import type { CodeEditorDependencies } from '@composable-svelte/code';

/**
 * Combined application dependencies for the conversation workspace.
 * Composes dependencies required by @composable-svelte/chat, @composable-svelte/code,
 * and @composable-svelte/media.
 */
export interface WorkspaceDependencies
  extends StreamingChatDependencies,
    VoiceInputDependencies,
    CodeEditorDependencies {}

export interface FakeAutomationOptions {
  autoReplyPrefix?: string;
  transcriptText?: string;
  streamDelayMs?: number;
}

/**
 * Controller handle returned when creating fake dependencies, allowing
 * deterministic manual control over stream chunks and completions in tests.
 */
export interface FakeStreamControl {
  readonly message: string;
  readonly controller: AbortController;
  readonly onChunk: (chunk: string) => void;
  readonly onComplete: () => void;
  readonly onError: (error: string) => void;
  readonly attachments?: MessageAttachment[];
}

/**
 * Creates deterministic in-memory fake dependencies for automation, CI, and local development.
 *
 * NOTE ON QUALIFICATION BOUNDARY:
 * This fake device and transport implementation explicitly replaces hardware microphone capture
 * and external network streaming endpoints with reproducible in-memory automation:
 * - Fake Audio Manager: Simulates microphone acquisition, speech start/stop, and returns an in-memory Blob.
 * - Fake Speech Transcriber: Synchronously or deterministically resolves speech transcripts without external STT APIs.
 * - Fake Streaming Chat Transport: Dispatches chunks and completion via an AbortController with cancellation guarantees.
 * Real qualification requires live user-agent media device permissions (navigator.mediaDevices.getUserMedia),
 * actual microphone hardware, and live LLM/STT backends.
 */
export function createFakeWorkspaceDependencies(
  options: FakeAutomationOptions = {}
): WorkspaceDependencies & {
  readonly activeStreams: FakeStreamControl[];
  readonly abortedStreamsCount: number;
  triggerNextStreamChunk: (chunk: string) => void;
  completeNextStream: () => void;
} {
  const activeStreams: FakeStreamControl[] = [];
  let abortedStreamsCount = 0;
  let recording = false;
  let cleanups = 0;

  const fakeDevice: VoiceInputAudioManager = {
    requestMicrophone: async () => ({} as MediaStream),
    startRecording: () => {
      recording = true;
    },
    stopRecording: async () => {
      recording = false;
      return new Blob(['fake-audio-recording-pcm'], { type: 'audio/webm' });
    },
    startAudioLevelMonitoring: () => 1,
    stopInterval: () => {},
    detectVoiceActivity: () => false,
    cleanup: () => {
      recording = false;
      cleanups++;
    }
  } as unknown as VoiceInputAudioManager;

  let messageCounter = 0;

  const dependencies: WorkspaceDependencies & {
    readonly activeStreams: FakeStreamControl[];
    readonly abortedStreamsCount: number;
    triggerNextStreamChunk: (chunk: string) => void;
    completeNextStream: () => void;
  } = {
    get activeStreams() {
      return activeStreams;
    },
    get abortedStreamsCount() {
      return abortedStreamsCount;
    },

    // Deterministic streaming chat transport
    streamMessage: (message, onChunk, onComplete, onError, attachments) => {
      const controller = new AbortController();
      controller.signal.addEventListener('abort', () => {
        abortedStreamsCount++;
      });

      const control: FakeStreamControl = {
        message,
        controller,
        onChunk,
        onComplete,
        onError,
        attachments
      };
      activeStreams.push(control);

      const delay = options.streamDelayMs ?? 15;
      if (delay >= 0) {
        const replyText =
          (options.autoReplyPrefix ?? 'Assistant answer: ') +
          (message.length > 40 ? `${message.slice(0, 40)}...` : message);

        const timer = setTimeout(() => {
          if (controller.signal.aborted) return;
          onChunk(replyText);
          if (controller.signal.aborted) return;
          onComplete();
        }, delay);

        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
        });
      }

      return controller;
    },

    generateId: () => `msg-${++messageCounter}`,
    getTimestamp: () => 1700000000000 + messageCounter * 1000,

    uploadFile: async (file: File) => {
      return `https://mock.storage.local/uploads/${encodeURIComponent(file.name)}`;
    },

    // Voice Input dependencies
    transcribeAudio: async (_audio: Blob) => {
      return options.transcriptText ?? 'Voice note transcribed for support conversation';
    },
    createAudioManager: () => fakeDevice,
    getAudioManager: () => fakeDevice,
    deleteAudioManager: () => {
      fakeDevice.cleanup();
    },

    triggerNextStreamChunk: (chunk: string) => {
      const latest = activeStreams.at(-1);
      if (latest && !latest.controller.signal.aborted) {
        latest.onChunk(chunk);
      }
    },
    completeNextStream: () => {
      const latest = activeStreams.at(-1);
      if (latest && !latest.controller.signal.aborted) {
        latest.onComplete();
      }
    }
  };

  return dependencies;
}

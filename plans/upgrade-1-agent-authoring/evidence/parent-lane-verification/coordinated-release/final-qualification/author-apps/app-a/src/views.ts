import { defineViews } from '@composable-svelte/core/application';
import { composition } from './model';
import ChatView from './ChatView.svelte';
import EditorView from './EditorView.svelte';
import VoiceView from './VoiceView.svelte';

/**
 * Declared view bindings for the workspace composition.
 * Maps the chat, editor, and voice slots to their respective presentation components.
 */
export const workspaceViews = defineViews(composition, {
  chat: { render: ChatView },
  editor: { render: EditorView },
  voice: { render: VoiceView }
});

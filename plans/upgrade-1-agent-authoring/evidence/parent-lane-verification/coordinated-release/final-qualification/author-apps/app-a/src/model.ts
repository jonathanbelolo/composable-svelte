import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import {
  ManagedIntegrationBuilder,
  optionalSlot,
  defineApplication
} from '@composable-svelte/core/application';
import {
  streamingChatReducer,
  createInitialStreamingChatState,
  type StreamingChatState,
  type StreamingChatAction
} from '@composable-svelte/chat';
import {
  codeEditorReducer,
  createInitialCodeEditorState,
  type CodeEditorState,
  type CodeEditorAction
} from '@composable-svelte/code';
import {
  voiceInputReducer,
  createInitialVoiceInputState,
  type VoiceInputState,
  type VoiceInputAction
} from '@composable-svelte/media';
import type { WorkspaceDependencies } from './dependencies';

/**
 * Durable record of a support conversation.
 * Durable business outcomes (transcripts, completed assistant responses,
 * and drafts) are owned and updated by the parent reducer.
 */
export interface ArchivedResponse {
  readonly messageId: string;
  readonly content: string;
}

export interface ConversationRecord {
  readonly id: string;
  readonly title: string;
  readonly draftCode: string;
  readonly completedResponses: readonly ArchivedResponse[];
  readonly transcripts: readonly string[];
  readonly mediaUrl?: string;
}

/**
 * Root application state.
 * Composes managed optional child slots for Chat, Code Editor, and Voice Input.
 */
export interface WorkspaceState {
  readonly activeConversationId: string | null;
  readonly conversations: Readonly<Record<string, ConversationRecord>>;
  readonly chat: StreamingChatState | null;
  readonly editor: CodeEditorState | null;
  readonly voice: VoiceInputState | null;
}

export type WorkspaceAction =
  | { type: 'openConversation'; id: string }
  | { type: 'closeConversation' }
  | { type: 'replaceConversation'; id: string }
  | { type: 'sendDraftToChat' }
  | { type: 'chat'; action: PresentationAction<StreamingChatAction> }
  | { type: 'editor'; action: PresentationAction<CodeEditorAction> }
  | { type: 'voice'; action: PresentationAction<VoiceInputAction> };

export const defaultConversations: Readonly<Record<string, ConversationRecord>> = {
  'conv-1': {
    id: 'conv-1',
    title: 'Issue #101: Authentication Handler Bug',
    draftCode:
      '// Issue #101: Authentication verification handler\nexport function verifyAuthToken(token: string): boolean {\n  if (!token) return false;\n  return token.startsWith("bearer_");\n}\n',
    completedResponses: [],
    transcripts: [],
    mediaUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ'
  },
  'conv-2': {
    id: 'conv-2',
    title: 'Issue #102: Audio Stream Buffer Tuning',
    draftCode:
      '// Issue #102: Audio buffer size normalization\nexport function calculateBufferSize(sampleRate: number): number {\n  return Math.min(Math.max(sampleRate / 100, 256), 4096);\n}\n',
    completedResponses: [],
    transcripts: [],
    mediaUrl: 'https://vimeo.com/76979871'
  }
};

/**
 * Parent reducer for the support conversation workspace.
 * Responsible for durable outcomes:
 * 1. Recording completed assistant replies into conversation history.
 * 2. Attributing voice transcripts to the active conversation.
 * 3. Preserving code drafts per conversation across switches.
 * 4. Managing conversation open, close, and replacement lifecycle.
 */
export const workspaceReducer: Reducer<WorkspaceState, WorkspaceAction, WorkspaceDependencies> = (
  state,
  action
) => {
  switch (action.type) {
    case 'openConversation':
    case 'replaceConversation': {
      if (state.activeConversationId === action.id && state.chat !== null) {
        return [state, Effect.none()];
      }

      // Preserve current active conversation draft before switching
      let updatedConversations = { ...state.conversations };
      if (state.activeConversationId && state.editor) {
        const prevConv = updatedConversations[state.activeConversationId];
        if (prevConv) {
          updatedConversations[state.activeConversationId] = {
            ...prevConv,
            draftCode: state.editor.value
          };
        }
      }

      const targetConv = updatedConversations[action.id] ?? {
        id: action.id,
        title: `Conversation ${action.id}`,
        draftCode: '// New support draft\n',
        completedResponses: [],
        transcripts: []
      };
      updatedConversations[action.id] = targetConv;

      return [
        {
          ...state,
          activeConversationId: action.id,
          conversations: updatedConversations,
          chat: createInitialStreamingChatState(),
          editor: createInitialCodeEditorState({ value: targetConv.draftCode }),
          voice: createInitialVoiceInputState()
        },
        Effect.none()
      ];
    }

    case 'closeConversation': {
      let updatedConversations = { ...state.conversations };
      if (state.activeConversationId && state.editor) {
        const prevConv = updatedConversations[state.activeConversationId];
        if (prevConv) {
          updatedConversations[state.activeConversationId] = {
            ...prevConv,
            draftCode: state.editor.value
          };
        }
      }

      return [
        {
          ...state,
          activeConversationId: null,
          conversations: updatedConversations,
          chat: null,
          editor: null,
          voice: null
        },
        Effect.none()
      ];
    }

    case 'sendDraftToChat': {
      const code = state.editor?.value ?? '';
      if (!code.trim() || !state.chat) return [state, Effect.none()];

      return [
        state,
        Effect.run<WorkspaceAction>((dispatch) => {
          dispatch({
            type: 'chat',
            action: {
              type: 'presented',
              action: {
                type: 'sendMessage',
                message: `Here is the current code draft for review:\n\`\`\`typescript\n${code}\n\`\`\``
              }
            }
          });
        })
      ];
    }

    case 'chat': {
      if (action.action.type !== 'presented') return [state, Effect.none()];
      const child = action.action.action;

      // Acceptance observation: a completed assistant response is recorded once by the application
      if (child.type === 'streamComplete') {
        const activeId = state.activeConversationId;
        if (!activeId) return [state, Effect.none()];

        // The chat reduces first and ignores an idle or superseded completion, but the
        // parent still sees that action. Archive only an assistant reply not yet recorded
        // (assumes the injected generateId yields unique message ids).
        const reply = state.chat?.messages.at(-1);
        const conv = state.conversations[activeId];
        if (
          reply?.role === 'assistant' &&
          conv &&
          !conv.completedResponses.some((archived) => archived.messageId === reply.id)
        ) {
          const nextConv: ConversationRecord = {
            ...conv,
            completedResponses: [
              ...conv.completedResponses,
              { messageId: reply.id, content: reply.content }
            ]
          };
          return [
            {
              ...state,
              conversations: {
                ...state.conversations,
                [activeId]: nextConv
              }
            },
            Effect.none()
          ];
        }
      }
      return [state, Effect.none()];
    }

    case 'editor': {
      if (action.action.type !== 'presented') return [state, Effect.none()];
      const child = action.action.action;

      // Synchronize editor edits into durable conversation draft state
      if (child.type === 'valueChanged') {
        const activeId = state.activeConversationId;
        if (activeId && state.conversations[activeId]) {
          const conv = state.conversations[activeId]!;
          return [
            {
              ...state,
              conversations: {
                ...state.conversations,
                [activeId]: { ...conv, draftCode: child.value }
              }
            },
            Effect.none()
          ];
        }
      }
      return [state, Effect.none()];
    }

    case 'voice': {
      if (action.action.type !== 'presented') return [state, Effect.none()];
      const child = action.action.action;

      // Acceptance observation: a recording/transcript belongs to its original conversation
      if (child.type === 'transcriptionCompleted') {
        const activeId = state.activeConversationId;
        if (activeId && state.conversations[activeId]) {
          const conv = state.conversations[activeId]!;
          const nextConv: ConversationRecord = {
            ...conv,
            transcripts: [...conv.transcripts, child.transcript]
          };
          return [
            {
              ...state,
              conversations: {
                ...state.conversations,
                [activeId]: nextConv
              }
            },
            Effect.none()
          ];
        }
      }
      return [state, Effect.none()];
    }
  }
};

export const chatSlot = optionalSlot<WorkspaceState, WorkspaceAction>()('chat');
export const editorSlot = optionalSlot<WorkspaceState, WorkspaceAction>()('editor');
export const voiceSlot = optionalSlot<WorkspaceState, WorkspaceAction>()('voice');

/**
 * Predicate determining when an existing non-null child slot is replaced with a new lifetime.
 * When switching between conversations, returning true causes ManagedIntegrationBuilder
 * to issue a 'replace' intent, terminating the old owner and dropping any late callbacks.
 */
export const isConversationReplacement = (
  action: WorkspaceAction,
  before: WorkspaceState,
  after: WorkspaceState
): boolean =>
  (action.type === 'replaceConversation' || action.type === 'openConversation') &&
  before.activeConversationId !== null &&
  before.activeConversationId !== after.activeConversationId;

export const composition = new ManagedIntegrationBuilder(workspaceReducer)
  .with(chatSlot, streamingChatReducer, { replaceOn: isConversationReplacement })
  .with(editorSlot, codeEditorReducer, { replaceOn: isConversationReplacement })
  .with(voiceSlot, voiceInputReducer, { replaceOn: isConversationReplacement })
  .build();

export const createInitialWorkspaceState = (initial?: Partial<WorkspaceState>): WorkspaceState => {
  const initialConvId = initial?.activeConversationId !== undefined
    ? initial.activeConversationId
    : 'conv-1';
  const conversations = initial?.conversations ?? defaultConversations;
  const initialConv = initialConvId ? conversations[initialConvId] : undefined;

  return {
    activeConversationId: initialConvId,
    conversations,
    chat: initialConvId ? createInitialStreamingChatState() : null,
    editor: initialConvId && initialConv
      ? createInitialCodeEditorState({ value: initialConv.draftCode })
      : null,
    voice: initialConvId ? createInitialVoiceInputState() : null,
    ...initial
  };
};

export const application = defineApplication(composition, {
  initialState: createInitialWorkspaceState
});

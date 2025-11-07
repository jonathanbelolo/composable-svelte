# Message Interactions Plan

## Overview

Enhance the StreamingChat component with interactive message operations: regeneration, cancellation, editing, copying, and context menu access.

**Status**: Planning
**Related**: VIDEO-EMBED-PLAN.md (Phase 10)

## Goals

1. **Message Regeneration**: Re-generate assistant responses from the same user prompt
2. **Stop Generation**: Cancel streaming responses in progress
3. **Message Editing**: Edit previous user messages and resubmit
4. **Copy Message**: Copy entire message content to clipboard
5. **Context Menu**: Right-click menu for quick access to all operations

## Architecture

### Core Principle: State-Driven Operations

Follow Composable Architecture patterns:
- All operations dispatch actions to the reducer
- State tracks operation in progress (editing, cancelling)
- Effects handle async operations (clipboard, streaming)
- Pure presentational components react to state

### State Additions

```typescript
export interface StreamingChatState {
  /** All messages in the conversation */
  messages: Message[];

  /** Currently streaming message (if any) */
  currentStreaming: {
    content: string;
    isComplete: boolean;
    /** Controller for cancelling the stream */
    abortController?: AbortController;
  } | null;

  /** Waiting for response to start */
  isWaitingForResponse: boolean;

  /** Error message (if any) */
  error: string | null;

  /** Message being edited (if any) */
  editingMessage: {
    id: string;
    content: string;
  } | null;

  /** Context menu state */
  contextMenu: {
    isOpen: boolean;
    messageId: string | null;
    position: { x: number; y: number };
  } | null;
}
```

### Action Additions

```typescript
export type StreamingChatAction =
  // Existing actions
  | { type: 'sendMessage'; message: string }
  | { type: 'chunkReceived'; chunk: string }
  | { type: 'streamComplete' }
  | { type: 'streamError'; error: string }
  | { type: 'clearError' }
  | { type: 'clearMessages' }

  // New actions
  | { type: 'stopGeneration' }
  | { type: 'regenerateMessage'; messageId: string }
  | { type: 'startEditingMessage'; messageId: string }
  | { type: 'updateEditingContent'; content: string }
  | { type: 'submitEditedMessage' }
  | { type: 'cancelEditing' }
  | { type: 'copyMessage'; messageId: string }
  | { type: 'copySuccess' }
  | { type: 'copyError'; error: string }
  | { type: 'openContextMenu'; messageId: string; position: { x: number; y: number } }
  | { type: 'closeContextMenu' }
  | { type: 'deleteMessage'; messageId: string };
```

## Feature Details

### 1. Stop Generation

**User Flow**:
1. While streaming, user clicks "Stop" button
2. Stream is cancelled via AbortController
3. Partial content is preserved as a message
4. User can continue conversation

**State Changes**:
```typescript
case 'stopGeneration': {
  if (!state.currentStreaming?.abortController) {
    return [state, Effect.none()];
  }

  // Abort the stream
  state.currentStreaming.abortController.abort();

  // Save partial content as a message
  const partialMessage: Message = {
    id: deps.generateId?.() ?? crypto.randomUUID(),
    role: 'assistant',
    content: state.currentStreaming.content,
    timestamp: deps.getTimestamp?.() ?? Date.now(),
  };

  return [
    {
      ...state,
      messages: [...state.messages, partialMessage],
      currentStreaming: null,
      isWaitingForResponse: false,
    },
    Effect.none()
  ];
}
```

**UI**:
- "Stop" button appears in ChatInput while streaming
- Button is disabled when not streaming
- Visual feedback (button state change)

### 2. Message Regeneration

**User Flow**:
1. User clicks "Regenerate" on an assistant message
2. System finds the preceding user message
3. Removes the assistant message being regenerated
4. Re-sends the user message to trigger new response

**State Changes**:
```typescript
case 'regenerateMessage': {
  const messageIndex = state.messages.findIndex(m => m.id === action.messageId);
  if (messageIndex === -1 || state.messages[messageIndex].role !== 'assistant') {
    return [state, Effect.none()];
  }

  // Find preceding user message
  let userMessageIndex = messageIndex - 1;
  while (userMessageIndex >= 0 && state.messages[userMessageIndex].role !== 'user') {
    userMessageIndex--;
  }

  if (userMessageIndex === -1) {
    return [state, Effect.none()]; // No user message found
  }

  const userMessage = state.messages[userMessageIndex];

  // Remove all messages after (and including) the assistant message being regenerated
  const newMessages = state.messages.slice(0, messageIndex);

  return [
    {
      ...state,
      messages: newMessages,
      isWaitingForResponse: true,
      currentStreaming: null,
      error: null,
    },
    Effect.run(async (dispatch) => {
      // Re-send the user message
      dispatch({ type: 'sendMessage', message: userMessage.content });
    })
  ];
}
```

**UI**:
- "Regenerate" button on assistant messages (hover or always visible)
- Button disabled if streaming or editing
- Loading state while regenerating

### 3. Message Editing

**User Flow**:
1. User clicks "Edit" on a user message
2. Message content becomes editable (textarea)
3. User modifies content and presses Enter or clicks "Save"
4. System removes all messages after the edited one
5. Re-sends modified message to get new response

**State Changes**:
```typescript
case 'startEditingMessage': {
  const message = state.messages.find(m => m.id === action.messageId);
  if (!message || message.role !== 'user') {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      editingMessage: {
        id: action.messageId,
        content: message.content,
      },
    },
    Effect.none()
  ];
}

case 'updateEditingContent': {
  if (!state.editingMessage) {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      editingMessage: {
        ...state.editingMessage,
        content: action.content,
      },
    },
    Effect.none()
  ];
}

case 'submitEditedMessage': {
  if (!state.editingMessage) {
    return [state, Effect.none()];
  }

  const messageIndex = state.messages.findIndex(m => m.id === state.editingMessage!.id);
  if (messageIndex === -1) {
    return [state, Effect.none()];
  }

  // Update the message content
  const updatedMessage = {
    ...state.messages[messageIndex],
    content: state.editingMessage.content,
  };

  // Remove all messages after the edited one
  const newMessages = [
    ...state.messages.slice(0, messageIndex),
    updatedMessage,
  ];

  return [
    {
      ...state,
      messages: newMessages,
      editingMessage: null,
      isWaitingForResponse: true,
      currentStreaming: null,
      error: null,
    },
    Effect.run(async (dispatch) => {
      // Send the edited message
      dispatch({ type: 'sendMessage', message: state.editingMessage!.content });
    })
  ];
}

case 'cancelEditing': {
  return [
    {
      ...state,
      editingMessage: null,
    },
    Effect.none()
  ];
}
```

**UI**:
- "Edit" button on user messages
- Replace message content with textarea when editing
- "Save" and "Cancel" buttons while editing
- Keyboard shortcuts (Enter to save, Escape to cancel)

### 4. Copy Message

**User Flow**:
1. User clicks "Copy" on any message
2. Message content is copied to clipboard
3. Brief success feedback (checkmark, toast, or button state)

**State Changes**:
```typescript
case 'copyMessage': {
  const message = state.messages.find(m => m.id === action.messageId);
  if (!message) {
    return [state, Effect.none()];
  }

  return [
    state,
    Effect.run(async (dispatch) => {
      try {
        await navigator.clipboard.writeText(message.content);
        dispatch({ type: 'copySuccess' });
      } catch (error) {
        dispatch({
          type: 'copyError',
          error: error instanceof Error ? error.message : 'Failed to copy'
        });
      }
    })
  ];
}

case 'copySuccess': {
  // Could set temporary success state if needed
  return [state, Effect.none()];
}

case 'copyError': {
  return [
    {
      ...state,
      error: action.error,
    },
    Effect.none()
  ];
}
```

**UI**:
- "Copy" button on each message
- Icon changes to checkmark briefly on success
- Works for both user and assistant messages

### 5. Context Menu

**User Flow**:
1. User right-clicks on a message
2. Context menu appears at cursor position
3. Menu shows available actions based on message type
4. Clicking an action closes menu and executes action
5. Clicking outside closes menu without action

**State Changes**:
```typescript
case 'openContextMenu': {
  return [
    {
      ...state,
      contextMenu: {
        isOpen: true,
        messageId: action.messageId,
        position: action.position,
      },
    },
    Effect.none()
  ];
}

case 'closeContextMenu': {
  return [
    {
      ...state,
      contextMenu: null,
    },
    Effect.none()
  ];
}
```

**Context Menu Options**:

For **User Messages**:
- Copy
- Edit
- Delete (removes message and all following messages)

For **Assistant Messages**:
- Copy
- Regenerate
- Delete (just this message)

**UI**:
- Custom context menu component (positioned absolutely)
- Uses click-outside action to close
- Portal for proper z-index stacking
- Keyboard navigation (arrow keys, Enter, Escape)

### 6. Delete Message

**User Flow**:
1. User selects "Delete" from context menu
2. For user messages: Removes message and all following messages
3. For assistant messages: Removes just that message
4. No confirmation (can be added if needed)

**State Changes**:
```typescript
case 'deleteMessage': {
  const messageIndex = state.messages.findIndex(m => m.id === action.messageId);
  if (messageIndex === -1) {
    return [state, Effect.none()];
  }

  const message = state.messages[messageIndex];

  let newMessages: Message[];
  if (message.role === 'user') {
    // Remove this message and all following messages
    newMessages = state.messages.slice(0, messageIndex);
  } else {
    // Remove just this message
    newMessages = [
      ...state.messages.slice(0, messageIndex),
      ...state.messages.slice(messageIndex + 1),
    ];
  }

  return [
    {
      ...state,
      messages: newMessages,
      contextMenu: null,
    },
    Effect.none()
  ];
}
```

## Component Updates

### ChatMessage.svelte

**Current Structure**:
```svelte
<div class="chat-message" data-role={message.role}>
  <div class="chat-message__header">...</div>
  <div class="chat-message__content">...</div>
</div>
```

**New Structure**:
```svelte
<div
  class="chat-message"
  data-role={message.role}
  data-editing={isEditing}
  oncontextmenu={handleContextMenu}
>
  <div class="chat-message__header">
    <span class="chat-message__role">...</span>
    <span class="chat-message__time">...</span>

    <!-- Action buttons (hover) -->
    <div class="chat-message__actions">
      {#if message.role === 'user'}
        <button
          class="action-button"
          onclick={() => store.dispatch({ type: 'startEditingMessage', messageId: message.id })}
          aria-label="Edit message"
        >
          <EditIcon />
        </button>
      {:else}
        <button
          class="action-button"
          onclick={() => store.dispatch({ type: 'regenerateMessage', messageId: message.id })}
          disabled={isStreaming}
          aria-label="Regenerate response"
        >
          <RefreshIcon />
        </button>
      {/if}

      <button
        class="action-button"
        onclick={() => store.dispatch({ type: 'copyMessage', messageId: message.id })}
        aria-label="Copy message"
      >
        <CopyIcon />
      </button>
    </div>
  </div>

  <!-- Content or edit mode -->
  {#if isEditing}
    <textarea
      class="chat-message__edit-textarea"
      bind:value={editContent}
      onkeydown={handleEditKeydown}
    />
    <div class="chat-message__edit-actions">
      <button onclick={submitEdit}>Save</button>
      <button onclick={cancelEdit}>Cancel</button>
    </div>
  {:else}
    <div class="chat-message__content">...</div>
  {/if}
</div>
```

### ChatInput.svelte

Add stop button:

```svelte
<div class="chat-input">
  <textarea
    bind:value={inputValue}
    disabled={disabled || isStreaming}
    placeholder={isStreaming ? "Generating response..." : "Type a message..."}
  />

  <div class="chat-input__actions">
    {#if isStreaming}
      <button
        class="stop-button"
        onclick={() => store.dispatch({ type: 'stopGeneration' })}
        aria-label="Stop generation"
      >
        <StopIcon />
        Stop
      </button>
    {:else}
      <button
        class="send-button"
        onclick={handleSend}
        disabled={!inputValue.trim() || disabled}
        aria-label="Send message"
      >
        <SendIcon />
        Send
      </button>
    {/if}
  </div>
</div>
```

### ContextMenu.svelte (New Component)

```svelte
<script lang="ts">
  import { portal } from '$lib/actions/portal';
  import { clickOutside } from '$lib/actions/clickOutside';

  interface Props {
    isOpen: boolean;
    position: { x: number; y: number };
    messageId: string;
    messageRole: 'user' | 'assistant' | 'system';
    onClose: () => void;
    onCopy: (id: string) => void;
    onEdit?: (id: string) => void;
    onRegenerate?: (id: string) => void;
    onDelete: (id: string) => void;
  }

  const props = $props<Props>();
</script>

{#if props.isOpen}
  <div
    class="context-menu"
    style="left: {props.position.x}px; top: {props.position.y}px;"
    use:portal
    use:clickOutside={props.onClose}
  >
    <button
      class="context-menu__item"
      onclick={() => { props.onCopy(props.messageId); props.onClose(); }}
    >
      <CopyIcon />
      Copy
    </button>

    {#if props.messageRole === 'user' && props.onEdit}
      <button
        class="context-menu__item"
        onclick={() => { props.onEdit!(props.messageId); props.onClose(); }}
      >
        <EditIcon />
        Edit
      </button>
    {/if}

    {#if props.messageRole === 'assistant' && props.onRegenerate}
      <button
        class="context-menu__item"
        onclick={() => { props.onRegenerate!(props.messageId); props.onClose(); }}
      >
        <RefreshIcon />
        Regenerate
      </button>
    {/if}

    <div class="context-menu__separator"></div>

    <button
      class="context-menu__item context-menu__item--danger"
      onclick={() => { props.onDelete(props.messageId); props.onClose(); }}
    >
      <DeleteIcon />
      Delete
    </button>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
    min-width: 160px;
    z-index: 1000;
  }

  .context-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;
  }

  .context-menu__item:hover {
    background: #f5f5f5;
  }

  .context-menu__item--danger {
    color: #dc2626;
  }

  .context-menu__item--danger:hover {
    background: #fef2f2;
  }

  .context-menu__separator {
    height: 1px;
    background: #e0e0e0;
    margin: 4px 0;
  }
</style>
```

## AbortController Integration

### Updated Dependencies Interface

```typescript
export interface StreamingChatDependencies {
  /**
   * Stream a message to the backend and receive chunks.
   *
   * @param message - The user's message
   * @param onChunk - Called for each chunk of the response
   * @param onComplete - Called when streaming is complete
   * @param onError - Called if an error occurs
   * @returns AbortController for cancellation
   */
  streamMessage: (
    message: string,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ) => AbortController; // Changed from optional to required

  generateId?: () => string;
  getTimestamp?: () => number;
}
```

### Updated sendMessage Handler

```typescript
case 'sendMessage': {
  if (state.isWaitingForResponse || state.currentStreaming) {
    return [state, Effect.none()]; // Already processing
  }

  const userMessage: Message = {
    id: deps.generateId?.() ?? crypto.randomUUID(),
    role: 'user',
    content: action.message,
    timestamp: deps.getTimestamp?.() ?? Date.now(),
  };

  return [
    {
      ...state,
      messages: [...state.messages, userMessage],
      isWaitingForResponse: true,
      currentStreaming: { content: '', isComplete: false },
      error: null,
    },
    Effect.run(async (dispatch) => {
      try {
        // Get abort controller from streamMessage
        const abortController = deps.streamMessage(
          action.message,
          (chunk) => dispatch({ type: 'chunkReceived', chunk }),
          () => dispatch({ type: 'streamComplete' }),
          (error) => dispatch({ type: 'streamError', error })
        );

        // Store the abort controller
        dispatch({
          type: '_internal_setAbortController',
          abortController
        });
      } catch (error) {
        dispatch({
          type: 'streamError',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    })
  ];
}

// Internal action to store abort controller
case '_internal_setAbortController': {
  if (!state.currentStreaming) {
    return [state, Effect.none()];
  }

  return [
    {
      ...state,
      currentStreaming: {
        ...state.currentStreaming,
        abortController: action.abortController,
      },
    },
    Effect.none()
  ];
}
```

### Updated Mock Implementation

```typescript
export function createMockStreamingChat(): StreamingChatDependencies {
  return {
    streamMessage: (message, onChunk, onComplete, onError) => {
      const abortController = new AbortController();

      (async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Check if aborted
          if (abortController.signal.aborted) {
            return;
          }

          const response = generateMockResponse(message);
          const words = response.split(' ');

          for (const word of words) {
            // Check abort before each chunk
            if (abortController.signal.aborted) {
              return;
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
            onChunk(word + ' ');
          }

          // Only call onComplete if not aborted
          if (!abortController.signal.aborted) {
            onComplete();
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            onError(error instanceof Error ? error.message : 'Unknown error');
          }
        }
      })();

      return abortController;
    },

    generateId: () => crypto.randomUUID(),
    getTimestamp: () => Date.now()
  };
}
```

## Testing Strategy

### Unit Tests (Reducer)

1. **Stop Generation**:
   - Stops active stream
   - Saves partial content as message
   - Returns to idle state
   - Handles no active stream gracefully

2. **Regenerate Message**:
   - Finds preceding user message
   - Removes messages after regenerate point
   - Re-dispatches send action
   - Handles edge cases (first message, no user message)

3. **Message Editing**:
   - Enters edit mode for user messages
   - Updates edit content
   - Submits edited message
   - Cancels editing
   - Removes subsequent messages on submit

4. **Copy Message**:
   - Copies message content to clipboard
   - Handles success and error states

5. **Context Menu**:
   - Opens at correct position
   - Closes on action or outside click
   - Shows correct options per role

6. **Delete Message**:
   - Deletes user message and following messages
   - Deletes single assistant message

### Integration Tests

1. **Stop and Continue**:
   - Stop mid-stream
   - Verify partial content saved
   - Send new message after stop

2. **Edit and Regenerate**:
   - Edit a message
   - Verify conversation branches correctly
   - Check new response generated

3. **Regenerate Multiple Times**:
   - Regenerate same message multiple times
   - Verify previous regeneration is replaced

4. **Context Menu Navigation**:
   - Open context menu
   - Navigate with keyboard
   - Execute action
   - Verify action executed

## Icons Needed

Simple SVG icons for:
- Edit (pencil)
- Regenerate (refresh/cycle)
- Copy (documents)
- Delete (trash)
- Stop (square)
- Send (paper plane)

Use inline SVGs for simplicity and control.

## Accessibility

1. **Keyboard Navigation**:
   - Tab through action buttons
   - Enter to activate
   - Escape to close context menu/editing

2. **ARIA Labels**:
   - All buttons have aria-label
   - Context menu has role="menu"
   - Menu items have role="menuitem"

3. **Screen Reader Announcements**:
   - Announce when message copied
   - Announce when stream stopped
   - Announce when editing mode active

4. **Focus Management**:
   - Focus textarea when entering edit mode
   - Return focus to trigger after context menu closes
   - Maintain focus visible indicators

## Implementation Steps

### Phase 1: Core Actions (Stop, Regenerate, Copy)
1. Update types.ts with new actions and state
2. Update streaming-chat.reducer.ts with action handlers
3. Update ChatMessage.svelte with action buttons
4. Update ChatInput.svelte with stop button
5. Update mock implementation with AbortController
6. Write reducer tests

### Phase 2: Message Editing
1. Add editing state to reducer
2. Implement edit actions
3. Add edit UI to ChatMessage.svelte
4. Add keyboard shortcuts
5. Write tests

### Phase 3: Context Menu
1. Create ContextMenu.svelte component
2. Add context menu state to reducer
3. Integrate with ChatMessage.svelte
4. Add keyboard navigation
5. Write tests

### Phase 4: Polish
1. Add icons
2. Style all new UI elements
3. Add animations (fade in/out for context menu)
4. Accessibility audit
5. Update styleguide demo

## Security Considerations

1. **Message Deletion**: User messages trigger conversation branching - ensure all subsequent messages are properly removed
2. **Edit Validation**: Validate edited content isn't empty
3. **Clipboard Access**: Handle clipboard permission errors gracefully
4. **Context Menu Position**: Ensure menu stays within viewport bounds

## Future Enhancements

1. **Undo/Redo**: Track conversation history for undo
2. **Message Reactions**: Add emoji reactions to messages
3. **Message Search**: Filter/highlight messages
4. **Conversation Export**: Export to markdown/JSON
5. **Message Timestamps**: Show relative times ("2 minutes ago")
6. **Confirmation Dialogs**: Confirm destructive actions (delete, clear)

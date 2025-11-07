# Collaborative Features - Composable Architecture

## Overview

This document outlines the **composable architecture** for collaborative features, following the same primitive-based approach used in StreamingChat. The goal is to create reusable building blocks that can be mixed and matched to build different collaborative experiences.

---

## Architecture Philosophy

### Three-Layer Composition Model

```
┌─────────────────────────────────────────────────────────────┐
│                      LAYER 3: VARIANTS                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Collaborative│  │ Collaborative│  │ Custom           │  │
│  │ Chat         │  │ Chat         │  │ Composition      │  │
│  │ (Minimal)    │  │ (Full)       │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↑
                    Compose from Modules
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     LAYER 2: MODULES                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ Multi-User │  │  Presence  │  │   Sharing  │           │
│  │   Module   │  │   Module   │  │   Module   │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────┘
                            ↑
                    Built with Primitives
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: PRIMITIVES                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Status  │  │  Typing  │  │  Cursor  │  │   User   │   │
│  │  Badge   │  │Indicator │  │  Marker  │  │  Avatar  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Layer 1 (Primitives):** Headless, unstyled components with pure logic
**Layer 2 (Modules):** Feature-specific compositions of primitives
**Layer 3 (Variants):** Ready-to-use presets for common use cases

---

## Layer 1: Primitives

Atomic, composable building blocks with minimal styling and maximum flexibility.

### 1. PresenceBadgePrimitive

**Purpose:** Display user online/offline/away status indicator

**Props:**
```typescript
interface PresenceBadgeProps {
  status: 'online' | 'away' | 'dnd' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean; // Animated pulse for online status
  class?: string;
}
```

**No internal state, purely presentational.**

**Usage:**
```svelte
<PresenceBadgePrimitive status="online" size="sm" showPulse={true} />
```

---

### 2. TypingIndicatorPrimitive

**Purpose:** Show typing animation and user names

**Props:**
```typescript
interface TypingIndicatorProps {
  typingUsers: string[]; // User names
  maxVisible?: number; // Max users before "X people are typing"
  dotAnimation?: boolean; // Animated dots (⋯)
  class?: string;
}
```

**No timeout logic, just displays what you give it.**

**Usage:**
```svelte
<TypingIndicatorPrimitive
  typingUsers={['Alice', 'Bob']}
  maxVisible={2}
  dotAnimation={true}
/>
```

---

### 3. CursorMarkerPrimitive

**Purpose:** Display a user's cursor/scroll position indicator

**Props:**
```typescript
interface CursorMarkerProps {
  userName: string;
  color: string; // User's assigned color
  position: number; // 0-100 percentage
  orientation?: 'vertical' | 'horizontal'; // Scrollbar position
  showLabel?: boolean;
  class?: string;
}
```

**No tracking logic, just visual indicator.**

**Usage:**
```svelte
<CursorMarkerPrimitive
  userName="Alice"
  color="#3b82f6"
  position={45.5}
  orientation="vertical"
  showLabel={true}
/>
```

---

### 4. UserAvatarPrimitive

**Purpose:** Display user avatar with optional presence badge

**Props:**
```typescript
interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  color?: string; // Fallback color for initials
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showPresence?: boolean;
  presenceStatus?: PresenceStatus;
  class?: string;
}
```

**Auto-generates initials if no avatar provided.**

**Usage:**
```svelte
<UserAvatarPrimitive
  name="Alice Smith"
  size="md"
  showPresence={true}
  presenceStatus="online"
/>
```

---

### 5. PermissionBadgePrimitive

**Purpose:** Show user's permission level

**Props:**
```typescript
interface PermissionBadgeProps {
  permission: 'view' | 'comment' | 'edit' | 'admin';
  variant?: 'text' | 'icon' | 'badge';
  class?: string;
}
```

**Usage:**
```svelte
<PermissionBadgePrimitive permission="edit" variant="badge" />
```

---

### 6. UserListItemPrimitive

**Purpose:** Single user in a list with status and actions

**Props:**
```typescript
interface UserListItemProps {
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
    color: string;
    presence: PresenceStatus;
    permission: PermissionLevel;
  };
  currentUserId?: string; // Highlight current user
  showPermission?: boolean;
  showPresence?: boolean;
  onUserClick?: (userId: string) => void;
  onMenuOpen?: (userId: string) => void;
  class?: string;
}
```

**Usage:**
```svelte
<UserListItemPrimitive
  user={alice}
  currentUserId="user-123"
  showPermission={true}
  onUserClick={handleUserClick}
/>
```

---

### 7. SyncIndicatorPrimitive

**Purpose:** Show connection/sync status

**Props:**
```typescript
interface SyncIndicatorProps {
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  showText?: boolean;
  showIcon?: boolean;
  class?: string;
}
```

**Usage:**
```svelte
<SyncIndicatorPrimitive status="connected" showText={true} />
```

---

### 8. ShareDialogPrimitive

**Purpose:** UI for creating share links and invitations

**Props:**
```typescript
interface ShareDialogProps {
  conversationId: string;
  shareLinks: ShareLink[];
  invitations: Invitation[];
  onCreateShareLink: (permission: PermissionLevel, expiresIn?: number) => void;
  onRevokeShareLink: (linkId: string) => void;
  onInviteUser: (email: string, permission: PermissionLevel) => void;
  onRevokeInvitation: (invitationId: string) => void;
  onPermissionChange: (userId: string, permission: PermissionLevel) => void;
  class?: string;
}
```

**Usage:**
```svelte
<ShareDialogPrimitive
  conversationId="conv-123"
  shareLinks={links}
  onCreateShareLink={handleCreateLink}
/>
```

---

## Layer 2: Feature Modules

Combine primitives with state management to create full features.

### 1. MultiUserModule

**Exports:**
- `multiUserReducer` - Handles user join/leave/update
- `createMultiUserState()` - Initial state factory
- `MultiUserList` component - Uses `UserListItemPrimitive`

**State:**
```typescript
interface MultiUserState {
  users: Map<string, CollaborativeUser>;
  currentUserId: string;
  permissions: PermissionMap;
}
```

**Components:**
```svelte
<!-- Composed from primitives -->
<script lang="ts">
  import { UserListItemPrimitive } from '@composable-svelte/code/primitives';

  export let users: CollaborativeUser[];
  export let currentUserId: string;
</script>

<div class="user-list">
  {#each users as user}
    <UserListItemPrimitive
      {user}
      {currentUserId}
      showPermission={true}
      showPresence={true}
    />
  {/each}
</div>
```

**Usage:**
```typescript
import { createStore } from '@composable-svelte/core';
import { multiUserReducer, createMultiUserState, MultiUserList } from '@composable-svelte/code/collaborative';

const userStore = createStore({
  initialState: createMultiUserState(),
  reducer: multiUserReducer
});
```

```svelte
<MultiUserList store={userStore} />
```

---

### 2. PresenceModule

**Exports:**
- `presenceReducer` - Handles status updates, heartbeat
- `createPresenceState()` - Initial state factory
- `usePresenceTracking()` - Hook for automatic presence tracking
- `PresenceIndicator` component - Uses `PresenceBadgePrimitive`

**State:**
```typescript
interface PresenceState {
  users: Map<string, UserPresence>;
  heartbeatInterval: number | null;
  lastActivity: Date;
}
```

**Composable Hook:**
```typescript
/**
 * Automatically track user presence and emit updates
 */
export function usePresenceTracking(
  store: Store<PresenceState, PresenceAction>,
  userId: string
) {
  // Detect activity (mouse, keyboard)
  // Send heartbeat every 30s
  // Auto-away after 5 minutes
  // Return cleanup function
}
```

**Usage:**
```typescript
import { createStore } from '@composable-svelte/core';
import { presenceReducer, createPresenceState, usePresenceTracking } from '@composable-svelte/code/collaborative';

const presenceStore = createStore({
  initialState: createPresenceState(),
  reducer: presenceReducer
});

// In component
$effect(() => {
  const cleanup = usePresenceTracking(presenceStore, 'user-123');
  return cleanup;
});
```

---

### 3. TypingModule

**Exports:**
- `typingReducer` - Handles typing start/stop/timeout
- `createTypingState()` - Initial state factory
- `useTypingEmitter()` - Hook to emit typing events
- `TypingIndicator` component - Uses `TypingIndicatorPrimitive`

**State:**
```typescript
interface TypingState {
  typingUsers: Map<string, TypingInfo>;
  typingTimeouts: Map<string, number>;
}
```

**Composable Hook:**
```typescript
/**
 * Emit typing events when user types in input
 */
export function useTypingEmitter(
  store: Store<TypingState, TypingAction>,
  userId: string,
  inputRef: HTMLTextAreaElement | HTMLInputElement
) {
  // Listen to input events (debounced)
  // Emit typing start
  // Auto-stop after 3s of no typing
  // Stop on blur/submit
}
```

**Usage:**
```svelte
<script lang="ts">
  import { useTypingEmitter, TypingIndicator } from '@composable-svelte/code/collaborative';

  let inputRef: HTMLTextAreaElement;

  $effect(() => {
    const cleanup = useTypingEmitter(typingStore, 'user-123', inputRef);
    return cleanup;
  });
</script>

<textarea bind:this={inputRef} />
<TypingIndicator store={typingStore} />
```

---

### 4. CursorModule

**Exports:**
- `cursorReducer` - Handles cursor position updates
- `createCursorState()` - Initial state factory
- `useCursorTracking()` - Hook to track scroll position
- `LiveCursors` component - Uses `CursorMarkerPrimitive`

**State:**
```typescript
interface CursorState {
  cursors: Map<string, UserCursor>;
  cursorTimeouts: Map<string, number>;
}
```

**Composable Hook:**
```typescript
/**
 * Track local scroll position and emit updates
 */
export function useCursorTracking(
  store: Store<CursorState, CursorAction>,
  userId: string,
  scrollableRef: HTMLElement
) {
  // Listen to scroll events (debounced)
  // Calculate relative position (%)
  // Emit cursor updates
  // Auto-hide after 30s of inactivity
}
```

**Usage:**
```svelte
<script lang="ts">
  import { useCursorTracking, LiveCursors } from '@composable-svelte/code/collaborative';

  let chatContainerRef: HTMLDivElement;

  $effect(() => {
    const cleanup = useCursorTracking(cursorStore, 'user-123', chatContainerRef);
    return cleanup;
  });
</script>

<div bind:this={chatContainerRef} class="chat-container">
  <!-- Messages -->
</div>

<LiveCursors store={cursorStore} containerRef={chatContainerRef} />
```

---

### 5. ShareModule

**Exports:**
- `shareReducer` - Handles share links, invitations
- `createShareState()` - Initial state factory
- `ShareDialog` component - Uses `ShareDialogPrimitive`

**State:**
```typescript
interface ShareState {
  shareLinks: ShareLink[];
  invitations: Invitation[];
  auditLog: AuditEntry[];
}
```

**Usage:**
```svelte
<script lang="ts">
  import { ShareDialog } from '@composable-svelte/code/collaborative';
</script>

<ShareDialog
  store={shareStore}
  conversationId="conv-123"
  onShareCreated={handleShare}
/>
```

---

### 6. SyncModule

**Exports:**
- `syncReducer` - Handles WebSocket connection/sync
- `createSyncState()` - Initial state factory
- `useSyncConnection()` - Hook to manage WebSocket
- `SyncIndicator` component - Uses `SyncIndicatorPrimitive`

**State:**
```typescript
interface SyncState {
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  lastSyncTime: Date | null;
  pendingMessages: Message[];
  reconnectAttempts: number;
}
```

**Composable Hook:**
```typescript
/**
 * Manage WebSocket connection and sync
 */
export function useSyncConnection(
  store: Store<SyncState, SyncAction>,
  conversationId: string,
  wsUrl: string
) {
  // Establish WebSocket connection
  // Handle reconnection with backoff
  // Sync state on reconnect
  // Queue messages when offline
  // Return connection controls
}
```

**Usage:**
```typescript
import { useSyncConnection } from '@composable-svelte/code/collaborative';

$effect(() => {
  const { disconnect } = useSyncConnection(
    syncStore,
    'conv-123',
    'wss://api.example.com/chat'
  );

  return () => disconnect();
});
```

---

## Layer 3: Variants

Pre-configured compositions for common use cases.

### Variant 1: CollaborativeChat (Minimal)

**Features:**
- Multi-user chat
- Typing indicators
- Basic presence (online/offline)

**No cursors, no sharing, no advanced presence.**

**Usage:**
```svelte
<script lang="ts">
  import { CollaborativeChatMinimal } from '@composable-svelte/code/collaborative';
  import { createStore } from '@composable-svelte/core';

  const chatStore = createStore({
    initialState: createCollaborativeChatState(),
    reducer: collaborativeChatReducer
  });
</script>

<CollaborativeChatMinimal
  store={chatStore}
  conversationId="conv-123"
  currentUserId="user-456"
  wsUrl="wss://api.example.com/chat"
/>
```

**Internal Composition:**
```svelte
<!-- CollaborativeChatMinimal.svelte -->
<script lang="ts">
  import { StreamingChat } from '@composable-svelte/code';
  import { MultiUserList, TypingIndicator, usePresenceTracking, useSyncConnection } from '../modules';

  // Compose modules
  $effect(() => {
    const cleanupPresence = usePresenceTracking(store, currentUserId);
    const { disconnect } = useSyncConnection(store, conversationId, wsUrl);

    return () => {
      cleanupPresence();
      disconnect();
    };
  });
</script>

<div class="collaborative-chat-minimal">
  <aside class="user-sidebar">
    <MultiUserList store={store} />
  </aside>

  <main class="chat-main">
    <StreamingChat store={store} variant="standard" />
    <TypingIndicator store={store} />
  </main>
</div>
```

---

### Variant 2: CollaborativeChat (Standard)

**Features:**
- Everything in Minimal
- Full presence (online/away/dnd)
- Live cursors
- Share dialog (basic)

**Usage:**
```svelte
<CollaborativeChatStandard
  store={chatStore}
  conversationId="conv-123"
  currentUserId="user-456"
  wsUrl="wss://api.example.com/chat"
  showCursors={true}
/>
```

---

### Variant 3: CollaborativeChat (Full)

**Features:**
- Everything in Standard
- Advanced sharing (invitations, permissions)
- Audit log viewer
- Custom status messages
- Permission management UI

**Usage:**
```svelte
<CollaborativeChatFull
  store={chatStore}
  conversationId="conv-123"
  currentUserId="user-456"
  wsUrl="wss://api.example.com/chat"
  permissions={permissions}
  onInviteUser={handleInvite}
  showAuditLog={true}
/>
```

---

## Custom Compositions

Users can build their own compositions using modules.

### Example: Chat with Only Typing Indicators

```svelte
<script lang="ts">
  import { StreamingChat } from '@composable-svelte/code';
  import { TypingModule } from '@composable-svelte/code/collaborative';
  import { createStore, combineReducers } from '@composable-svelte/core';

  const chatStore = createStore({
    initialState: {
      messages: [],
      typing: TypingModule.createTypingState()
    },
    reducer: combineReducers({
      messages: streamingChatReducer,
      typing: TypingModule.typingReducer
    })
  });

  let inputRef: HTMLTextAreaElement;

  $effect(() => {
    const cleanup = TypingModule.useTypingEmitter(
      chatStore,
      'user-123',
      inputRef
    );
    return cleanup;
  });
</script>

<div class="custom-chat">
  <StreamingChat store={chatStore} variant="minimal" />
  <TypingModule.TypingIndicator store={chatStore} />

  <textarea bind:this={inputRef} placeholder="Type a message..." />
</div>
```

---

### Example: User List Only (No Chat)

```svelte
<script lang="ts">
  import { MultiUserModule, PresenceModule } from '@composable-svelte/code/collaborative';
  import { createStore, combineReducers } from '@composable-svelte/core';

  const userStore = createStore({
    initialState: {
      users: MultiUserModule.createMultiUserState(),
      presence: PresenceModule.createPresenceState()
    },
    reducer: combineReducers({
      users: MultiUserModule.multiUserReducer,
      presence: PresenceModule.presenceReducer
    })
  });
</script>

<aside class="user-panel">
  <h2>Team Members</h2>
  <MultiUserModule.MultiUserList
    store={userStore}
    showPresence={true}
    showPermission={false}
  />
</aside>
```

---

### Example: Custom Cursor Visualization

```svelte
<script lang="ts">
  import { CursorModule } from '@composable-svelte/code/collaborative';
  import { CursorMarkerPrimitive } from '@composable-svelte/code/primitives';

  let scrollableRef: HTMLDivElement;

  $effect(() => {
    const cleanup = CursorModule.useCursorTracking(
      cursorStore,
      'user-123',
      scrollableRef
    );
    return cleanup;
  });
</script>

<div bind:this={scrollableRef} class="document-viewer">
  <!-- Custom document UI -->

  <!-- Custom cursor visualization -->
  {#each Array.from($cursorStore.cursors.values()) as cursor}
    <CursorMarkerPrimitive
      userName={cursor.userName}
      color={cursor.color}
      position={cursor.position.scrollTop / cursor.position.scrollHeight * 100}
      orientation="vertical"
      showLabel={true}
      class="custom-cursor"
    />
  {/each}
</div>

<style>
  .custom-cursor {
    /* Your custom cursor styling */
  }
</style>
```

---

## Reducer Composition Patterns

### Pattern 1: Feature-by-Feature Combination

Each feature has its own reducer, combined at the app level.

```typescript
import { combineReducers } from '@composable-svelte/core';
import {
  multiUserReducer,
  presenceReducer,
  typingReducer,
  cursorReducer,
  shareReducer,
  syncReducer
} from '@composable-svelte/code/collaborative';

const collaborativeReducer = combineReducers({
  users: multiUserReducer,
  presence: presenceReducer,
  typing: typingReducer,
  cursors: cursorReducer,
  sharing: shareReducer,
  sync: syncReducer
});

const store = createStore({
  initialState: {
    users: createMultiUserState(),
    presence: createPresenceState(),
    typing: createTypingState(),
    cursors: createCursorState(),
    sharing: createShareState(),
    sync: createSyncState()
  },
  reducer: collaborativeReducer
});
```

**Benefit:** Each feature is isolated, easy to add/remove.

---

### Pattern 2: Nested Collaboration State

Embed collaborative features under a `collaboration` key.

```typescript
interface AppState {
  messages: Message[];
  collaboration: {
    users: MultiUserState;
    presence: PresenceState;
    typing: TypingState;
  };
}

const appReducer = combineReducers({
  messages: streamingChatReducer,
  collaboration: combineReducers({
    users: multiUserReducer,
    presence: presenceReducer,
    typing: typingReducer
  })
});
```

**Benefit:** Clear separation between chat and collaboration concerns.

---

### Pattern 3: Single Collaborative Reducer

Merge all collaborative state into one reducer.

```typescript
interface CollaborativeState {
  users: Map<string, CollaborativeUser>;
  presence: Map<string, UserPresence>;
  typing: Map<string, TypingInfo>;
  cursors: Map<string, UserCursor>;
  sync: SyncStatus;
}

const collaborativeReducer: Reducer<CollaborativeState, CollaborativeAction> = (state, action, deps) => {
  switch (action.type) {
    case 'userJoined':
      // Update users and presence together
      return [
        {
          ...state,
          users: state.users.set(action.user.id, action.user),
          presence: state.presence.set(action.user.id, { status: 'online', lastActive: new Date() })
        },
        Effect.none()
      ];

    case 'userStartedTyping':
      // Update typing state
      // ...

    // Handle all collaborative actions in one place
  }
};
```

**Benefit:** Single source of truth, easier cross-feature coordination.

---

## Module Export Structure

Each module exports:

```typescript
// modules/multi-user/index.ts
export { multiUserReducer } from './reducer';
export { createMultiUserState } from './state';
export { MultiUserList } from './MultiUserList.svelte';
export { UserListItemPrimitive } from './UserListItemPrimitive.svelte';
export type * from './types';

// Barrel export for all modules
// modules/index.ts
export * as MultiUserModule from './multi-user';
export * as PresenceModule from './presence';
export * as TypingModule from './typing';
export * as CursorModule from './cursor';
export * as ShareModule from './share';
export * as SyncModule from './sync';
```

**Usage:**
```typescript
import { MultiUserModule, PresenceModule } from '@composable-svelte/code/collaborative';

const userStore = createStore({
  initialState: MultiUserModule.createMultiUserState(),
  reducer: MultiUserModule.multiUserReducer
});
```

---

## Dependency Injection

Modules accept dependencies via the reducer's `deps` parameter.

```typescript
interface CollaborativeDependencies {
  // WebSocket connection
  sendWebSocketMessage: (message: any) => void;

  // API calls
  inviteUser: (email: string, conversationId: string) => Promise<Invitation>;
  createShareLink: (conversationId: string, permission: PermissionLevel) => Promise<ShareLink>;

  // Utilities
  generateUserId: () => string;
  generateColor: (userId: string) => string;

  // Optional: Custom conflict resolver
  resolveConflict?: (local: any, remote: any) => any;
}

const store = createStore({
  initialState: createCollaborativeState(),
  reducer: collaborativeReducer,
  dependencies: {
    sendWebSocketMessage: (msg) => ws.send(JSON.stringify(msg)),
    inviteUser: async (email, convId) => await api.inviteUser(email, convId),
    createShareLink: async (convId, perm) => await api.createShareLink(convId, perm),
    generateUserId: () => `user-${crypto.randomUUID()}`,
    generateColor: (userId) => colorHash.hex(userId)
  }
});
```

---

## Testing Composability

### Unit Test Individual Primitives

```typescript
import { render } from '@testing-library/svelte';
import { PresenceBadgePrimitive } from '@composable-svelte/code/primitives';

test('PresenceBadgePrimitive shows online status', () => {
  const { container } = render(PresenceBadgePrimitive, {
    props: { status: 'online', size: 'md', showPulse: true }
  });

  expect(container.querySelector('.presence-badge')).toHaveClass('online');
  expect(container.querySelector('.pulse-animation')).toBeInTheDocument();
});
```

### Integration Test Modules

```typescript
import { createStore } from '@composable-svelte/core';
import { presenceReducer, createPresenceState } from '@composable-svelte/code/collaborative';

test('presenceReducer updates user status', () => {
  const store = createStore({
    initialState: createPresenceState(),
    reducer: presenceReducer
  });

  store.dispatch({ type: 'presenceUpdated', userId: 'user-1', status: 'away' });

  expect(store.state.users.get('user-1')?.status).toBe('away');
});
```

### Composition Test

```typescript
test('MultiUserList displays users with presence', () => {
  const store = createStore({
    initialState: {
      users: createMultiUserState(),
      presence: createPresenceState()
    },
    reducer: combineReducers({
      users: multiUserReducer,
      presence: presenceReducer
    })
  });

  // Add users
  store.dispatch({ type: 'userJoined', user: alice });
  store.dispatch({ type: 'userJoined', user: bob });

  // Update presence
  store.dispatch({ type: 'presenceUpdated', userId: 'alice', status: 'online' });

  const { getByText, getAllByRole } = render(MultiUserList, { props: { store } });

  expect(getAllByRole('listitem')).toHaveLength(2);
  expect(getByText('Alice Smith')).toBeInTheDocument();
});
```

---

## Performance Considerations

### Lazy Loading Modules

Only load modules when needed to reduce bundle size.

```typescript
// app.ts
const loadCollaborativeFeatures = async () => {
  const { MultiUserModule, PresenceModule } = await import('@composable-svelte/code/collaborative');

  // Initialize modules
  return { MultiUserModule, PresenceModule };
};

// In component
let collaborative: any = null;

$effect(() => {
  if (enableCollaboration) {
    loadCollaborativeFeatures().then(modules => {
      collaborative = modules;
    });
  }
});
```

### Debouncing Updates

Use debouncing for high-frequency updates (typing, cursor movement).

```typescript
import { debounce } from '@composable-svelte/core/utils';

const emitCursorUpdate = debounce((position: CursorPosition) => {
  store.dispatch({ type: 'cursorMoved', userId, position });
}, 200); // Max 5 updates/second
```

### Virtual Scrolling for User Lists

For conversations with 100+ users, use virtual scrolling.

```svelte
<script lang="ts">
  import { VirtualList } from '@composable-svelte/core/components';
  import { UserListItemPrimitive } from '@composable-svelte/code/primitives';

  export let users: CollaborativeUser[];
</script>

<VirtualList items={users} let:item>
  <UserListItemPrimitive user={item} showPresence={true} />
</VirtualList>
```

---

## Migration Path

For existing StreamingChat users, add collaboration gradually.

### Step 1: Add Typing Indicators Only

```typescript
import { StreamingChat } from '@composable-svelte/code';
import { TypingModule } from '@composable-svelte/code/collaborative';
import { combineReducers } from '@composable-svelte/core';

const store = createStore({
  initialState: {
    chat: createStreamingChatState(),
    typing: TypingModule.createTypingState()
  },
  reducer: combineReducers({
    chat: streamingChatReducer,
    typing: TypingModule.typingReducer
  })
});
```

### Step 2: Add User List

```typescript
const store = createStore({
  initialState: {
    chat: createStreamingChatState(),
    typing: TypingModule.createTypingState(),
    users: MultiUserModule.createMultiUserState()
  },
  reducer: combineReducers({
    chat: streamingChatReducer,
    typing: TypingModule.typingReducer,
    users: MultiUserModule.multiUserReducer
  })
});
```

### Step 3: Add Full Collaboration

```typescript
import { CollaborativeChatStandard } from '@composable-svelte/code/collaborative';

// Switch from StreamingChat to CollaborativeChatStandard
<CollaborativeChatStandard
  store={store}
  conversationId="conv-123"
  currentUserId="user-456"
/>
```

---

## Summary

### Composability Benefits

1. **Mix and Match:** Pick only the features you need
2. **No Vendor Lock-in:** Use primitives to build custom UIs
3. **Progressive Enhancement:** Add features incrementally
4. **Testing Isolation:** Test primitives, modules, and variants separately
5. **Bundle Size Optimization:** Tree-shake unused features
6. **Customization:** Override styles, swap implementations

### Architecture Layers

- **Primitives:** Reusable UI atoms (20+ components)
- **Modules:** Feature-specific logic + components (6 modules)
- **Variants:** Pre-configured compositions (3 variants)

### Key Principles

- **Headless Primitives:** Logic separated from presentation
- **Composable Hooks:** Reusable behavior (`usePresenceTracking`, `useTypingEmitter`)
- **Reducer Composition:** Combine features via `combineReducers`
- **Dependency Injection:** Flexible integration with any backend
- **Progressive Enhancement:** Start simple, add features as needed

---

**Document Version:** 1.0
**Last Updated:** 2025-11-07
**Author:** Claude Code
**Related:** COLLABORATIVE-FEATURES.md, FUTURE-ENHANCEMENTS.md

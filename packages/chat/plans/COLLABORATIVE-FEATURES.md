# StreamingChat - Collaborative Features Implementation Plan

## Overview

This document outlines the implementation plan for real-time collaboration features in StreamingChat, enabling multiple users to interact in the same conversation with live presence indicators and shared editing capabilities.

**Status:** 📋 Planning
**Priority:** High (for collaborative applications)
**Complexity:** High
**Dependencies:** WebSocket infrastructure, real-time sync system, conflict resolution

---

## Goals

1. Enable multiple users to participate in the same conversation simultaneously
2. Provide real-time awareness of other users' presence and actions
3. Implement robust conflict resolution for concurrent edits
4. Maintain performance with multiple active users
5. Ensure data consistency across all clients

---

## Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Collaborative Chat                        │
│                                                              │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Multi-User    │  │   Typing     │  │  Live Cursors   │ │
│  │  Chat Engine   │  │  Indicators  │  │  & Presence     │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Real-Time Sync Layer (WebSocket)              │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Permission    │  │  Conflict    │  │  State Sync     │ │
│  │  System        │  │  Resolution  │  │  Engine         │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Breakdown

### 1. Multi-User Chat

**Description:** Allow multiple users to participate in the same conversation simultaneously.

#### Requirements

**Functional:**
- Multiple users can view and send messages in the same conversation
- Each user has a unique identifier, avatar, and display name
- User-specific message colors/styling for visual distinction
- Permission controls (read-only, comment, edit, admin)
- User list sidebar showing all active participants

**Non-Functional:**
- Support up to 50 concurrent users per conversation
- Message delivery latency < 200ms
- No message loss or duplication
- Graceful degradation if WebSocket disconnects

#### State Structure

```typescript
interface CollaborativeState {
  conversationId: string;
  users: Map<string, CollaborativeUser>;
  messages: Message[];
  permissions: PermissionMap;
  syncStatus: 'connected' | 'disconnected' | 'syncing';
}

interface CollaborativeUser {
  id: string;
  name: string;
  avatar?: string;
  color: string; // Assigned color for messages
  presence: UserPresence;
  permissions: UserPermissions;
  lastSeen: Date;
}

interface UserPermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canManagePermissions: boolean;
}

interface PermissionMap {
  [userId: string]: UserPermissions;
}
```

#### Actions

```typescript
type CollaborativeAction =
  | { type: 'userJoined'; user: CollaborativeUser }
  | { type: 'userLeft'; userId: string }
  | { type: 'userUpdated'; userId: string; updates: Partial<CollaborativeUser> }
  | { type: 'permissionChanged'; userId: string; permissions: UserPermissions }
  | { type: 'messageReceived'; message: Message; fromUserId: string }
  | { type: 'messageSyncRequired'; messageIds: string[] };
```

#### Implementation Tasks

- [ ] **Task 1.1:** Design collaborative state schema
  - Define user model with avatar, name, color
  - Create permission system (read/write/admin roles)
  - Design message attribution (author ID, timestamp)

- [ ] **Task 1.2:** Implement user management reducer
  - Handle user join/leave events
  - Assign colors to users automatically
  - Update user presence status

- [ ] **Task 1.3:** Create UserList component
  - Display active participants with avatars
  - Show permission badges (read-only, editor, admin)
  - Support user filtering and search

- [ ] **Task 1.4:** Add user-specific message styling
  - Color-coded message bubbles per user
  - Avatar display in message header
  - Hover to show full user details

- [ ] **Task 1.5:** Implement permission checks
  - Disable message input for read-only users
  - Hide edit/delete buttons based on permissions
  - Show permission upgrade prompts

**Estimated Time:** 2-3 weeks

---

### 2. Typing Indicators

**Description:** Show real-time indicators when other users are composing messages.

#### Requirements

**Functional:**
- Display "User X is typing..." indicator below message list
- Support multiple simultaneous typing indicators
- Aggregate as "3 people are typing..." for 3+ users
- Timeout after 3 seconds of inactivity
- Don't show typing indicator for current user

**Non-Functional:**
- Typing updates debounced to max 1 per second
- Minimal network overhead (<1KB per update)
- Smooth animations for appearing/disappearing

#### State Structure

```typescript
interface TypingState {
  typingUsers: Map<string, TypingInfo>;
  typingTimeouts: Map<string, number>; // setTimeout IDs
}

interface TypingInfo {
  userId: string;
  userName: string;
  startedAt: Date;
}
```

#### Actions

```typescript
type TypingAction =
  | { type: 'userStartedTyping'; userId: string; userName: string }
  | { type: 'userStoppedTyping'; userId: string }
  | { type: 'typingTimeout'; userId: string };
```

#### Implementation Tasks

- [ ] **Task 2.1:** Create typing indicator reducer
  - Track typing users with timestamps
  - Auto-remove after 3s timeout
  - Handle typing start/stop events

- [ ] **Task 2.2:** Implement TypingIndicator component
  - Animated dot animation (⋯)
  - Multiple user aggregation
  - Smooth fade in/out transitions

- [ ] **Task 2.3:** Add typing event emission
  - Emit on input keypress (debounced)
  - Stop on message send
  - Stop on input blur/unmount

- [ ] **Task 2.4:** Wire up WebSocket events
  - Send typing start/stop to server
  - Receive and process remote typing events
  - Handle connection drops gracefully

**Estimated Time:** 1 week

---

### 3. Live Cursors

**Description:** Show where other users are scrolled/focused in the conversation.

#### Requirements

**Functional:**
- Display user cursor/viewport position in conversation
- User-specific cursor colors matching their message color
- Smooth cursor movement animations
- Hide cursors for inactive users (no activity for 30s)
- Optional: Show user's selected message

**Non-Functional:**
- Cursor updates debounced to max 5 per second
- Smooth interpolated animations between positions
- Minimal visual clutter (small, unobtrusive)

#### State Structure

```typescript
interface CursorState {
  cursors: Map<string, UserCursor>;
  cursorTimeouts: Map<string, number>;
}

interface UserCursor {
  userId: string;
  userName: string;
  color: string;
  position: CursorPosition;
  lastUpdated: Date;
}

interface CursorPosition {
  scrollTop: number; // Scroll position in conversation
  scrollHeight: number; // Total scrollable height
  viewportHeight: number; // User's viewport height
  focusedMessageId?: string; // Currently focused message
}
```

#### Actions

```typescript
type CursorAction =
  | { type: 'cursorMoved'; userId: string; position: CursorPosition }
  | { type: 'cursorInactive'; userId: string }
  | { type: 'cursorFocusChanged'; userId: string; messageId: string | null };
```

#### Implementation Tasks

- [ ] **Task 3.1:** Design cursor visualization
  - Create cursor indicator UI (pill with user name)
  - Position in scrollbar or conversation margin
  - Color-coded per user

- [ ] **Task 3.2:** Implement cursor tracking
  - Track local scroll position
  - Emit scroll updates (debounced)
  - Calculate relative position (%)

- [ ] **Task 3.3:** Create LiveCursors component
  - Render all active user cursors
  - Smooth position interpolation
  - Show/hide based on activity

- [ ] **Task 3.4:** Add cursor tooltips
  - Hover to see user details
  - Show focused message title
  - Click to jump to user's position

**Estimated Time:** 1-2 weeks

---

### 4. User Presence

**Description:** Track and display user online/offline status with activity indicators.

#### Requirements

**Functional:**
- Online/Offline/Away/Do-Not-Disturb states
- "Last seen" timestamps for offline users
- Automatic away detection after 5 minutes of inactivity
- Automatic online detection on user activity
- Manual status setting (Do-Not-Disturb)

**Non-Functional:**
- Heartbeat every 30 seconds to maintain online status
- Graceful handling of connection issues
- Status updates synchronized across all clients

#### State Structure

```typescript
interface PresenceState {
  users: Map<string, UserPresence>;
  heartbeatInterval: number | null;
}

interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastActive: Date;
  lastSeen: Date;
  customStatus?: string; // Optional status message
}

type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';
```

#### Actions

```typescript
type PresenceAction =
  | { type: 'presenceUpdated'; userId: string; status: PresenceStatus }
  | { type: 'userActivityDetected'; userId: string }
  | { type: 'heartbeatSent' }
  | { type: 'customStatusSet'; userId: string; status: string };
```

#### Implementation Tasks

- [ ] **Task 4.1:** Implement presence tracking system
  - Heartbeat mechanism (30s interval)
  - Activity detection (mouse/keyboard)
  - Auto-away after 5 minutes idle

- [ ] **Task 4.2:** Create PresenceIndicator component
  - Status badge (green/yellow/red/gray)
  - Tooltip with "Last seen" time
  - Animated pulse for online status

- [ ] **Task 4.3:** Add presence to user list
  - Status badges in UserList
  - Sort users by status (online first)
  - Filter by presence status

- [ ] **Task 4.4:** Implement custom status
  - Status message input UI
  - Emoji support for status
  - Preset status options

**Estimated Time:** 1 week

---

### 5. Shared Conversations

**Description:** Enable conversation sharing with granular permission controls.

#### Requirements

**Functional:**
- Generate shareable links for conversations
- Permission levels: view-only, comment, edit, admin
- Invite users by email or username
- Revoke access at any time
- Public/private conversation modes
- Audit trail for shared conversations (who accessed when)

**Non-Functional:**
- Share links expire after configurable time (default: never)
- Secure token-based authentication
- Rate limiting on invitations (prevent spam)

#### State Structure

```typescript
interface ShareState {
  conversationId: string;
  shareLinks: ShareLink[];
  invitations: Invitation[];
  auditLog: AuditEntry[];
}

interface ShareLink {
  id: string;
  url: string;
  permission: PermissionLevel;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string;
  accessCount: number;
}

interface Invitation {
  id: string;
  email?: string;
  userId?: string;
  permission: PermissionLevel;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  sentAt: Date;
  sentBy: string;
}

interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  timestamp: Date;
  metadata?: Record<string, any>;
}

type AuditAction =
  | 'conversation_shared'
  | 'user_invited'
  | 'access_granted'
  | 'access_revoked'
  | 'permission_changed'
  | 'message_sent'
  | 'message_edited'
  | 'message_deleted';

type PermissionLevel = 'view' | 'comment' | 'edit' | 'admin';
```

#### Actions

```typescript
type ShareAction =
  | { type: 'shareLinkCreated'; link: ShareLink }
  | { type: 'shareLinkRevoked'; linkId: string }
  | { type: 'invitationSent'; invitation: Invitation }
  | { type: 'invitationAccepted'; invitationId: string; userId: string }
  | { type: 'invitationDeclined'; invitationId: string }
  | { type: 'accessRevoked'; userId: string }
  | { type: 'permissionUpdated'; userId: string; permission: PermissionLevel }
  | { type: 'auditEntryAdded'; entry: AuditEntry };
```

#### Implementation Tasks

- [ ] **Task 5.1:** Design share link system
  - Generate secure tokens
  - Configurable expiration times
  - Track link usage (access count)

- [ ] **Task 5.2:** Create ShareDialog component
  - Invite by email/username
  - Permission dropdown (view/comment/edit/admin)
  - Copy share link button
  - Manage existing shares UI

- [ ] **Task 5.3:** Implement invitation flow
  - Send email notifications
  - Accept/decline invitation UI
  - Redirect to conversation after accept

- [ ] **Task 5.4:** Build access control system
  - Verify permissions on every action
  - Show permission-appropriate UI
  - Display "Request Access" for denied actions

- [ ] **Task 5.5:** Add audit trail viewer
  - Filterable audit log (by user, action, date)
  - Export audit log to CSV
  - Admin-only access to audit log

**Estimated Time:** 2-3 weeks

---

## WebSocket Infrastructure

### Real-Time Sync System

The collaborative features depend on a robust WebSocket infrastructure for real-time communication.

#### Requirements

1. **Reliable message delivery:** No message loss, exactly-once semantics
2. **Conflict resolution:** Operational Transformation or CRDTs for concurrent edits
3. **Reconnection handling:** Automatic reconnect with state sync
4. **Scalability:** Support multiple conversation rooms, user-to-room subscriptions
5. **Security:** Authentication, authorization, rate limiting

#### WebSocket Event Schema

```typescript
// Client → Server
type ClientEvent =
  | { type: 'join_conversation'; conversationId: string; userId: string }
  | { type: 'leave_conversation'; conversationId: string; userId: string }
  | { type: 'send_message'; conversationId: string; message: Message }
  | { type: 'start_typing'; conversationId: string; userId: string }
  | { type: 'stop_typing'; conversationId: string; userId: string }
  | { type: 'cursor_moved'; conversationId: string; userId: string; position: CursorPosition }
  | { type: 'presence_update'; userId: string; status: PresenceStatus }
  | { type: 'heartbeat'; userId: string };

// Server → Client
type ServerEvent =
  | { type: 'user_joined'; conversationId: string; user: CollaborativeUser }
  | { type: 'user_left'; conversationId: string; userId: string }
  | { type: 'message_received'; conversationId: string; message: Message; fromUserId: string }
  | { type: 'user_typing'; conversationId: string; userId: string; userName: string }
  | { type: 'user_stopped_typing'; conversationId: string; userId: string }
  | { type: 'cursor_update'; conversationId: string; userId: string; position: CursorPosition }
  | { type: 'presence_changed'; userId: string; status: PresenceStatus }
  | { type: 'sync_required'; conversationId: string; reason: string }
  | { type: 'error'; code: string; message: string };
```

#### Implementation Tasks

- [ ] **Task WS-1:** Set up WebSocket client wrapper
  - Connection management (connect/disconnect/reconnect)
  - Event emitter for incoming messages
  - Automatic reconnection with exponential backoff

- [ ] **Task WS-2:** Implement room subscription system
  - Subscribe to conversation on join
  - Unsubscribe on leave
  - Handle server-initiated unsubscribe (kicked out)

- [ ] **Task WS-3:** Build conflict resolution
  - Implement Operational Transformation for text edits
  - Or use CRDTs (Yjs, Automerge) for complex state
  - Ensure eventual consistency

- [ ] **Task WS-4:** Add state synchronization
  - Full state sync on reconnection
  - Delta sync for efficient updates
  - Optimistic updates with rollback on conflict

- [ ] **Task WS-5:** Implement server-side logic
  - Room management (create, join, leave, destroy)
  - Message broadcasting to room members
  - Permission enforcement
  - Rate limiting and abuse prevention

**Estimated Time:** 3-4 weeks

---

## Testing Strategy

### Unit Tests
- [ ] Test each reducer in isolation with mock actions
- [ ] Test permission logic (read/write/admin checks)
- [ ] Test typing timeout mechanism
- [ ] Test presence state transitions
- [ ] Test cursor position calculations

### Integration Tests
- [ ] Test WebSocket connection/disconnection scenarios
- [ ] Test multi-user message flow (send, receive, sync)
- [ ] Test conflict resolution with concurrent edits
- [ ] Test permission changes propagating to UI
- [ ] Test cursor synchronization across clients

### E2E Tests
- [ ] Test full collaborative session (2+ users)
- [ ] Test typing indicators appearing/disappearing
- [ ] Test live cursors following scroll position
- [ ] Test share link flow (invite → accept → collaborate)
- [ ] Test access revocation (user kicked mid-session)

### Performance Tests
- [ ] Load test with 50 concurrent users in one conversation
- [ ] Measure message delivery latency (target: <200ms)
- [ ] Test memory usage with long conversations (1000+ messages)
- [ ] Test reconnection recovery time (target: <2s)

---

## Security Considerations

1. **Authentication:** Verify user identity via JWT tokens in WebSocket handshake
2. **Authorization:** Check permissions on every action (client-side + server-side)
3. **Rate Limiting:** Prevent spam (max 10 messages/minute, 1 typing update/second)
4. **Input Validation:** Sanitize all user inputs (names, messages, status)
5. **XSS Prevention:** Escape all user-generated content in UI
6. **CSRF Protection:** Use CSRF tokens for invitation emails
7. **Audit Trail:** Log all sensitive actions for security review

---

## Rollout Plan

### Phase 1: Foundation (Weeks 1-4)
- Set up WebSocket infrastructure
- Implement basic multi-user state synchronization
- Create user list and permission system

### Phase 2: Presence Indicators (Weeks 5-7)
- Add typing indicators
- Implement user presence tracking
- Create live cursor visualization

### Phase 3: Sharing & Permissions (Weeks 8-10)
- Build share link generation
- Implement invitation system
- Add audit trail logging

### Phase 4: Polish & Testing (Weeks 11-12)
- Comprehensive testing (unit, integration, E2E)
- Performance optimization
- Bug fixes and edge case handling

### Phase 5: Beta Launch (Week 13)
- Soft launch with limited users
- Monitor performance and stability
- Gather user feedback

### Phase 6: General Availability (Week 14+)
- Public release
- Documentation and examples
- Ongoing maintenance and improvements

---

## Dependencies

### External Libraries
- **WebSocket Client:** `ws` or native WebSocket API
- **Conflict Resolution:** `yjs` (CRDT library) or custom OT implementation
- **State Sync:** Custom implementation using Composable Architecture patterns
- **Avatar Generation:** `@dicebear/avatars` for default avatars
- **Color Assignment:** `color-hash` for consistent user colors

### Backend Requirements
- WebSocket server (Node.js, Elixir, Go, etc.)
- Message queue for reliable delivery (Redis, RabbitMQ)
- Database for conversation persistence (PostgreSQL, MongoDB)
- Authentication service (JWT issuer)
- Email service for invitations (SendGrid, SES)

---

## Open Questions

1. **Conflict Resolution Strategy:** Should we use Operational Transformation or CRDTs?
   - OT is simpler but requires careful implementation
   - CRDTs are more robust but heavier (larger bundle size)

2. **Message Delivery Guarantees:** Do we need exactly-once or at-least-once semantics?
   - At-least-once is easier but requires deduplication
   - Exactly-once is harder but cleaner

3. **Scalability Target:** What's the max number of users per conversation?
   - 10-20 users: Simple WebSocket broadcast
   - 50-100 users: Need selective updates (only send to active viewers)
   - 100+ users: Requires pub/sub architecture

4. **Offline Support:** Should we queue actions when disconnected?
   - Yes: Better UX, more complex state management
   - No: Simpler, but users can't send messages offline

---

## Success Metrics

- **Performance:** Message latency < 200ms (p95)
- **Reliability:** 99.9% uptime for WebSocket connections
- **Scalability:** Support 50 concurrent users per conversation
- **User Engagement:** 30% of conversations have 2+ active users
- **Feature Adoption:** 50% of users try collaborative features within 1 week

---

## Next Steps

1. **Architecture Review:** Review this plan with team, finalize technical approach
2. **Spike Tasks:** Build proof-of-concept for WebSocket sync and conflict resolution
3. **Backend Coordination:** Align with backend team on WebSocket API design
4. **UI Mockups:** Create design mockups for user list, typing indicators, cursors
5. **Implementation Kickoff:** Start Phase 1 development

---

## Resources

- [Yjs Documentation](https://docs.yjs.dev/) - CRDT library for collaborative editing
- [Operational Transformation FAQ](https://operational-transformation.github.io/) - OT primer
- [WebSocket Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers) - MDN guide
- [Real-Time Collaboration Patterns](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) - Figma's approach

---

**Document Version:** 1.0
**Last Updated:** 2025-11-07
**Author:** Claude Code
**Status:** Draft - Awaiting Review

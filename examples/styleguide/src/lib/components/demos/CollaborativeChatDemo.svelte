<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import {
		collaborativeReducer,
		createInitialCollaborativeState,
		generateRandomUserColor,
		PresenceBadge,
		PresenceAvatarStack,
		PresenceList,
		TypingIndicator,
		TypingUsersList,
		getTypingUsers,
		getActiveUsers,
		type CollaborativeUser,
		type UserPresence,
		type CollaborativeAction,
		type CollaborativeDependencies,
		type CollaborativeStreamingChatState
	} from '@composable-svelte/chat';

	// Mock current user
	const currentUserId = 'user-1';
	const currentUser: CollaborativeUser = {
		id: currentUserId,
		name: 'You',
		color: generateRandomUserColor(currentUserId),
		presence: 'active',
		typing: null,
		cursor: null,
		permissions: {
			canSendMessages: true,
			canEditMessages: true,
			canDeleteMessages: true,
			canSeePresence: true,
			canSeeTyping: true,
			isAdmin: false
		},
		lastSeen: Date.now(),
		lastHeartbeat: Date.now()
	};

	// Mock other users
	const mockUsers: CollaborativeUser[] = [
		{
			id: 'user-2',
			name: 'Alice Johnson',
			avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
			color: generateRandomUserColor('user-2'),
			presence: 'active',
			typing: null,
			cursor: null,
			permissions: {
				canSendMessages: true,
				canEditMessages: true,
				canDeleteMessages: true,
				canSeePresence: true,
				canSeeTyping: true,
				isAdmin: false
			},
			lastSeen: Date.now(),
			lastHeartbeat: Date.now()
		},
		{
			id: 'user-3',
			name: 'Bob Smith',
			color: generateRandomUserColor('user-3'),
			presence: 'idle',
			typing: null,
			cursor: null,
			permissions: {
				canSendMessages: true,
				canEditMessages: true,
				canDeleteMessages: true,
				canSeePresence: true,
				canSeeTyping: true,
				isAdmin: false
			},
			lastSeen: Date.now() - 120000,
			lastHeartbeat: Date.now() - 120000
		},
		{
			id: 'user-4',
			name: 'Charlie Davis',
			avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
			color: generateRandomUserColor('user-4'),
			presence: 'away',
			typing: null,
			cursor: null,
			permissions: {
				canSendMessages: true,
				canEditMessages: true,
				canDeleteMessages: true,
				canSeePresence: true,
				canSeeTyping: true,
				isAdmin: false
			},
			lastSeen: Date.now() - 300000,
			lastHeartbeat: Date.now() - 300000
		}
	];

	// Mock WebSocket dependency
	const mockDeps: CollaborativeDependencies = {
		connectWebSocket: (conversationId, userId, onMessage, onConnectionChange) => {
			console.log('[Mock] Connecting to WebSocket:', conversationId, userId);
			onConnectionChange({ status: 'connected', connectedAt: Date.now() });
			return () => console.log('[Mock] Disconnecting from WebSocket');
		},
		sendWebSocketMessage: async (message) => {
			console.log('[Mock] Sending message:', message);
		},
		generateId: () => crypto.randomUUID(),
		getTimestamp: () => Date.now(),
		generateUserColor: generateRandomUserColor
	};

	// Create collaborative store
	const store = createStore<CollaborativeStreamingChatState, CollaborativeAction, CollaborativeDependencies>({
		initialState: createInitialCollaborativeState(),
		reducer: collaborativeReducer,
		dependencies: mockDeps
	});

	// Simulate users joining
	$effect(() => {
		// Add current user
		store.dispatch({ type: 'userJoined', user: currentUser });

		// Add mock users
		for (const user of mockUsers) {
			store.dispatch({ type: 'userJoined', user });
		}

		// Simulate connection
		store.dispatch({
			type: 'connectToConversation',
			conversationId: 'demo-conversation',
			userId: currentUserId
		});
	});

	// Get derived state
	const users = $derived($store.users);
	const activeUsers = $derived(getActiveUsers(users, currentUserId));
	const typingUsers = $derived(getTypingUsers(users, currentUserId, 'message'));

	// Demo controls
	let selectedUserId = $state('user-2');

	function toggleTyping() {
		const user = users.get(selectedUserId);
		if (!user) return;

		if (user.typing) {
			store.dispatch({ type: 'userStoppedTyping', userId: selectedUserId });
		} else {
			store.dispatch({
				type: 'userStartedTyping',
				userId: selectedUserId,
				info: {
					target: 'message',
					startedAt: Date.now(),
					lastUpdate: Date.now()
				}
			});
		}
	}

	function cyclePresence() {
		const user = users.get(selectedUserId);
		if (!user) return;

		const presenceOrder: UserPresence[] = ['active', 'idle', 'away', 'offline'];
		const currentIndex = presenceOrder.indexOf(user.presence);
		const nextPresence = presenceOrder[(currentIndex + 1) % presenceOrder.length];

		store.dispatch({
			type: 'userPresenceChanged',
			userId: selectedUserId,
			presence: nextPresence
		});
	}
</script>

<div class="page">
	<header class="page-header">
		<h1>Collaborative Chat Demo</h1>
		<p class="subtitle">
			Real-time presence tracking, typing indicators, and live cursors for multi-user chat.
		</p>
	</header>

	<div class="demo-container">
		<!-- Presence Tracking -->
		<section class="demo-section">
			<h2>Presence Tracking</h2>
			<p>Shows who's online with real-time status updates.</p>

			<div class="demo-variants">
				<div class="variant">
					<h3>Presence Badge</h3>
					<div class="badge-examples">
						<PresenceBadge presence="active" showText />
						<PresenceBadge presence="idle" showText />
						<PresenceBadge presence="away" showText />
						<PresenceBadge presence="offline" showText />
					</div>
				</div>

				<div class="variant">
					<h3>Avatar Stack</h3>
					<PresenceAvatarStack users={activeUsers} maxVisible={5} />
				</div>
			</div>

			<div class="variant full-width">
				<h3>User List</h3>
				<PresenceList users={activeUsers} groupByPresence={true} />
			</div>
		</section>

		<!-- Typing Indicators -->
		<section class="demo-section">
			<h2>Typing Indicators</h2>
			<p>Shows who's typing with animated dots.</p>

			<div class="demo-variants">
				<div class="variant">
					<h3>Simple Indicator</h3>
					<TypingIndicator users={typingUsers} />
					{#if typingUsers.length === 0}
						<p class="empty-state">No one is typing</p>
					{/if}
				</div>

				<div class="variant">
					<h3>Detailed List</h3>
					<TypingUsersList users={typingUsers} />
					{#if typingUsers.length === 0}
						<p class="empty-state">No one is typing</p>
					{/if}
				</div>
			</div>
		</section>

		<!-- Demo Controls -->
		<section class="demo-section">
			<h2>Demo Controls</h2>
			<p>Simulate user actions to see real-time updates.</p>

			<div class="controls">
				<div class="control-group">
					<label for="user-select">Select User:</label>
					<select id="user-select" bind:value={selectedUserId}>
						{#each mockUsers as user (user.id)}
							<option value={user.id}>{user.name}</option>
						{/each}
					</select>
				</div>

				<div class="control-actions">
					<button onclick={toggleTyping}>
						{users.get(selectedUserId)?.typing ? 'Stop Typing' : 'Start Typing'}
					</button>
					<button onclick={cyclePresence}> Cycle Presence </button>
				</div>
			</div>

			<div class="status-info">
				<p><strong>Connection:</strong> {$store.connection.status}</p>
				<p><strong>Users Online:</strong> {activeUsers.length}</p>
				<p><strong>Users Typing:</strong> {typingUsers.length}</p>
			</div>
		</section>

		<!-- Implementation Notes -->
		<section class="demo-section">
			<h2>Implementation Notes</h2>
			<div class="info-card">
				<h3>Features</h3>
				<ul>
					<li>✅ Real-time presence tracking (active, idle, away, offline)</li>
					<li>✅ Typing indicators with smart aggregation</li>
					<li>✅ WebSocket state machine with reconnection</li>
					<li>✅ Optimistic updates with rollback</li>
					<li>✅ Single source of truth state management</li>
					<li>✅ Composable primitives for custom UIs</li>
					<li>⏳ Live cursors (coming soon)</li>
					<li>⏳ CRDT integration for conflict resolution</li>
				</ul>

				<h3>Usage Example</h3>
				<pre class="code-block"><code>{`import { createStore } from '@composable-svelte/core';
import {
  collaborativeReducer,
  createInitialCollaborativeState,
  PresenceAvatarStack,
  TypingIndicator,
  getActiveUsers,
  getTypingUsers
} from '@composable-svelte/code';

const store = createStore({
  initialState: createInitialCollaborativeState(),
  reducer: collaborativeReducer,
  dependencies: {
    connectWebSocket: (id, userId, onMsg, onChange) => {
      // Your WebSocket connection
    },
    sendWebSocketMessage: async (msg) => {
      // Send to server
    }
  }
});

// Get active users and typing users
const activeUsers = getActiveUsers($store.users, currentUserId);
const typingUsers = getTypingUsers($store.users, currentUserId);

// Render
<PresenceAvatarStack users={activeUsers} />
<TypingIndicator users={typingUsers} />`}</code></pre>
			</div>
		</section>
	</div>
</div>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px;
	}

	.page-header {
		margin-bottom: 48px;
	}

	.page-header h1 {
		font-size: 32px;
		font-weight: 700;
		margin: 0 0 8px 0;
	}

	.subtitle {
		font-size: 18px;
		color: #666;
		margin: 0;
	}

	.demo-container {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.demo-section {
		background: white;
		border-radius: 12px;
		padding: 24px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
	}

	.demo-section h2 {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 8px 0;
	}

	.demo-section h3 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 12px 0;
	}

	.demo-section p {
		color: #666;
		margin: 0 0 24px 0;
	}

	.demo-variants {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 24px;
	}

	.variant {
		padding: 16px;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
	}

	.variant.full-width {
		grid-column: 1 / -1;
	}

	.badge-examples {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.empty-state {
		color: #999;
		font-style: italic;
		font-size: 14px;
		margin-top: 12px;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		background: #f9f9f9;
		border-radius: 8px;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.control-group label {
		font-weight: 500;
		min-width: 100px;
	}

	.control-group select {
		flex: 1;
		padding: 8px 12px;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		font-size: 14px;
	}

	.control-actions {
		display: flex;
		gap: 12px;
	}

	.control-actions button {
		padding: 10px 20px;
		background: #007aff;
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.control-actions button:hover {
		background: #0056b3;
	}

	.status-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px;
		padding: 16px;
		background: #f5f5f5;
		border-radius: 8px;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
		font-size: 14px;
		margin-top: 16px;
	}

	.status-info p {
		margin: 0;
	}

	.info-card {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.info-card ul {
		margin: 0;
		padding-left: 24px;
	}

	.info-card li {
		margin-bottom: 8px;
		line-height: 1.6;
	}

	.code-block {
		margin: 0;
		padding: 16px;
		background: #1e1e1e;
		color: #d4d4d4;
		border-radius: 8px;
		overflow-x: auto;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
		font-size: 13px;
		line-height: 1.5;
	}

	@media (prefers-color-scheme: dark) {
		.demo-section {
			background: #2a2a2a;
		}

		.demo-section h2,
		.demo-section h3 {
			color: #e0e0e0;
		}

		.demo-section p {
			color: #aaa;
		}

		.variant {
			border-color: #444;
		}

		.controls {
			background: #1e1e1e;
		}

		.control-group select {
			background: #2a2a2a;
			color: #e0e0e0;
			border-color: #444;
		}

		.status-info {
			background: #1e1e1e;
			color: #d4d4d4;
		}
	}
</style>

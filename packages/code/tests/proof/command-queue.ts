/**
 * B1 proof, Option A (revised after independent review): a generic ordered
 * command queue carried in state. TEST-ONLY; nothing here is exported.
 *
 * What the review changed, and why:
 *
 * - **Correlation by entry identity, not by id.** A parent may write a fresh
 *   child state under the same key without `replaceOn` (same owner, same view
 *   attachment). Per-state ids then restart at 1 while an id cursor stays high,
 *   and the new commands were silently skipped. The consumer now remembers the
 *   entry *objects* it handled, and an acknowledgement names the exact entry it
 *   covers. An ack whose entry is no longer in the queue (reset, replacement,
 *   lagging behind a later reset) is stale and returns the identical state. Ids
 *   stay only as diagnostics and never decide execution.
 * - **Honest overflow: reject the new command, never evict.** A full queue
 *   refuses the incoming command and counts it in `rejected`. Nothing already
 *   queued is ever removed except by an acknowledgement. `rejected` counts
 *   commands that were never queued and so never run, so it cannot claim a drop
 *   that did not happen. The review's counter-example was an attached 6-command
 *   burst at capacity 3: every command ran, yet 3 were reported dropped. The
 *   cost is now visible instead: capacity also counts executed-but-unacknowledged
 *   entries, so a burst larger than capacity inside one drain loses its tail,
 *   and reports it.
 * - **Explicit, counted discard.** A discarded command (drop policy,
 *   non-replayable under buffer) is acknowledged with the count the consumer
 *   discarded, so `discarded` is a report from the only party that knows.
 */

/** A queued command. The object identity is the correlation key. */
export interface CommandEntry<C> {
	/** Diagnostic sequence number within this queue instance; never used for correlation. */
	readonly id: number;
	readonly command: C;
}

export interface CommandQueue<C> {
	readonly entries: readonly CommandEntry<C>[];
	readonly nextId: number;
	/** Commands refused because the queue was full. They were never queued and never run. */
	readonly rejected: number;
	/** Queued commands the consumer acknowledged without running them. */
	readonly discarded: number;
}

export interface CommandAck<C> {
	readonly type: 'commandsAcknowledged';
	/** The last handled entry, by identity. Everything up to and including it is trimmed. */
	readonly through: CommandEntry<C>;
	/** How many of the trimmed entries the consumer discarded rather than ran. */
	readonly discarded: number;
}

export const DEFAULT_COMMAND_CAPACITY = 64;

export function emptyCommandQueue<C>(): CommandQueue<C> {
	return { entries: [], nextId: 1, rejected: 0, discarded: 0 };
}

/** Append in order up to `capacity`; refuse and count the rest. */
export function enqueueCommands<C>(queue: CommandQueue<C>, commands: readonly C[], capacity: number): CommandQueue<C> {
	if (commands.length === 0) return queue;
	const room = Math.max(0, capacity - queue.entries.length);
	const accepted = commands.slice(0, room).map((command, index) => ({ id: queue.nextId + index, command }));
	return {
		entries: accepted.length ? [...queue.entries, ...accepted] : queue.entries,
		nextId: queue.nextId + accepted.length,
		rejected: queue.rejected + (commands.length - accepted.length),
		discarded: queue.discarded
	};
}

/** Trim through the named entry. Identity-preserving (no notification) when it is not queued. */
export function acknowledgeCommands<C>(queue: CommandQueue<C>, ack: CommandAck<C>): CommandQueue<C> {
	const index = queue.entries.indexOf(ack.through);
	if (index < 0) return queue;
	const trimmed = index + 1;
	return {
		...queue,
		entries: queue.entries.slice(trimmed),
		discarded: queue.discarded + Math.min(Math.max(0, Math.trunc(ack.discarded)), trimmed)
	};
}

/**
 * What an attachment needs from a view. A `ChildView<S, A>` whose `A` includes
 * `CommandAck<C>` satisfies it structurally; so does a standalone `Store`.
 */
export interface CommandQueueSource<S, C> {
	readonly state: S | undefined;
	subscribe(listener: (state: S | undefined) => void): () => void;
	dispatch(action: CommandAck<C>): void;
}

export interface CommandQueueOptions<S, C> {
	/**
	 * What happens to commands that arrive while no native view exists:
	 * - `drop` (default): acknowledged as discarded, never run.
	 * - `buffer`: kept (bounded by capacity) and run at attach, except those
	 *   `replayable` refuses, which are discarded.
	 */
	readonly unattached?: 'drop' | 'buffer';
	/** Under `buffer`, which commands may run late. Default: all. */
	readonly replayable?: (command: C) => boolean;
	/**
	 * Called on every pass with the committed state, before any command runs,
	 * while attached. State-driven writes (the editor value) go here, so a write
	 * reduced before a command reaches the native view before that command.
	 */
	readonly beforeCommands?: (state: S) => void;
}

export interface CommandQueueBinding<C> {
	/** The native view now exists: apply the unattached policy to the backlog, then drain. */
	attach(execute: (command: C, entry: CommandEntry<C>) => void): void;
	/** Unsubscribe. Safe to call more than once. */
	dispose(): void;
}

/**
 * One binding per view attachment. `source` must be the view captured at
 * mount: its acks then go to that owner, and core refuses them once the owner
 * is retired or replaced.
 *
 * Unattached means "bound, but no native view yet" (async creation) and also
 * the backlog found when a binding is created. With `drop`, both are discarded
 * as soon as the binding sees them; nothing unmounted ever acknowledges, so an
 * owner with no view at all accumulates up to capacity and then rejects.
 */
export function bindCommandQueue<S, C>(
	source: CommandQueueSource<S, C>,
	read: (state: S) => CommandQueue<C>,
	options: CommandQueueOptions<S, C> = {}
): CommandQueueBinding<C> {
	const unattached = options.unattached ?? 'drop';
	const replayable = options.replayable ?? (() => true);
	const handled = new WeakSet<CommandEntry<C>>();
	/** Under `buffer`: what was waiting when the native view attached. */
	let backlog = new WeakSet<CommandEntry<C>>();
	let execute: ((command: C, entry: CommandEntry<C>) => void) | null = null;
	let draining = false;
	let again = false;
	let disposed = false;

	const drain = () => {
		if (disposed) return;
		// Re-entrant notifications (a command makes the native view dispatch) fold
		// into the running pass instead of nesting.
		if (draining) {
			again = true;
			return;
		}
		draining = true;
		let last: CommandEntry<C> | undefined;
		let discarded = 0;
		try {
			do {
				again = false;
				const state = source.state;
				if (state === undefined) break;
				if (execute) options.beforeCommands?.(state);
				for (const entry of read(state).entries) {
					if (disposed) break;
					if (handled.has(entry)) continue;
					if (!execute && unattached === 'buffer') break;
					// Mark before running: re-entry must never run this entry again.
					handled.add(entry);
					last = entry;
					if (execute && !(backlog.has(entry) && !replayable(entry.command))) execute(entry.command, entry);
					else discarded += 1;
				}
			} while (again && !disposed);
		} finally {
			draining = false;
		}
		if (last && !disposed) source.dispatch({ type: 'commandsAcknowledged', through: last, discarded });
	};

	const unsubscribe = source.subscribe(() => drain());

	return {
		attach(run) {
			if (disposed || execute) return;
			const state = source.state;
			if (unattached === 'buffer' && state !== undefined) backlog = new WeakSet(read(state).entries);
			execute = run;
			drain();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			execute = null;
			unsubscribe();
		}
	};
}

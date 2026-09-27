/**
 * Live media handoff for fluid-motion runs.
 *
 * A `VideoEmbed` registers its own `<iframe>` while it owns it. When a run
 * represents that iframe and its feature retires (`retire()`, at the route's
 * `beforeRemoval`: business authority already revoked, Svelte removal not yet
 * done), this provider moves the *same* browsing context — state-preservingly,
 * with `Element.prototype.moveBefore` — into its inert representation. Nothing
 * reloads and no second player is created.
 *
 * Then, within the same commit (the claim window):
 * - a destination `VideoEmbed` with the same explicit `mediaKey` and a
 *   compatible configuration claims the player before creating its own, and
 *   becomes its semantic owner — audio continues, input is restored; or
 * - nobody claims it: an explicitly opted-in player API mutes it and it keeps
 *   playing as decoration (`playerControl="player-api"`), otherwise it is
 *   disposed at once and the representation settles static. Decoration never
 *   prolongs audio.
 *
 * Engines without `moveBefore` are declined: the framework's placeholder
 * applies, honestly static.
 */

import type { VideoPlatform } from './types.js';

// ---------------------------------------------------------------------------
// Provider contract: a structural copy of core's `RepresentationProvider`
// family (`@composable-svelte/core/application/motion`), as graphics does —
// the supported peer range predates it.
// ---------------------------------------------------------------------------

export interface MediaRepresentationContext {
	readonly document: Document;
	readonly signal: AbortSignal;
	readonly reducedMotion: boolean;
	diagnose(reason: string): void;
}

export interface MediaRetainedRenderer {
	frame?(time: number): void;
	dispose(): void;
}

export interface MediaRepresentation {
	readonly node: HTMLElement;
	readonly continuity: 'static' | 'live' | 'retained';
	readonly ready?: Promise<void> | undefined;
	frame?(time: number): void;
	retire?(): MediaRetainedRenderer | void;
	dispose(): void;
}

export interface MediaVisualProvider {
	readonly name: string;
	represent(
		source: Element,
		context: MediaRepresentationContext
	): MediaRepresentation | MediaDecline | undefined;
}

/**
 * A decline (core's `RepresentationDecline`). `settle` asks the run not to
 * represent the element at all — no placeholder — so the page settles faithfully.
 */
export interface MediaDecline {
	readonly declined: string;
	readonly settle?: boolean | undefined;
}

/** How an outgoing-only player may be silenced: never implicitly. */
export type PlayerControl = 'none' | 'player-api';

/** What a `VideoEmbed` registers for the iframe it owns. */
export interface LiveMediaRecord {
	readonly platform: VideoPlatform;
	/** Explicit identity; absent means never adopted. */
	readonly key: string | undefined;
	/**
	 * The adoption scope the source itself declared (`mediaScope`). A retained
	 * player is claimable only when this is the provider that retained it.
	 */
	readonly scope: MediaVisualProvider | undefined;
	/** Everything a destination must match to take the player over. */
	readonly signature: string;
	readonly control: PlayerControl;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The representation provider for `VideoEmbed` players. Pass it to the
 * application's visual configuration; components register themselves.
 *
 * @example
 * ```ts
 * import { fluidMotion } from '@composable-svelte/core/application/motion';
 * import { mediaVisualProvider } from '@composable-svelte/media';
 *
 * visual: fluidMotion({ providers: [mediaVisualProvider()] })
 * ```
 */
export function mediaVisualProvider(): MediaVisualProvider {
	// This provider instance is the adoption scope: players it retains are
	// claimable only by components that name this same instance (`mediaScope`).
	const scope: Scope = new Map();
	const provider: MediaVisualProvider = {
		name: 'media',
		represent(source, context) {
			if (!(source instanceof HTMLIFrameElement)) return undefined;
			const registration = owned.get(source);
			if (!registration) return undefined;
			// No state-preserving move: the same player cannot follow the page. It
			// stays real and usable until the commit, then leaves with its page;
			// nothing stands in for it (core S4 faithful settlement).
			if (!canMove(source)) return { declined: 'mediaMoveUnavailable', settle: true };
			return represent(source, registration, context, provider, scope);
		}
	};
	scopes.set(provider, scope);
	return provider;
}

/**
 * Register the iframe a component owns. Returns the release the component
 * calls at teardown; it does nothing once the iframe was transferred.
 */
export function registerLiveMedia(
	iframe: HTMLIFrameElement,
	record: LiveMediaRecord
): { update(record: LiveMediaRecord): void; release(): void } {
	// Each registration is its own owner. Only the current one can update or
	// release it, so a previous owner's late teardown never touches a new one.
	const registration: Registration = { record };
	if (!owned.has(iframe)) ledger.registered++;
	owned.set(iframe, registration);
	return {
		update: (next) => {
			if (owned.get(iframe) === registration) registration.record = next;
		},
		release: () => {
			if (owned.get(iframe) !== registration) return;
			owned.delete(iframe);
			ledger.registered--;
		}
	};
}

/**
 * Claim a retained player for a destination `VideoEmbed`, before it creates its
 * own. Succeeds only for the same explicit key, a compatible configuration and
 * a player still retained (one claimant). The caller becomes its owner.
 */
export function claimRetainedMedia(
	provider: MediaVisualProvider,
	key: string,
	signature: string
): HTMLIFrameElement | null {
	const claimable = scopes.get(provider);
	const entry = claimable?.get(key);
	if (!entry || entry.state !== 'retained') return null;
	if (entry.record.signature !== signature) {
		entry.context.diagnose('mediaIdentityMismatch');
		return null;
	}
	claimable!.delete(key);
	entry.state = 'adopted';
	ledger.retained--;
	entry.context.diagnose('mediaAdopted');
	return entry.iframe;
}

/** Live resources held here, for resource ledgers and tests. */
export function liveMediaResources(): { registered: number; retained: number } {
	return { ...ledger };
}

/** Whether the state-preserving move exists in this engine. */
export function canMove(node: Element): boolean {
	return typeof (node as Element & { moveBefore?: unknown }).moveBefore === 'function';
}

/** State-preserving move (the caller checked `canMove`). */
export function movePreserving(parent: Element, node: Node): void {
	(parent as Element & { moveBefore(node: Node, child: Node | null): void }).moveBefore(node, null);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** The current owner's registration of an iframe; its record follows the owner's props. */
interface Registration {
	record: LiveMediaRecord;
}
const owned = new WeakMap<HTMLIFrameElement, Registration>();
type Scope = Map<string, Retained>;
const scopes = new WeakMap<MediaVisualProvider, Scope>();
const ledger = { registered: 0, retained: 0 };

/**
 * How long a closing claim window waits for the player's own confirmation that
 * it is muted, before disposing it instead. Bounded, so an API that is not
 * ready, refuses or drops the command cannot prolong audio.
 */
export const MUTE_CONFIRMATION_MS = 250;

interface Retained {
	readonly iframe: HTMLIFrameElement;
	readonly record: LiveMediaRecord;
	readonly context: MediaRepresentationContext;
	readonly scope: Scope;
	state: 'retained' | 'adopted' | 'disposed';
	stopListening?: (() => void) | undefined;
}

function represent(
	source: HTMLIFrameElement,
	registration: Registration,
	context: MediaRepresentationContext,
	provider: MediaVisualProvider,
	scope: Scope
): MediaRepresentation {
	const node = context.document.createElement('div');
	node.setAttribute('aria-hidden', 'true');
	node.inert = true;
	node.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none;';

	let entry: Retained | undefined;
	let lease: MediaRetainedRenderer | undefined;
	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		if (entry) release(entry);
	};
	context.signal.addEventListener('abort', finish, { once: true });

	return {
		node,
		continuity: 'retained',
		retire: () => {
			if (finished) return undefined;
			if (lease) return lease;
			// The same owner still holds it (its props may have changed meanwhile).
			if (!source.isConnected || owned.get(source) !== registration) {
				context.diagnose('mediaSourceGone');
				return undefined;
			}
			const record = registration.record;
			// Keys are revoked before the player becomes decoration. Only focus
			// inside this player is touched; where it goes is core's policy.
			if (context.document.activeElement === source) source.blur();
			movePreserving(node, source);
			owned.delete(source);
			ledger.registered--;
			ledger.retained++;
			const retained: Retained = { iframe: source, record, context, scope, state: 'retained' };
			entry = retained;
			// Claimable only within the scope the source itself declared.
			if (record.key && record.scope === provider) {
				const previous = scope.get(record.key);
				if (previous && previous !== retained) release(previous);
				scope.set(record.key, retained);
			} else if (record.key) {
				context.diagnose('mediaScopeMismatch');
			}
			// The claim window: it closes one microtask after `retire()`, i.e. when
			// the commit flush that retired the source has finished. A destination
			// mounting in that flush claims synchronously during its initialisation;
			// nothing can claim later. Closing is prompt and total: muted by an
			// opted-in API, or disposed now — including when muting fails.
			queueMicrotask(() => endClaimWindow(retained));
			lease = { dispose: finish };
			return lease;
		},
		dispose: finish
	};
}

function endClaimWindow(entry: Retained): void {
	if (entry.record.key && entry.scope.get(entry.record.key) === entry) entry.scope.delete(entry.record.key);
	if (entry.state !== 'retained') return;
	if (entry.record.control !== 'player-api' || !requestMute(entry)) {
		// No explicit way to silence it: decoration must not prolong its audio.
		entry.context.diagnose('mediaAudioUncontrolled');
		release(entry);
	}
}

/** The run's single terminal path for a player it still holds. */
function release(entry: Retained): void {
	if (entry.record.key && entry.scope.get(entry.record.key) === entry) entry.scope.delete(entry.record.key);
	entry.stopListening?.();
	entry.stopListening = undefined;
	if (entry.state !== 'retained') return;
	entry.state = 'disposed';
	ledger.retained--;
	entry.iframe.remove();
}

/**
 * Ask the player, through its documented API, to mute — and keep it only once
 * the player itself reports being muted, within `MUTE_CONFIRMATION_MS`.
 * Otherwise (not ready, refused, dropped) it is disposed. A sent command is
 * never taken for silence. Returns false when there is no API to ask.
 */
function requestMute(entry: Retained): boolean {
	const target = entry.iframe.contentWindow;
	if (!target) return false;
	let origin: string;
	try {
		origin = new URL(entry.iframe.src).origin;
	} catch {
		return false;
	}
	const platform = entry.record.platform;
	if (platform === 'twitch') return false; // no documented command channel for a bare player
	const view = entry.context.document.defaultView;
	if (!view) return false;

	const confirmed = (data: unknown): boolean => {
		let message = data;
		if (typeof message === 'string') {
			try {
				message = JSON.parse(message);
			} catch {
				return false;
			}
		}
		if (!message || typeof message !== 'object') return false;
		const m = message as { event?: string; info?: { muted?: boolean }; method?: string; value?: unknown };
		// YouTube IFrame API state report; Vimeo Player API `getMuted` reply.
		return platform === 'youtube' ? m.event === 'infoDelivery' && m.info?.muted === true : m.method === 'getMuted' && m.value === true;
	};
	const onMessage = (event: MessageEvent) => {
		if (event.source !== target || event.origin !== origin || !confirmed(event.data)) return;
		if (entry.state !== 'retained') return;
		entry.stopListening?.();
		entry.stopListening = undefined;
		entry.context.diagnose('mediaMutedForDecoration');
	};
	const timer = view.setTimeout(() => {
		if (entry.state !== 'retained' || !entry.stopListening) return;
		entry.context.diagnose('mediaMuteUnconfirmed');
		release(entry);
	}, MUTE_CONFIRMATION_MS);
	view.addEventListener('message', onMessage);
	entry.stopListening = () => {
		view.removeEventListener('message', onMessage);
		view.clearTimeout(timer);
	};

	if (platform === 'youtube') {
		target.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), origin);
		target.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [], id: 1, channel: 'widget' }), origin);
	} else {
		target.postMessage(JSON.stringify({ method: 'setMuted', value: true }), origin);
		target.postMessage(JSON.stringify({ method: 'getMuted' }), origin);
	}
	return true;
}

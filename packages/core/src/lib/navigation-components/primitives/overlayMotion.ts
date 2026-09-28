/**
 * Private overlay-motion seam for the presentation primitives (fluid-overlays implementation-interface §4).
 * Not part of the public surface. The reducer-owned `presentation` stays the authority: an engine may take
 * over a transition's visuals, never its acceptance; completion is delivered through the component's existing
 * callbacks, at most once, and never after the attempt was cancelled.
 *
 * @internal
 */
import { bindOverlayScope } from '../../actions/overlayLayers.js';
import { bindOverlayInstance, claimOverlayTransition, type OverlayInstance, type OverlayMotionHandle } from '../../application/renderer/choreography/overlay-motion.js';
/** Status probe for the pre-render default-plan checkpoint (C2 default phase). */
export { registerOverlayProbe } from '../../application/renderer/choreography/overlay-motion.js';

const instances = new WeakMap<HTMLElement, OverlayInstance>();

/**
 * Svelte action for a primitive's content container (inside `{#if visible}`, so re-created on every open):
 * a new overlay instance (its owner is the epoch) whose participant scope root is this container.
 */
export function overlayInstance(node: HTMLElement, motion: OverlayMotionHandle | undefined): { update(next: OverlayMotionHandle | undefined): void; destroy(): void } {
  const instance: OverlayInstance = { owner: Object.freeze({ overlayInstance: true }), backdrop: undefined, content: undefined };
  instances.set(node, instance);
  const releaseScope = bindOverlayScope(node, instance.owner);
  let unbind = bindOverlayInstance(motion, instance);
  return {
    update(next) { unbind(); unbind = bindOverlayInstance(next, instance); },
    destroy() { unbind(); releaseScope(); instances.delete(node); }
  };
}

/** Records the mounted instance's role elements (any status), so an explicit transition can capture them pre-commit. */
export function noteOverlayRoles(container: HTMLElement | undefined, elements: { readonly backdrop?: HTMLElement | undefined; readonly content?: HTMLElement | undefined }): void {
  const instance = container ? instances.get(container) : undefined;
  if (!instance) return;
  instance.backdrop = elements.backdrop;
  instance.content = elements.content;
}

/**
 * Called in the primitive's status effect when the committed status is `presenting`/`dismissing`, before its
 * own spring. Returns a cancel function when an engine claimed the transition (the primitive must not
 * animate), otherwise undefined. `complete` is invoked at most once and never after `cancel`.
 */
export function claimPresentationMotion(
  motion: OverlayMotionHandle | undefined,
  container: HTMLElement | undefined,
  status: 'presenting' | 'dismissing',
  elements: { readonly backdrop?: HTMLElement | undefined; readonly content?: HTMLElement | undefined },
  complete: () => void
): ((reason: string) => void) | undefined {
  if (!motion || !container) return undefined;
  const instance = instances.get(container);
  if (!instance) return undefined;
  instance.backdrop = elements.backdrop;
  instance.content = elements.content;
  const kind = status === 'presenting' ? 'present' : 'dismiss';
  // A status effect re-run for an unrelated change cleans up and re-claims the SAME transition in the same task:
  // it continues the live claim (no restart, no second run, no pending explicit plan consumed).
  const existing = live.get(instance);
  if (existing && existing.cancelling && existing.kind === kind) {
    existing.cancelling = false;
    existing.complete = complete;
    return cancelOf(instance, existing);
  }
  const stale = existing?.cancelling ? existing : undefined;
  const entry: LiveClaim = { kind, claim: undefined, complete, cancelling: false, done: false, reason: 'superseded' };
  const claim = claimOverlayTransition(motion, kind, instance, () => { if (entry.done || entry.cancelling) return; entry.done = true; if (live.get(instance) === entry) live.delete(instance); entry.complete(); });
  // A reversal (dismissal → open, or open → dismissal) supersedes the old run AFTER the new claim, so the Host hands
  // the displayed state over (continuity) before the old obligation is retired.
  if (stale) finishCancel(instance, stale);
  if (!claim) return undefined;
  entry.claim = claim;
  live.set(instance, entry);
  return cancelOf(instance, entry);
}

interface LiveClaim { readonly kind: 'present' | 'dismiss'; claim: { cancel(reason: string): void } | undefined; complete: () => void; cancelling: boolean; done: boolean; reason: string }
const live = new WeakMap<OverlayInstance, LiveClaim>();
function finishCancel(instance: OverlayInstance, entry: LiveClaim): void {
  if (entry.done) return;
  entry.done = true;
  if (live.get(instance) === entry) live.delete(instance);
  entry.claim?.cancel(entry.reason);
}
/** Cancellation takes effect after the current task's effects (a same-kind re-claim in between continues instead). */
function cancelOf(instance: OverlayInstance, entry: LiveClaim): (reason: string) => void {
  return (reason: string) => {
    if (entry.done || entry.cancelling) return;
    entry.cancelling = true;
    entry.reason = reason;
    queueMicrotask(() => { if (entry.cancelling) finishCancel(instance, entry); });
  };
}

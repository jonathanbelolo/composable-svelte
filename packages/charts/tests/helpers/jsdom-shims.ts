/**
 * Browser APIs jsdom does not implement, which `Chart` needs at mount.
 *
 * `Chart`'s `onMount` constructs a `ResizeObserver` whenever no explicit
 * `width`/`height` is passed (`Chart.svelte:69`). jsdom has none, so the throw
 * suppresses the component's first `$effect` run and leaves it in an error
 * state — every assertion after that is about a broken mount rather than about
 * the behaviour under test. `selection-callback.test.ts` measured this
 * directly: the same probe reports `MOUNT_CALLS=0` without the stub and
 * `MOUNT_CALLS=1` with it.
 *
 * Deliberately idempotent (`??=`) so several test files can call it.
 *
 * Debt worth naming: `brush-install.test.ts` and `selection-callback.test.ts`
 * each carry their own inline copy of this stub, and of a larger
 * `shimSvgGeometry` that d3-brush needs. This module exists so a third copy did
 * not get written; consolidating those two is separate work.
 */
export function installResizeObserverStub(): void {
	(globalThis as any).ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

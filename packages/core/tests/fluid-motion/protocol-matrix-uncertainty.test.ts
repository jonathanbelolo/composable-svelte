/**
 * Protocol Matrix: history uncertainty is cleared only by evidence newer than the failure (R1 follow-up).
 *
 * An older traversal that settles inactive (the browser already moved on) or without re-establishing its accepted
 * entry must not clear `historyUncertain` entered by a newer observation or write failure. A committed traversal
 * state that cannot be serialized leaves domain and physical history unreconciled and is uncertain too.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMatrixRig, type MatrixRig } from './protocol-matrix-fixtures/matrix-rig.js';
import { bindManagedRootRoute } from '../../src/lib/routing/managed-binding.js';

describe('Protocol Matrix: history uncertainty evidence', () => {
  let rig: MatrixRig | undefined;
  afterEach(() => { rig?.destroy(); rig = undefined; });

  for (const runtime of ['production', 'teststore'] as const) {
    describe(`Runtime: ${runtime}`, () => {
      it('an older inactive traversal settlement does not clear a newer observation failure', () => {
        const r = createMatrixRig({ runtime, initialURL: '/start' });
        rig = r;
        let once = false;
        const stop = r.store.subscribe((state: { tick: number }) => {
          if (state.tick !== 1 || once) return;
          once = true;
          // Both observations happen inside one committed turn: the first traversal's inspection queues behind it.
          r.visit('/first');
          r.port.failNextReplace(new Error('metadata claim failed'));
          r.visit('/second');
        });
        r.store.dispatch({ type: 'tick' });
        stop();

        // The first inspection ran and settled after the newer failure: domain /first, physical /second.
        expect(r.store.state.url).toBe('/first');
        expect(r.port.current().url).toBe('/second');
        const handle = r.coordinator.request({ to: '/after' }, {}, { onUnavailable: 'drop' });
        expect(handle.status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
      });

      it('a later successful write still clears uncertainty (recovery is preserved)', () => {
        const r = createMatrixRig({ runtime, initialURL: '/start' });
        rig = r;
        r.port.failNextReplace(new Error('metadata claim failed'));
        r.visit('/second');
        expect(r.coordinator.request({ to: '/x' }, {}, { onUnavailable: 'drop' }).status)
          .toEqual({ type: 'dropped', reason: 'historyUncertain' });
        // The next accepted domain route is written successfully to the physical entry.
        r.store.dispatch({ type: 'go', url: '/recovered' });
        expect(r.port.current().url).toBe('/recovered');
        const handle = r.coordinator.request({ to: '/after' }, {}, { onUnavailable: 'drop' });
        expect(handle.status).toMatchObject({ type: 'admitted' });
      });

      it('a traversal whose committed state cannot be serialized enters historyUncertain', () => {
        const r = createMatrixRig({ runtime, initialURL: '/start', bind: false });
        rig = r;
        let id = 0;
        const binding = bindManagedRootRoute({
          store: r.store, execution: r.composition.execution, port: r.port, initial: 'accepted-state', fragment: 'native',
          serialize: (state: unknown) => {
            const { url } = state as { url: string };
            if (url === '/unserializable') throw new Error('serialize failed');
            return url;
          },
          request: url => ({ action: { type: 'go', url }, expectedURL: url }),
          id: () => `u-${++id}`, report: () => {},
          staging: eligibility => r.coordinator.setEligibility(eligibility)
        });
        try {
          r.visit('/unserializable');
          // The reducer committed the traversal; its URL cannot be projected, so history is unreconciled.
          expect(r.store.state.url).toBe('/unserializable');
          const handle = r.coordinator.request({ to: '/after' }, {}, { onUnavailable: 'drop' });
          expect(handle.status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
        } finally { binding?.dispose(); }
      });

      it('a traversal whose committed state fails route classification enters historyUncertain without replay', () => {
        const r = createMatrixRig({ runtime, initialURL: '/start', bind: false });
        rig = r;
        let id = 0;
        const binding = bindManagedRootRoute({
          store: r.store, execution: r.composition.execution, port: r.port, initial: 'accepted-state', fragment: 'native',
          serialize: (state: unknown) => (state as { url: string }).url,
          classify: ({ acceptedURL }) => {
            if (acceptedURL === '/bad') throw new Error('classification failed');
            return 'accepted';
          },
          request: url => ({ action: { type: 'go', url }, expectedURL: url }),
          id: () => `c-${++id}`, report: () => {},
          staging: eligibility => r.coordinator.setEligibility(eligibility)
        });
        try {
          r.visit('/bad');
          // The domain turn committed; the browser was rebased to the previous accepted URL.
          expect(r.store.state.url).toBe('/bad');
          expect(r.port.current().url).toBe('/start');
          expect(r.trace).toEqual(['go:/bad']);
          const handle = r.coordinator.request({ to: '/next' }, {}, { onUnavailable: 'drop' });
          expect(handle.status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
          expect(r.trace).toEqual(['go:/bad']);
        } finally { binding?.dispose(); }
      });
    });
  }
});

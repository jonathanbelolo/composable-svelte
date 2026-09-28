/**
 * Pure domain, reducer lifecycle, and plan validation tests for stacked overlays.
 *
 * Tests:
 * 1. Modal presentation state lifecycle (idle -> presenting -> presented -> dismissing -> idle)
 * 2. Unsaved changes close refusal (modal stays presented; confirmAlert nested state activates)
 * 3. Strict guard on repeated close while dirty (does not bypass guard)
 * 4. Stale-save owner/request protection (reopening while save pending does not corrupt new instance)
 * 5. Awaited save then accepted close
 * 6. Discard confirmation dismissal and confirm-and-close transitions
 * 7. Effect.run async save dependency and saved state reconciliation
 * 8. Rapid reversal during presenting (I1/I2)
 * 9. Forwarded home page actions to root overlay actions
 * 10. Technical specs drawer lifecycle and tab selection
 * 11. Public defineChoreography plan validation:
 *     - Shared track with cardKey and overlay.select('hero')
 *     - Waypoint override (180 ms source-relative pose)
 *     - Custom cubicBezier easing and overshoot curves
 *     - Page, backdrop, and content coordination on one timeline
 *     - Reduced-motion geometry drop and bounded duration
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createInitialAppState,
  rootReducer,
  defaultCuratorSpecs,
  type AppState,
  type AppAction
} from '../src/model.js';
import {
  curatorModalPlans,
  curatorClosePlan,
  drawerPlans,
  nestedAlertPlans
} from '../src/overlay-motion.js';
import { cardKey } from '../src/motion.js';

// Dummy overlay scope selector for plan tests
const mockOverlayScope = {
  select(key: string) {
    return { key, scope: mockOverlayScope };
  }
};

describe('overlay domain & reducer lifecycle', () => {
  it('initializes with idle overlay presentation states and default specs', () => {
    const state = createInitialAppState();
    expect(state.curator).toBeNull();
    expect(state.curatorPresentation.status).toBe('idle');
    expect(state.confirmAlert).toBeNull();
    expect(state.confirmAlertPresentation.status).toBe('idle');
    expect(state.drawer).toBeNull();
    expect(state.drawerPresentation.status).toBe('idle');
    expect(state.specs.pavilion).toBeDefined();
    expect(state.specs.pavilion?.status).toBe('certified');
  });

  it('openCuratorModal enters presenting state with the requested work specification', () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openCuratorModal', id: 'lattice' }, {});
    expect(opening.curatorPresentation.status).toBe('presenting');
    expect(opening.curator).not.toBeNull();
    expect(opening.curator!.spec.id).toBe('lattice');
    expect(opening.curator!.isDirty).toBe(false);
    expect(opening.curator!.isSaving).toBe(false);
    expect(opening.curator!.instanceId).toBe(1);

    // Presentation completed event transitions to presented
    const [presented] = rootReducer(
      opening,
      { type: 'curatorPresentation', event: { type: 'presentationCompleted' } },
      {}
    );
    expect(presented.curatorPresentation.status).toBe('presented');
  });

  it('editing notes marks modal dirty and tracks draft modifications', () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openCuratorModal', id: 'pavilion' }, {});
    const [presented] = rootReducer(
      opening,
      { type: 'curatorPresentation', event: { type: 'presentationCompleted' } },
      {}
    );

    const [edited] = rootReducer(
      presented,
      {
        type: 'curator',
        action: {
          type: 'presented',
          action: { type: 'editNotes', notes: 'Updated diurnal thermal model notes.' }
        }
      },
      {}
    );
    expect(edited.curator!.isDirty).toBe(true);
    expect(edited.curator!.spec.curatorNotes).toBe('Updated diurnal thermal model notes.');

    // Restoring initial notes clears dirty flag
    const [restored] = rootReducer(
      edited,
      {
        type: 'curator',
        action: {
          type: 'presented',
          action: { type: 'editNotes', notes: defaultCuratorSpecs.pavilion!.curatorNotes }
        }
      },
      {}
    );
    expect(restored.curator!.isDirty).toBe(false);
  });

  it('refuses close when dirty (I3), opening nested confirmAlert, and strictly blocks repeated close bypass', () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openCuratorModal', id: 'pavilion' }, {});
    const [presented] = rootReducer(
      opening,
      { type: 'curatorPresentation', event: { type: 'presentationCompleted' } },
      {}
    );
    const [edited] = rootReducer(
      presented,
      {
        type: 'curator',
        action: {
          type: 'presented',
          action: { type: 'editNotes', notes: 'Unsaved note' }
        }
      },
      {}
    );

    // 1. User or Escape attempts close while dirty:
    const [refused] = rootReducer(edited, { type: 'closeCuratorModal' }, {});
    // Must NOT enter dismissing; modal stays presented, confirmAlert opens!
    expect(refused.curatorPresentation.status).toBe('presented');
    expect(refused.confirmAlert).not.toBeNull();
    expect(refused.confirmAlert!.workTitle).toBe(defaultCuratorSpecs.pavilion!.title);
    expect(refused.confirmAlertPresentation.status).toBe('presenting');

    // Confirm alert completes presenting
    const [alertPresented] = rootReducer(
      refused,
      { type: 'confirmAlertPresentation', event: { type: 'presentationCompleted' } },
      {}
    );
    expect(alertPresented.confirmAlertPresentation.status).toBe('presented');

    // 2. REPEATED CLOSE GUARD:
    // Repeated close while dirty and confirmation already open must NOT bypass guard!
    const [repeatedClose] = rootReducer(alertPresented, { type: 'closeCuratorModal' }, {});
    expect(repeatedClose.curatorPresentation.status).toBe('presented');
    expect(repeatedClose.confirmAlertPresentation.status).toBe('presented');
    expect(repeatedClose.curator!.isDirty).toBe(true);

    const [repeatedDismiss] = rootReducer(
      alertPresented,
      { type: 'curator', action: { type: 'dismiss' } },
      {}
    );
    expect(repeatedDismiss.curatorPresentation.status).toBe('presented');
    expect(repeatedDismiss.confirmAlertPresentation.status).toBe('presented');

    // 3. Dismissing the nested alert (Keep Editing) dismisses alert only:
    const [dismissAlert] = rootReducer(
      alertPresented,
      { type: 'confirmAlert', action: { type: 'dismiss' } },
      {}
    );
    expect(dismissAlert.confirmAlertPresentation.status).toBe('dismissing');
    expect(dismissAlert.curatorPresentation.status).toBe('presented');
    expect(dismissAlert.curator!.isDirty).toBe(true);

    // Alert dismissal complete
    const [alertIdle] = rootReducer(
      dismissAlert,
      { type: 'confirmAlertPresentation', event: { type: 'dismissalCompleted' } },
      {}
    );
    expect(alertIdle.confirmAlert).toBeNull();
    expect(alertIdle.confirmAlertPresentation.status).toBe('idle');
    expect(alertIdle.curatorPresentation.status).toBe('presented');

    // 4. Opening alert again and confirming discard:
    const [reopenedAlert] = rootReducer(alertIdle, { type: 'closeCuratorModal' }, {});
    const [confirmed] = rootReducer(
      reopenedAlert,
      {
        type: 'confirmAlert',
        action: { type: 'presented', action: { type: 'confirmDiscard' } }
      },
      {}
    );
    expect(confirmed.confirmAlertPresentation.status).toBe('dismissing');
    expect(confirmed.curatorPresentation.status).toBe('dismissing');
    expect(confirmed.curator!.isDirty).toBe(false);

    // Modal and alert dismissal completion returns both to idle
    const [afterAlertDismiss] = rootReducer(
      confirmed,
      { type: 'confirmAlertPresentation', event: { type: 'dismissalCompleted' } },
      {}
    );
    expect(afterAlertDismiss.confirmAlert).toBeNull();
    expect(afterAlertDismiss.confirmAlertPresentation.status).toBe('idle');

    const [afterModalDismiss] = rootReducer(
      afterAlertDismiss,
      { type: 'curatorPresentation', event: { type: 'dismissalCompleted' } },
      {}
    );
    expect(afterModalDismiss.curator).toBeNull();
    expect(afterModalDismiss.curatorPresentation.status).toBe('idle');
  });

  it('implements awaited save then accepted close with stale-save protection', async () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openCuratorModal', id: 'origami' }, {});
    const [presented] = rootReducer(
      opening,
      { type: 'curatorPresentation', event: { type: 'presentationCompleted' } },
      {}
    );
    const [edited] = rootReducer(
      presented,
      {
        type: 'curator',
        action: {
          type: 'presented',
          action: { type: 'editNotes', notes: 'Calibrated acoustic damping coefficients.' }
        }
      },
      {}
    );

    const saveSpy = vi.fn().mockResolvedValue(undefined);

    // 1. Dispatch saveAndClose: must await save before closing!
    const [saving, effect] = rootReducer(
      edited,
      {
        type: 'curator',
        action: { type: 'presented', action: { type: 'saveAndClose' } }
      },
      { saveCuratorWork: saveSpy }
    );
    // Modal is saving with closeAfterSave: true, but NOT yet dismissing!
    expect(saving.curator!.isSaving).toBe(true);
    expect(saving.curator!.closeAfterSave).toBe(true);
    expect(saving.curatorPresentation.status).toBe('presented');

    // 2. Stale-save protection: simulate reopening a new modal instance while save is pending
    const [reopened] = rootReducer(saving, { type: 'openCuratorModal', id: 'cloud' }, {});
    expect(reopened.curator!.spec.id).toBe('cloud');
    expect(reopened.curator!.instanceId).toBe(2);

    // Execute the async save from instance 1
    const dispatchedActions: AppAction[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((action: AppAction) => dispatchedActions.push(action));
    }
    expect(saveSpy).toHaveBeenCalledWith('origami', 'Calibrated acoustic damping coefficients.');
    expect(dispatchedActions).toHaveLength(1);

    // Process saveCompleted for the OLD instance (instanceId 1) against NEW state (instanceId 2)
    const [handledStale] = rootReducer(reopened, dispatchedActions[0]!, {});
    // Catalog specs updated with saved work:
    expect(handledStale.specs.origami!.curatorNotes).toBe('Calibrated acoustic damping coefficients.');
    // But current modal instance was NOT corrupted!
    expect(handledStale.curator!.spec.id).toBe('cloud');
    expect(handledStale.curator!.instanceId).toBe(2);
    expect(handledStale.curator!.isSaving).toBe(false);

    // 3. Normal awaited save and close on current instance:
    const [editedCloud] = rootReducer(
      handledStale,
      {
        type: 'curator',
        action: {
          type: 'presented',
          action: { type: 'editNotes', notes: 'Inflated ETFE canopy revision.' }
        }
      },
      {}
    );
    const saveSpy2 = vi.fn().mockResolvedValue(undefined);
    const [savingCloud, effect2] = rootReducer(
      editedCloud,
      {
        type: 'curator',
        action: { type: 'presented', action: { type: 'saveAndClose' } }
      },
      { saveCuratorWork: saveSpy2 }
    );
    expect(savingCloud.curator!.closeAfterSave).toBe(true);
    expect(savingCloud.curatorPresentation.status).toBe('presenting'); // was presenting from open

    const cloudActions: AppAction[] = [];
    if (effect2._tag === 'Run') {
      await effect2.execute((action: AppAction) => cloudActions.push(action));
    }

    const [saved] = rootReducer(savingCloud, cloudActions[0]!, {});
    // The save result does not close by itself: it marks the close ready for the view's explicit entry.
    expect(saved.curatorPresentation.status).toBe('presenting');
    const ready = saved.curator!.closeReady;
    expect(ready).toBe(saved.saveRequestId);
    const [savedAndClosed] = rootReducer(saved, { type: 'curator', action: { type: 'presented', action: { type: 'commitSavedClose', requestId: ready! } } }, {});
    // Accepted close after awaited save (the synchronous commit the explicit plan binds to).
    expect(savedAndClosed.curatorPresentation.status).toBe('dismissing');
    expect(savedAndClosed.curator!.closeReady).toBeNull();
    // A repeated commit (effect re-run, duplicate result) is a no-op: no second accepted close.
    const [again] = rootReducer(savedAndClosed, { type: 'curator', action: { type: 'presented', action: { type: 'commitSavedClose', requestId: ready! } } }, {});
    expect(again).toBe(savedAndClosed);
    expect(savedAndClosed.curator!.isDirty).toBe(false);
    expect(savedAndClosed.specs.cloud!.curatorNotes).toBe('Inflated ETFE canopy revision.');
  });

  it('rapid reversal mid-flight transitions presenting modal to dismissing (I1/I2)', () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openCuratorModal', id: 'cloud' }, {});
    expect(opening.curatorPresentation.status).toBe('presenting');

    // Close requested while presenting:
    const [reversing] = rootReducer(opening, { type: 'closeCuratorModal' }, {});
    expect(reversing.curatorPresentation.status).toBe('dismissing');
  });

  it('forwards child page openCurator and openDrawer actions to root overlay state', () => {
    const initial = createInitialAppState();
    const [openedModal] = rootReducer(
      initial,
      {
        type: 'page',
        action: {
          type: 'presented',
          action: { type: 'home', action: { type: 'openCurator', id: 'lattice' } }
        }
      },
      {}
    );
    expect(openedModal.curatorPresentation.status).toBe('presenting');
    expect(openedModal.curator!.spec.id).toBe('lattice');

    const [openedDrawer] = rootReducer(
      initial,
      {
        type: 'page',
        action: {
          type: 'presented',
          action: { type: 'home', action: { type: 'openDrawer', id: 'origami' } }
        }
      },
      {}
    );
    expect(openedDrawer.drawerPresentation.status).toBe('presenting');
    expect(openedDrawer.drawer!.workId).toBe('origami');
  });

  it('drawer open, tab change, and close lifecycle works cleanly', () => {
    const initial = createInitialAppState();
    const [opening] = rootReducer(initial, { type: 'openDrawer', id: 'pavilion' }, {});
    expect(opening.drawerPresentation.status).toBe('presenting');

    const [presented] = rootReducer(
      opening,
      { type: 'drawerPresentation', event: { type: 'presentationCompleted' } },
      {}
    );
    expect(presented.drawerPresentation.status).toBe('presented');
    expect(presented.drawer!.tab).toBe('engineering');

    // Switch tab
    const [acoustics] = rootReducer(
      presented,
      {
        type: 'drawer',
        action: {
          type: 'presented',
          action: { type: 'setTab', tab: 'acoustics' }
        }
      },
      {}
    );
    expect(acoustics.drawer!.tab).toBe('acoustics');

    // Close
    const [closing] = rootReducer(acoustics, { type: 'closeDrawer' }, {});
    expect(closing.drawerPresentation.status).toBe('dismissing');

    const [idle] = rootReducer(
      closing,
      { type: 'drawerPresentation', event: { type: 'dismissalCompleted' } },
      {}
    );
    expect(idle.drawer).toBeNull();
    expect(idle.drawerPresentation.status).toBe('idle');
  });
});

describe('overlay choreography plans (declarative & explicit)', () => {
  it('curatorModalPlans configures shared track, waypoint override, and custom curves', () => {
    const plans = curatorModalPlans(mockOverlayScope, 'pavilion', false);
    const open = plans.open;
    const close = plans.close;

    expect(open.durationMs).toBe(440);
    expect(open.cueMs).toBe(0);

    // Shared track: card -> hero
    const sharedOpen = open.tracks.find(t => t.side === 'shared');
    expect(sharedOpen).toBeDefined();
    expect(sharedOpen?.participant).toBe(cardKey('pavilion'));
    expect(sharedOpen?.from).toBe(cardKey('pavilion'));
    expect(sharedOpen?.to).toEqual(mockOverlayScope.select('hero'));
    expect(sharedOpen?.easing).toEqual({ cubicBezier: [0.2, 0, 0, 1] });

    // Waypoint override at 180 ms
    expect(sharedOpen?.path).toBeDefined();
    expect(sharedOpen?.path).toHaveLength(1);
    expect(sharedOpen?.path![0]?.atMs).toBe(180);
    expect(sharedOpen?.path![0]?.pose.relativeTo).toBe('source');
    expect(sharedOpen?.path![0]?.easing).toEqual({ cubicBezier: [0.25, 1, 0.5, 1] });

    // Overshoot scale curve on content panel
    const contentOpen = open.tracks.find(
      t => typeof t.participant === 'object' && t.participant.key === 'content'
    );
    expect(contentOpen).toBeDefined();
    expect(contentOpen?.easing).toEqual({ cubicBezier: [0.34, 1.56, 0.64, 1] });

    // Disjoint page/catalog animation on same timeline
    const catalogOpen = open.tracks.find(t => t.participant === 'catalog');
    expect(catalogOpen).toBeDefined();
    expect(catalogOpen?.side).toBe('outgoing');

    // Close plan returns hero -> card
    const sharedClose = close.tracks.find(t => t.side === 'shared');
    expect(sharedClose).toBeDefined();
    expect(sharedClose?.from).toEqual(mockOverlayScope.select('hero'));
    expect(sharedClose?.to).toBe(cardKey('pavilion'));
  });

  it('curatorClosePlan is the quicker explicit Close plan', () => {
    const plan = curatorClosePlan(mockOverlayScope, 'lattice', false);
    expect(plan.durationMs).toBe(240);
    const shared = plan.tracks.find(t => t.side === 'shared');
    expect(shared?.from).toEqual(mockOverlayScope.select('hero'));
    expect(shared?.to).toBe(cardKey('lattice'));
  });

  it('drawer plans specify slide channel and page push', () => {
    const plans = drawerPlans(mockOverlayScope, false);
    const content = plans.open.tracks.find(
      t => typeof t.participant === 'object' && t.participant.key === 'content'
    );
    expect(content?.slide).toEqual({ dx: 360, dy: 0 });
    expect(content?.easing).toEqual({ cubicBezier: [0.2, 0, 0, 1] });

    const catalog = plans.open.tracks.find(t => t.participant === 'catalog');
    expect(catalog?.slide).toEqual({ dx: -32, dy: 0 });
  });

  it('reduced motion plans animate no geometry: only the page rest is posed, immediately, and complete promptly', () => {
    for (const plans of [
      curatorModalPlans(mockOverlayScope, 'pavilion', true),
      drawerPlans(mockOverlayScope, true),
      nestedAlertPlans(mockOverlayScope, true)
    ]) {
      for (const plan of [plans.open, plans.close]) {
        expect(plan.durationMs).toBeLessThanOrEqual(140);
        expect(plan.tracks.every(t => t.side !== 'shared')).toBe(true);
        expect(plan.tracks.every(t => !('path' in t))).toBe(true);
        // Geometry appears only as the catalog's full resting pose (or its release), reached with no intermediate frames.
        const geometric = plan.tracks.filter(t => 'slide' in t || 'scale' in t);
        expect(geometric.every(t => t.participant === 'catalog' && t.durationMs === 0)).toBe(true);
      }
    }
  });
});

describe('curator save results (review R-2/R-3/R-4 counterexamples)', () => {
  const child = (action: import('../src/model.js').CuratorModalAction): AppAction => ({ type: 'curator', action: { type: 'presented', action } });
  const openDirty = (notes: string) => {
    let [s] = rootReducer(createInitialAppState(), { type: 'openCuratorModal', id: 'lattice' }, {});
    [s] = rootReducer(s, { type: 'curatorPresentation', event: { type: 'presentationCompleted' } }, {});
    [s] = rootReducer(s, child({ type: 'editNotes', notes }), {});
    return s;
  };
  const runEffect = async (effect: unknown) => {
    const out: AppAction[] = [];
    const e = effect as { _tag: string; execute(d: (a: AppAction) => void): Promise<void> };
    if (e._tag === 'Run') await e.execute(a => out.push(a));
    return out;
  };

  it('R-2: a failed save clears saving, keeps the draft dirty and reports the error; the modal stays open', async () => {
    const [saving, effect] = rootReducer(openDirty('Draft A'), child({ type: 'saveAndClose' }), { saveCuratorWork: () => Promise.reject(new Error('Archive offline')) });
    const [actions] = [await runEffect(effect)];
    expect(actions).toHaveLength(1);
    const [failed] = rootReducer(saving, actions[0]!, {});
    expect(failed.curator!.isSaving).toBe(false);
    expect(failed.curator!.isDirty).toBe(true);
    expect(failed.curator!.closeAfterSave).toBe(false);
    expect(failed.curator!.saveError).toBe('Archive offline');
    expect(failed.curatorPresentation.status).toBe('presented');
    expect(failed.specs.lattice!.curatorNotes).toBe(defaultCuratorSpecs.lattice!.curatorNotes);
  });

  it('R-3: notes typed while a save is in flight survive its completion and stay dirty (no close)', async () => {
    const [saving, effect] = rootReducer(openDirty('Draft A'), child({ type: 'saveAndClose' }), { saveCuratorWork: () => Promise.resolve() });
    const [typing] = rootReducer(saving, child({ type: 'editNotes', notes: 'Draft A, then B' }), {});
    const [done] = rootReducer(typing, (await runEffect(effect))[0]!, {});
    expect(done.specs.lattice!.curatorNotes).toBe('Draft A');
    expect(done.curator!.spec.curatorNotes).toBe('Draft A, then B');
    expect(done.curator!.isDirty).toBe(true);
    expect(done.curatorPresentation.status).toBe('presented');
    expect(done.curator!.closeReady).toBeNull();
    // Even if the view commits, a close with newer unsaved notes is refused.
    const [refused] = rootReducer(done, child({ type: 'commitSavedClose', requestId: done.saveRequestId }), {});
    expect(refused.curatorPresentation.status).toBe('presented');
  });

  it('R-4: a save completing after the visitor discarded never re-presents the closing modal', async () => {
    const [saving, effect] = rootReducer(openDirty('Draft A'), child({ type: 'save' }), { saveCuratorWork: () => Promise.resolve() });
    let [s] = rootReducer(saving, { type: 'curator', action: { type: 'dismiss' } }, {});
    expect(s.confirmAlertPresentation.status).toBe('presenting');
    [s] = rootReducer(s, { type: 'confirmAlert', action: { type: 'presented', action: { type: 'confirmDiscard' } } }, {});
    expect(s.curatorPresentation.status).toBe('dismissing');
    const [late] = rootReducer(s, (await runEffect(effect))[0]!, {});
    expect(late.curatorPresentation.status).toBe('dismissing');
    expect(late.curator!.closeReady).toBeNull();
  });
});

describe('Save & Close readiness bridge (Main bridge conditions)', () => {
  const child = (action: import('../src/model.js').CuratorModalAction): AppAction => ({ type: 'curator', action: { type: 'presented', action } });
  const savedReady = async () => {
    let [s] = rootReducer(createInitialAppState(), { type: 'openCuratorModal', id: 'lattice' }, {});
    [s] = rootReducer(s, { type: 'curatorPresentation', event: { type: 'presentationCompleted' } }, {});
    [s] = rootReducer(s, child({ type: 'editNotes', notes: 'Draft A' }), {});
    const [saving, effect] = rootReducer(s, child({ type: 'saveAndClose' }), { saveCuratorWork: () => Promise.resolve() });
    const out: AppAction[] = [];
    await (effect as unknown as { execute(d: (a: AppAction) => void): Promise<void> }).execute(a => out.push(a));
    return { saving, result: out[0]! };
  };

  it('readiness names the current request; a stale request id commits nothing', async () => {
    const { saving, result } = await savedReady();
    const [ready] = rootReducer(saving, result, {});
    expect(ready.curator!.closeReady).toBe(ready.saveRequestId);
    const [stale] = rootReducer(ready, child({ type: 'commitSavedClose', requestId: ready.saveRequestId - 1 }), {});
    expect(stale).toBe(ready);
  });

  it('a duplicated save result re-arms nothing after the accepted close', async () => {
    const { saving, result } = await savedReady();
    let [s] = rootReducer(saving, result, {});
    [s] = rootReducer(s, child({ type: 'commitSavedClose', requestId: s.curator!.closeReady! }), {});
    expect(s.curatorPresentation.status).toBe('dismissing');
    const [dup] = rootReducer(s, result, {});
    expect(dup.curator!.closeReady).toBeNull();
    expect(dup.curatorPresentation.status).toBe('dismissing');
  });

  it('an edit after readiness (a newer revision) clears it; the commit is refused and consumed without retry', async () => {
    const { saving, result } = await savedReady();
    const [ready] = rootReducer(saving, result, {});
    const id = ready.curator!.closeReady!;
    const [edited] = rootReducer(ready, child({ type: 'editNotes', notes: 'Draft A2' }), {});
    expect(edited.curator!.closeReady).toBeNull();
    const [refused] = rootReducer(edited, child({ type: 'commitSavedClose', requestId: id }), {});
    expect(refused).toBe(edited);
    expect(refused.curatorPresentation.status).toBe('presented');
  });

  it('a reopened instance never inherits readiness from the previous one', async () => {
    const { saving, result } = await savedReady();
    const [reopened] = rootReducer(saving, { type: 'openCuratorModal', id: 'cloud' }, {});
    const [afterStale] = rootReducer(reopened, result, {});
    expect(afterStale.curator!.spec.id).toBe('cloud');
    expect(afterStale.curator!.closeReady).toBeNull();
    expect(afterStale.curatorPresentation.status).toBe('presenting');
  });
});

/**
 * Browser tests for fluid stacked overlays in Horizon Gallery.
 *
 * Exercises the public assembled application against the overlay contract:
 * 1. O1–O4: Card -> Modal Hero flight, page/backdrop/content together on one timeline
 * 2. S7: Disjoint page interactions running while overlay is active
 * 3. I3/I4: Unsaved-change refused close, nested discard alert (O8/O9), accepted save & close
 * 4. Explicit transition entries: Close, and Save & Close bound to the accepted close after the save
 * 5. I1/I2: Rapid reopen / reversal without epoch corruption
 * 6. O5/O6: Technical specifications drawer with tab switching
 * 7. Accessible keyboard controls and focus restoration to opener
 * 8. Dynamic reduced-motion preference handling
 */
import '../src/styles.css';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { launch, settle, waitFor, frame, type Launched } from './support/observe.js';

const launched: Launched[] = [];
afterEach(async () => {
  for (const f of launched.splice(0)) await f.restore();
  document.body.style.overflow = '';
});

const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const has = (selector: string) => document.querySelector(selector) !== null;

// Motion witnesses (review R-7): engine diagnostics plus sampled computed paint, driven by trusted input.
const opacity = (selector: string) => { const el = document.querySelector(selector); return el ? Number(getComputedStyle(el).opacity) : NaN; };
const flightFrames = (f: Launched, key: string, from: number) => f.host().diagnostics.slice(from).filter(d => d.type === 'frame' && d.participant === key);
const settledReasons = (f: Launched, from: number) => f.host().diagnostics.slice(from).filter(d => d.type === 'settled').map(d => (d as { reason?: string }).reason);
const lastFrameT = (f: Launched, key: string, from: number, to?: number) => Math.max(-1, ...flightFrames(f, key, from).slice(0, to === undefined ? undefined : Math.max(0, to - from)).filter(d => to === undefined || f.host().diagnostics.indexOf(d) < to).map(d => d.t as number));
async function sampleWhile(ms: number, read: () => number): Promise<number[]> {
  const out: number[] = []; const t0 = performance.now();
  while (performance.now() - t0 < ms) { out.push(read()); await frame(); }
  return out;
}
const between = (values: number[]) => values.some(v => v > 0.02 && v < 0.98);
const click = (selector: string) => userEvent.click(page.elementLocator(q(selector)));
const status = (f: Launched) => f.app.store.state.curatorPresentation.status;

describe('stacked overlay motion witnesses (trusted input)', () => {
  it('open and close paint backdrop/content mid-flight and fly the card to the hero and back', async () => {
    const f = launch('/'); launched.push(f); await settle();
    const d0 = f.host().diagnostics.length;
    // Keyboard activation: WebKit does not focus buttons on mouse click, so focus restoration needs a focused opener.
    q('[data-open-curator="lattice"]').focus();
    await userEvent.keyboard('{Enter}');
    const backdropOpen = await sampleWhile(260, () => opacity('.curator-modal-backdrop'));
    await waitFor(() => status(f) === 'presented');
    expect(between(backdropOpen)).toBe(true);
    expect(flightFrames(f, 'card-lattice', d0).length).toBeGreaterThan(3);
    expect(settledReasons(f, d0)).toContain('completed');
    expect(document.body.style.overflow).toBe('hidden');

    const d1 = f.host().diagnostics.length;
    await userEvent.keyboard('{Escape}');
    const contentClose = await sampleWhile(200, () => opacity('.curator-modal-content'));
    await waitFor(() => status(f) === 'idle');
    expect(between(contentClose)).toBe(true);
    expect(flightFrames(f, 'card-lattice', d1).length).toBeGreaterThan(3);
    expect(settledReasons(f, d1)).toContain('completed');
    await waitFor(() => document.activeElement === q('[data-open-curator="lattice"]'));
    expect(document.body.style.overflow).toBe('');
  });

  it('explicit Close entry drives the accepted close with its own quicker plan', async () => {
    const f = launch('/'); launched.push(f); await settle();
    // Default close timing (Escape) for the same work, then the explicit Close button.
    await click('[data-open-curator="origami"]'); await waitFor(() => status(f) === 'presented');
    const dDefault = f.host().diagnostics.length;
    await userEvent.keyboard('{Escape}'); await waitFor(() => status(f) === 'idle');
    await settle();
    const dDefaultEnd = f.host().diagnostics.length;
    await click('[data-open-curator="origami"]'); await waitFor(() => status(f) === 'presented');
    const dExplicit = f.host().diagnostics.length;
    await click('[data-curator-close]'); await waitFor(() => status(f) === 'idle');
    const defaultEnd = lastFrameT(f, 'card-origami', dDefault, dDefaultEnd);
    const explicitEnd = lastFrameT(f, 'card-origami', dExplicit);
    expect(explicitEnd).toBeGreaterThan(0);
    // 240 ms explicit plan vs 380 ms default plan.
    expect(explicitEnd).toBeLessThan(defaultEnd - 60);
    expect(settledReasons(f, dExplicit)).toContain('completed');
  });

  it('a refused explicit close acquires nothing, stacks the alert above the modal, and nested Escape closes only the alert', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-open-curator="pavilion"]'); await waitFor(() => status(f) === 'presented');
    await userEvent.fill(page.elementLocator(q('[data-curator-notes]')), 'Revised tensile calculations.');
    expect(has('[data-dirty-badge]')).toBe(true);
    const d0 = f.host().diagnostics.length;
    await click('[data-curator-close]');
    const content = await sampleWhile(200, () => opacity('.curator-modal-content'));
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'presented');
    expect(status(f)).toBe('presented');
    expect(content.every(v => v === 1)).toBe(true);
    expect(flightFrames(f, 'card-pavilion', d0)).toHaveLength(0);
    // Only the alert's own open run starts. Core reports the discarded explicit preparation as settled 'superseded'
    // (review R-11, raised to core); nothing of the modal was driven, as the paint and flight checks above show.
    expect(f.host().diagnostics.slice(d0).filter(d => d.type === 'frame')).toHaveLength(0);

    // Coordinator stacking: alert centre hits the alert; a modal-content point outside the alert hits the alert's backdrop.
    const alert = q('.nested-alert-dialog').getBoundingClientRect();
    const hitAlert = document.elementFromPoint(alert.x + alert.width / 2, alert.y + alert.height / 2);
    expect(q('.nested-alert-dialog').contains(hitAlert)).toBe(true);
    const modal = q('.curator-modal-content').getBoundingClientRect();
    const hitModal = document.elementFromPoint(modal.x + 8, modal.y + 8);
    expect(q('.curator-modal-content').contains(hitModal)).toBe(false);
    expect(q('.nested-alert-dialog').contains(document.activeElement)).toBe(true);

    // Trusted Escape closes only the top layer; the dirty draft is kept.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'idle');
    expect(status(f)).toBe('presented');
    expect(f.app.store.state.curator!.isDirty).toBe(true);

    // Trusted outside click on the modal backdrop while dirty re-opens the guard instead of closing.
    await userEvent.click(page.elementLocator(q('.curator-modal-backdrop')), { position: { x: 6, y: 6 } });
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'presented');
    expect(status(f)).toBe('presented');
    await click('[data-confirm-discard]');
    await waitFor(() => status(f) === 'idle' && f.app.store.state.confirmAlertPresentation.status === 'idle');
    expect(f.app.store.state.specs.pavilion!.curatorNotes).not.toBe('Revised tensile calculations.');
  });

  it('Save & Close keeps the modal presented while saving, then its explicit plan drives the accepted close', async () => {
    const f = launch('/'); launched.push(f); await settle();
    // Default close timing reference for the same work.
    await click('[data-open-curator="cloud"]'); await waitFor(() => status(f) === 'presented');
    const dDefault = f.host().diagnostics.length;
    await userEvent.keyboard('{Escape}'); await waitFor(() => status(f) === 'idle');
    await settle();
    const dDefaultEnd = f.host().diagnostics.length;
    await click('[data-open-curator="cloud"]'); await waitFor(() => status(f) === 'presented');
    await userEvent.fill(page.elementLocator(q('[data-curator-notes]')), 'ETFE canopy revision.');
    const d0 = f.host().diagnostics.length;
    await click('[data-curator-save-close]');
    expect(f.app.store.state.curator!.isSaving).toBe(true);
    expect(status(f)).toBe('presented');
    await waitFor(() => status(f) === 'dismissing');
    expect(f.app.store.state.specs.cloud!.curatorNotes).toBe('ETFE canopy revision.');
    await waitFor(() => status(f) === 'idle');
    expect(flightFrames(f, 'card-cloud', d0).length).toBeGreaterThan(3);
    expect(settledReasons(f, d0)).toContain('completed');
    // The explicit 240 ms Save & Close plan ran, not the 380 ms default close.
    expect(lastFrameT(f, 'card-cloud', d0)).toBeLessThan(lastFrameT(f, 'card-cloud', dDefault, dDefaultEnd) - 60);
    // Exactly one bridge commit and one accepted close; the effect did not loop.
    await settle();
    expect(f.trace.filter(t => t === 'curator:commitSavedClose')).toHaveLength(1);
    expect(f.trace.filter(t => t === 'curatorSaveSucceeded')).toHaveLength(1);
  });

  it('reduced motion: fades only, no geometry frames', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-reduced-motion-toggle]');
    await waitFor(() => f.app.store.state.reducedMotion);
    const d0 = f.host().diagnostics.length;
    await click('[data-open-curator="pavilion"]');
    await waitFor(() => status(f) === 'presented');
    await click('[data-curator-close]');
    await waitFor(() => status(f) === 'idle');
    expect(f.host().diagnostics.slice(d0).filter(d => d.type === 'frame')).toHaveLength(0);
    expect(settledReasons(f, d0).filter(r => r === 'completed').length).toBeGreaterThanOrEqual(2);
  });

  it('drawer: trusted open paints mid-flight, tabs switch, Escape closes and restores focus', async () => {
    const f = launch('/'); launched.push(f); await settle();
    q('[data-open-drawer]').focus();
    await userEvent.keyboard('{Enter}');
    const panel = await sampleWhile(260, () => opacity('.drawer-panel'));
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'presented');
    expect(between(panel)).toBe(true);
    await userEvent.click(page.getByRole('tab', { name: 'Acoustics' }));
    await waitFor(() => document.body.textContent!.includes('Reverberation (T60)'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'idle');
    await waitFor(() => document.activeElement === q('[data-open-drawer]'));
  });
});

describe('stacked overlay browser experience', () => {
  it('opens curator modal from card: page, backdrop, and content mounted together', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    // Click Curator Specs on the featured Pavilion card
    const opener = q('[data-open-curator="pavilion"]');
    expect(opener).not.toBeNull();
    opener.click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Both backdrop and content are mounted together
    expect(has('.curator-modal-backdrop') || has('[data-modal-backdrop="curator"]')).toBe(true);
    expect(has('[data-modal-content="curator"]')).toBe(true);

    // Hero plate is inside modal content scope
    const hero = q('[data-modal-hero]');
    expect(hero).not.toBeNull();
    expect(hero.textContent).toContain('Pavilion of Light & Atmosphere');

    // Page catalog remains in DOM (co-animated)
    expect(has('[data-catalog]')).toBe(true);

    // Body scroll lock is engaged
    expect(document.body.style.overflow).toBe('hidden');

    // Close clean modal
    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));

    expect(has('[data-modal-content="curator"]')).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('opens non-pavilion curator modal instance (lattice), binding actual workId to instance plans', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    // Click Curator Specs on non-pavilion card (lattice)
    const opener = q('[data-open-curator="lattice"]');
    expect(opener).not.toBeNull();
    opener.click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Verify actual workId content matches lattice, not default pavilion
    const hero = q('[data-modal-hero]');
    expect(hero).not.toBeNull();
    expect(hero.textContent).toContain('Vascular Concrete Lattice');
    expect(document.body.textContent).toContain('12.4 kN/m');
    expect(document.body.textContent).toContain('22.0 m');

    // Close clean modal
    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));

    expect(has('[data-modal-content="curator"]')).toBe(false);
  });

  it('permits disjoint page interaction while overlay is presented (S7)', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    q('[data-open-curator="pavilion"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    const initialApplause = f.app.store.state.page?.type === 'home'
      ? f.app.store.state.page.state.applause
      : 0;

    // Dispatch applause action on the underlying page while modal is open
    f.app.store.dispatch({
      type: 'page',
      action: { type: 'presented', action: { type: 'home', action: { type: 'applaud' } } }
    });
    await settle();

    // Page state updated independently
    const currentApplause = f.app.store.state.page?.type === 'home'
      ? f.app.store.state.page.state.applause
      : 0;
    expect(currentApplause).toBe(initialApplause + 1);

    // Modal remains fully presented
    expect(has('[data-modal-content="curator"]')).toBe(true);

    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));
  });

  it('refuses close when dirty (I3), stacks nested discard alert (O8), then closes after save (I4)', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    q('[data-open-curator="pavilion"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Edit notes
    const textarea = q<HTMLTextAreaElement>('[data-curator-notes]');
    textarea.value = 'Revised tensile calculations for autumn load.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    // Verify dirty indicator
    expect(has('[data-dirty-badge]')).toBe(true);

    // Attempt close via close button: REFUSED (stays presented, opens nested alert)
    q('[data-curator-close]').click();
    await settle();

    // Modal must NOT close!
    expect(has('[data-modal-content="curator"]')).toBe(true);
    // Nested discard confirmation alert is active
    expect(has('[data-nested-alert]')).toBe(true);
    expect(has('.nested-alert-backdrop') || has('[data-nested-backdrop]')).toBe(true);

    // Stacking is witnessed by hit-testing in the motion-witness suite above (no app z-index numbers).

    // Click "Keep Editing" -> closes alert, modal stays open and dirty
    q('[data-keep-editing]').click();
    await settle();
    await waitFor(() => !has('[data-nested-alert]'));
    expect(has('[data-nested-alert]')).toBe(false);
    expect(has('[data-modal-content="curator"]')).toBe(true);
    expect(has('[data-dirty-badge]')).toBe(true);

    // Click Save -> runs async save effect
    q('[data-curator-save]').click();
    await settle();
    await waitFor(() => has('.clean-badge'));

    expect(has('[data-dirty-badge]')).toBe(false);

    // Now close succeeds
    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));
    expect(has('[data-modal-content="curator"]')).toBe(false);
  });

  it('Save & Close saves then closes (presence check; the explicit-plan witness is in the motion suite above)', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    q('[data-open-curator="lattice"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Save & Close: the save runs first; the view then commits the close through the explicit entry
    q('[data-curator-save-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));

    expect(has('[data-modal-content="curator"]')).toBe(false);
  });

  it('supports rapid reopen without epoch corruption (I1/I2)', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    // Open first epoch
    q('[data-open-curator="cloud"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Trigger close
    q('[data-curator-close]').click();
    await settle();

    // Immediately reopen
    q('[data-open-curator="origami"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    const hero = q('[data-modal-hero]');
    expect(hero.textContent).toContain('Acoustic Origami Facade');

    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));
  });

  it('opens technical specifications drawer and switches tabs (O5/O6)', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    // Click drawer button in navigation
    q('[data-open-drawer]').click();
    await settle();
    await waitFor(() => has('[data-drawer-content]'));

    expect(has('.drawer-backdrop') || has('[data-drawer-backdrop]')).toBe(true);
    expect(has('[data-drawer-content]')).toBe(true);

    // Default tab: Engineering
    expect(document.body.textContent).toContain('Tensile Modulus');

    // Switch to Acoustics tab
    const tabs = document.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const acousticsTab = [...tabs].find(t => t.textContent?.includes('Acoustics'));
    expect(acousticsTab).toBeDefined();
    acousticsTab!.click();
    await settle();

    expect(document.body.textContent).toContain('Reverberation (T60)');

    // Close drawer
    q('[data-drawer-close]').click();
    await settle();
    await waitFor(() => !has('[data-drawer-content]'));
    expect(has('[data-drawer-content]')).toBe(false);
  });

  it('restores focus to opener element upon dismissal', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    const opener = q('[data-open-curator="lattice"]');
    opener.focus();
    expect(document.activeElement).toBe(opener);

    await userEvent.keyboard('{Enter}');
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    // Close modal via Escape key
    await userEvent.keyboard('{Escape}');
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));

    // Focus restored to opener button
    await waitFor(() => document.activeElement === opener);
    expect(document.activeElement).toBe(opener);
  });

  it('honors reduced motion preference for overlays', async () => {
    const f = launch('/');
    launched.push(f);
    await settle();

    // Toggle reduced motion
    const toggle = q<HTMLInputElement>('[data-reduced-motion-toggle]');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(f.app.store.state.reducedMotion).toBe(true);

    // Open modal under reduced motion
    q('[data-open-curator="pavilion"]').click();
    await settle();
    await waitFor(() => has('[data-modal-content="curator"]'));

    expect(has('[data-modal-content="curator"]')).toBe(true);

    q('[data-curator-close]').click();
    await settle();
    await waitFor(() => !has('[data-modal-content="curator"]'));

    expect(has('[data-modal-content="curator"]')).toBe(false);
  });
});

// Overlay-lifetime page reaction (interface §9, core build 5): the catalog rests dimmed/contracted or pushed while
// the overlay is open, and returns from that displayed rest on an accepted close.
const catalogEl = () => q('[data-catalog]');
const catalogOpacity = () => Number(getComputedStyle(catalogEl()).opacity);
const catalogScale = () => { const v = getComputedStyle(catalogEl()).scale; return v === 'none' ? 1 : Number(v.split(' ')[0]); };
const catalogShift = () => { const v = getComputedStyle(catalogEl()).translate; return v === 'none' ? 0 : parseFloat(v.split(' ')[0]!); };
const hold = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('overlay-lifetime page reaction (trusted input)', () => {
  it('the catalog rests dimmed and contracted past the open duration, through a refused close and the nested alert, and returns on close', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-open-curator="lattice"]');
    const opening = await sampleWhile(200, catalogOpacity);
    await waitFor(() => status(f) === 'presented');
    await hold(600); await settle();
    expect(between(opening.map(v => (v - 0.88) / 0.12))).toBe(true);
    expect(catalogOpacity()).toBeCloseTo(0.88, 2);
    expect(catalogScale()).toBeCloseTo(0.98, 3);

    // Refused close (dirty) opens the nested alert: the modal's resting reaction is kept, not unwound or doubled.
    await userEvent.fill(page.elementLocator(q('[data-curator-notes]')), 'Retention check');
    await click('[data-curator-close]');
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'presented');
    await settle();
    expect(catalogOpacity()).toBeCloseTo(0.88, 2);
    expect(catalogScale()).toBeCloseTo(0.98, 3);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'idle');
    await hold(300); await settle();
    expect(status(f)).toBe('presented');
    expect(catalogOpacity()).toBeCloseTo(0.88, 2);
    expect(catalogScale()).toBeCloseTo(0.98, 3);

    // Accepted close: continues from the displayed rest (never jumps to 1 first) back to the baseline.
    await click('[data-curator-close]');
    await waitFor(() => f.app.store.state.confirmAlertPresentation.status === 'presented');
    await click('[data-confirm-discard]');
    const closing = await sampleWhile(400, catalogOpacity);
    await waitFor(() => status(f) === 'idle'); await settle();
    expect(closing[0]!).toBeLessThan(0.95);
    expect(between(closing.map(v => (v - 0.88) / 0.12))).toBe(true);
    expect(catalogOpacity()).toBe(1);
    expect(catalogScale()).toBe(1);
  });

  it('the drawer pushes the catalog aside and holds it there; closing slides it back', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-open-drawer]');
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'presented');
    await hold(600); await settle();
    expect(catalogShift()).toBeCloseTo(-32, 0);
    // The push moves the page; it must never hide it.
    expect(catalogOpacity()).toBe(1);
    await userEvent.keyboard('{Escape}');
    const paint: number[] = [];
    const back = await sampleWhile(300, () => { paint.push(catalogOpacity()); return catalogShift(); });
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'idle'); await settle();
    expect(back.some(v => v < -1 && v > -31)).toBe(true);
    expect(paint.every(v => Math.abs(v - 1) < 1e-3)).toBe(true);
    expect(catalogShift()).toBe(0);
  });

  it('reduced motion reaches the same full resting pose immediately (no intermediate geometry), and the close releases it', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-reduced-motion-toggle]');
    await waitFor(() => f.app.store.state.reducedMotion);
    await click('[data-open-curator="pavilion"]');
    const scales = await sampleWhile(250, catalogScale);
    await waitFor(() => status(f) === 'presented');
    await hold(300); await settle();
    expect(scales.every(v => v === 1 || Math.abs(v - 0.98) < 1e-3)).toBe(true);
    expect(catalogOpacity()).toBeCloseTo(0.88, 2);
    expect(catalogScale()).toBeCloseTo(0.98, 3);
    await click('[data-curator-close]');
    await waitFor(() => status(f) === 'idle'); await settle();
    expect(catalogOpacity()).toBe(1);
    expect(catalogScale()).toBe(1);

    await click('[data-open-drawer]');
    const shifts = await sampleWhile(250, catalogShift);
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'presented');
    await hold(300); await settle();
    expect(shifts.every(v => v === 0 || Math.abs(v + 32) < 0.5)).toBe(true);
    expect(catalogShift()).toBeCloseTo(-32, 0);
    expect(catalogOpacity()).toBe(1);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => f.app.store.state.drawerPresentation.status === 'idle'); await settle();
    expect(catalogShift()).toBe(0);
    expect(catalogOpacity()).toBe(1);
  });

  it('rapid reopen during the close re-rests the catalog for the new instance, then releases it once', async () => {
    const f = launch('/'); launched.push(f); await settle();
    await click('[data-open-curator="cloud"]');
    await waitFor(() => status(f) === 'presented'); await hold(400);
    await click('[data-curator-close]');
    await hold(90);
    const midClose = catalogOpacity();
    // Reopen intent while the close is running (the page opener is under the closing backdrop).
    f.app.store.dispatch({ type: 'openCuratorModal', id: 'cloud' });
    await waitFor(() => status(f) === 'presented'); await hold(600); await settle();
    console.log('RAPID_REOPEN', JSON.stringify({ midClose, rest: catalogOpacity(), scale: catalogScale() }));
    expect(catalogOpacity()).toBeCloseTo(0.88, 2);
    expect(catalogScale()).toBeCloseTo(0.98, 3);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => status(f) === 'idle'); await hold(200); await settle();
    expect(catalogOpacity()).toBe(1);
    expect(catalogScale()).toBe(1);
  });
});

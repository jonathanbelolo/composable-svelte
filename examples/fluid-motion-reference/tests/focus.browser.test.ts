/**
 * Focused-control visibility witness (reviewer follow-up F1). The study's Back control is keyboard-focused
 * while the card travels into and out of the study, including on a short viewport where the decorative card
 * really passes over it and across a mid-run resize. Contract: the real control and its focus ring stay
 * painted in front of decoration. Evidence: per-frame layer facts for every overlap frame, plus composited
 * screenshot pixels on the focus ring inside the overlap, with a negative control. Writes no evidence files.
 */
import '../src/styles.css';
import { afterEach, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { launch, settle, waitFor, type Launched } from './support/observe.js';

const launched: Launched[] = [];
afterEach(async () => { for (const f of launched.splice(0)) await f.restore(); await page.viewport(1280, 900); });
const q = (selector: string) => document.querySelector<HTMLElement>(selector)!;

/** First ancestor (exclusive of the root) that would put `el` into a separate stacking context. */
function isolatingAncestor(el: Element): string | undefined {
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (s.transform !== 'none' || s.translate !== 'none' || s.filter !== 'none' || s.isolation !== 'auto' || Number(s.opacity) < 1 || s.contain !== 'none' || (s.position !== 'static' && s.zIndex !== 'auto')) return node.tagName + '.' + node.className;
  }
  return undefined;
}
const effectiveOpacity = (rep: HTMLElement) => Number(getComputedStyle(rep).opacity) * (rep.firstElementChild ? Number(getComputedStyle(rep.firstElementChild).opacity) : 1);
/** Representations with nonzero effective opacity that intersect the Back control. */
function covering(back: HTMLElement) {
  const b = back.getBoundingClientRect();
  return [...document.querySelectorAll<HTMLElement>('[data-route-representation]')].filter(rep => {
    const r = rep.getBoundingClientRect();
    return effectiveOpacity(rep) > 0.05 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  });
}
/** Layer facts making the positioned Back nav paint after the z-index:auto route plane (CSS 2.1 Appendix E). */
function layerFacts(back: HTMLElement): string[] {
  const nav = back.closest('nav')!, plane = q('[data-composable-route-plane]');
  const problems: string[] = [];
  if (getComputedStyle(nav).position === 'static') problems.push('nav not positioned');
  if (getComputedStyle(nav).zIndex !== 'auto' || getComputedStyle(plane).zIndex !== 'auto') problems.push('explicit z-index');
  if (!(plane.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING)) problems.push('plane after nav');
  for (const el of [nav, plane]) { const iso = isolatingAncestor(el); if (iso) problems.push(`isolated by ${iso}`); }
  return problems;
}
/** Composited pixel colour (screenshot of the test frame) at a viewport point. */
async function pixel<T>(x: number, y: number, afterCapture: () => T): Promise<{ rgb: [number, number, number]; check: T }> {
  const base64 = await page.screenshot({ save: false });
  // Checked the moment the capture resolves, before decoding (decoding adds tens to hundreds of ms).
  const check = afterCapture();
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
  const scale = bitmap.width / window.innerWidth;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const [r, g, b] = context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
  return { rgb: [r!, g!, b!], check };
}
const ring: [number, number, number] = [0x38, 0xbd, 0xf8];
const near = (a: readonly number[], b: readonly number[]) => a.every((value, i) => Math.abs(value - b[i]!) < 40);

async function openFocused(f: Launched, options: { resizeTo?: [number, number]; negativeControl?: boolean } = {}) {
  await settle();
  q('[data-open-study]').focus();
  await userEvent.keyboard('{Enter}');
  const report = { focusedFrames: 0, overlapFrames: 0, problems: [] as string[], ringPixel: undefined as undefined | { point: number[]; rgb: number[]; runMs: number; opacityAtRequest: number; coveredAfterCapture: boolean; opacityAfterCapture: number } };
  await waitFor(() => !!document.querySelector('[data-close-study]'));
  const back = q('[data-close-study]');
  if (options.negativeControl) back.closest('nav')!.style.position = 'static'; // test-only: removes the foreground layer
  back.focus();
  // Every frame is sampled by its own rAF loop, independent of the (slow) screenshot below.
  let running = true, firstOverlap: { point: number[]; opacity: number; runMs: number; rep: HTMLElement } | undefined;
  const sampleFrame = () => {
    if (!running) return;
    if (document.activeElement !== back || !back.matches(':focus-visible') || getComputedStyle(back).opacity !== '1') report.problems.push('focus not visible');
    else report.focusedFrames++;
    const reps = covering(back);
    if (reps.length) {
      report.overlapFrames++;
      report.problems.push(...layerFacts(back));
      if (!firstOverlap) {
        // A point on the BOTTOM edge of the focus ring (3px outline, 3px offset) inside the covering representation:
        // the card copy descends past the ring's top edge first, so the bottom edge stays covered longest.
        const b = back.getBoundingClientRect(), r = reps[0]!.getBoundingClientRect();
        const x = (Math.max(b.left, r.left) + Math.min(b.right, r.right)) / 2, y = b.bottom + 4.5;
        if (y < r.bottom && y > r.top) firstOverlap = { point: [x, y], opacity: effectiveOpacity(reps[0]!), runMs: Math.round((f.diagnostics('frame').at(-1)?.t as number) ?? 0), rep: reps[0]! };
      }
    }
    requestAnimationFrame(sampleFrame);
  };
  requestAnimationFrame(sampleFrame);
  if (options.resizeTo) await page.viewport(...options.resizeTo);
  await waitFor(() => !!firstOverlap || f.diagnostics('settled').length > 0, 8000);
  if (firstOverlap) {
    // Validity: the copy only descends and fades here, so if it still covers the point (visibly) when the
    // screenshot resolves, it covered it when the screenshot was composited.
    const [px, py] = firstOverlap.point as [number, number];
    const rep = firstOverlap.rep;
    const { rgb, check } = await pixel(px, py, () => {
      const r = rep.isConnected ? rep.getBoundingClientRect() : undefined;
      const opacity = r ? effectiveOpacity(rep) : 0;
      return { covered: !!r && px > r.left && px < r.right && py > r.top && py < r.bottom && opacity > 0.3, opacity };
    });
    const covered = check.covered, opacityAfter = check.opacity;
    report.ringPixel = { point: firstOverlap.point.map(Math.round), rgb, runMs: firstOverlap.runMs, opacityAtRequest: Math.round(firstOverlap.opacity * 100) / 100, coveredAfterCapture: covered, opacityAfterCapture: Math.round(opacityAfter * 100) / 100 };
  }
  await waitFor(() => f.diagnostics('settled').length > 0, 8000);
  running = false;
  console.info('F1 report', JSON.stringify({ viewport: [innerWidth, innerHeight], ...report, problems: [...new Set(report.problems)] }));
  return report;
}

/**
 * Runs a scenario until its pixel sample is valid (the decoration covered the ring at capture), at most 5 times.
 * Screenshot latency (~100–300 ms) against a ~300 ms covered window makes single captures miss; validity is checked
 * independently after each capture and every attempt, valid or not, is logged. Nothing about the criterion changes.
 */
async function validSample(options: { negativeControl?: boolean }) {
  const attempts: unknown[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.viewport(1280, 400);
    const f = launch('/'); launched.push(f);
    const report = await openFocused(f, options);
    attempts.push(report.ringPixel);
    if (report.ringPixel?.coveredAfterCapture) return { f, report, attempts };
    await f.restore();
  }
  throw new Error(`no valid covered sample in 5 attempts: ${JSON.stringify(attempts)}`);
}

it('normal viewport: Back stays focused, visible and in front wherever decoration crosses it', async () => {
  const f = launch('/'); launched.push(f);
  const report = await openFocused(f);
  expect(report.focusedFrames).toBeGreaterThan(5);
  expect(report.problems).toEqual([]);
});

it('short viewport: the card really passes over Back, which is painted in front of it', async () => {
  const { f, report, attempts } = await validSample({});
  console.info('F1 attempts', JSON.stringify(attempts));
  expect(report.overlapFrames).toBeGreaterThan(3);
  expect(report.problems).toEqual([]);
  expect(report.ringPixel).toBeDefined();
  expect(near(report.ringPixel!.rgb, ring)).toBe(true);
  // Closing from the focused control with the keyboard; the plane is still behind the real Back until it unmounts.
  const back = q('[data-close-study]');
  await userEvent.keyboard('{Enter}');
  const closing: string[] = [];
  let closingOverlap = 0;
  while (f.diagnostics('settled').length < 2) {
    if (back.isConnected && covering(back).length) { closingOverlap++; closing.push(...layerFacts(back)); if (document.activeElement === back && !back.matches(':focus-visible')) closing.push('focus not visible'); }
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  console.info('F1 closing', JSON.stringify({ closingOverlap, problems: [...new Set(closing)] }));
  expect(closingOverlap).toBeGreaterThan(0);
  expect(closing).toEqual([]);
});

it('resize to a short viewport mid-run keeps Back in front', async () => {
  const f = launch('/'); launched.push(f);
  const report = await openFocused(f, { resizeTo: [1280, 400] });
  expect(report.overlapFrames).toBeGreaterThan(0);
  expect(report.problems).toEqual([]);
  expect(report.focusedFrames).toBeGreaterThan(5);
});

it('negative control: without the foreground layer the same frame shows the card over the focus ring', async () => {
  const { report, attempts } = await validSample({ negativeControl: true });
  console.info('F1 attempts', JSON.stringify(attempts));
  expect(report.overlapFrames).toBeGreaterThan(0);
  expect(report.problems).toContain('nav not positioned');
  expect(report.ringPixel).toBeDefined();
  expect(near(report.ringPixel!.rgb, ring)).toBe(false);
});

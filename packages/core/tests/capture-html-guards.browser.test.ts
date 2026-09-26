import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureHTML } from '../src/lib/application/renderer/capture-html.js';

describe('captureHTML safety guards', () => {
	const elementsToClean: Element[] = [];

	afterEach(() => {
		vi.restoreAllMocks();
		for (const element of elementsToClean) {
			element.remove();
		}
		elementsToClean.length = 0;
	});

	function append<T extends Element>(element: T): T {
		document.body.appendChild(element);
		elementsToClean.push(element);
		return element;
	}

	it('captures accepted safe connected HTML snapshot with stripped attributes and downgraded controls', () => {
		const container = append(document.createElement('div'));
		container.id = 'source-root';
		container.setAttribute('onclick', 'window.test=true');
		container.style.cssText = 'color: rgb(255, 0, 0); width: 100px; height: 100px;';

		const button = document.createElement('button');
		button.id = 'button-control';
		button.setAttribute('onclick', 'window.test=true');
		button.textContent = 'Submit';

		const anchor = document.createElement('a');
		anchor.setAttribute('href', 'https://example.com');
		anchor.textContent = 'Navigate';

		const paragraph = document.createElement('p');
		paragraph.textContent = 'Safe copy';

		container.append(button, anchor, paragraph);

		const outcome = captureHTML(container);
		expect(outcome.kind).toBe('captured');
		if (outcome.kind !== 'captured') return;

		expect(outcome.node.inert).toBe(true);
		expect(outcome.node.getAttribute('aria-hidden')).toBe('true');
		expect(outcome.node.style.position).toBe('fixed');
		expect(outcome.node.style.pointerEvents).toBe('none');
		expect(outcome.node.style.overflow).toBe('hidden');
		expect(outcome.node.style.contain).toBe('strict');

		expect(outcome.node.querySelector('#source-root')).toBeNull();
		expect(outcome.node.querySelector('#button-control')).toBeNull();
		expect(outcome.node.hasAttribute('onclick')).toBe(false);

		expect(outcome.node.querySelector('button')).toBeNull();
		expect(outcome.node.querySelector('a')).toBeNull();

		const spans = outcome.node.querySelectorAll('span');
		expect(spans).toHaveLength(2);
		expect(spans[0]?.textContent).toBe('Submit');
		expect(spans[0]?.hasAttribute('onclick')).toBe(false);
		expect(spans[1]?.textContent).toBe('Navigate');
		expect(spans[1]?.hasAttribute('href')).toBe(false);

		const visualRoot = outcome.node.firstElementChild as HTMLElement;
		expect(visualRoot.style.color).toBe('rgb(255, 0, 0)');
	});

	it('skips disconnected source elements', () => {
		const detached = document.createElement('div');
		detached.textContent = 'detached';
		const outcome = captureHTML(detached);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'disconnected' });
	});

	it('skips when ancestor has transformed space', () => {
		const ancestor = append(document.createElement('div'));
		ancestor.style.transform = 'matrix(1, 0, 0, 1, 10, 20)';

		const source = document.createElement('div');
		source.style.cssText = 'width: 50px; height: 50px;';
		ancestor.appendChild(source);

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'transformed-space' });
	});

	it('skips when ancestor has opacity other than 1', () => {
		const ancestor = append(document.createElement('div'));
		ancestor.style.opacity = '0.5';

		const source = document.createElement('div');
		source.style.cssText = 'width: 50px; height: 50px;';
		ancestor.appendChild(source);

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'ancestor-opacity' });
	});

	it('allows non-1 opacity on source itself while preserving property', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px; opacity: 0.5;';

		const outcome = captureHTML(source);
		expect(outcome.kind).toBe('captured');
		if (outcome.kind !== 'captured') return;
		const visualRoot = outcome.node.firstElementChild as HTMLElement;
		expect(visualRoot.style.opacity).toBe('0.5');
	});

	it('skips when ancestor has clipping space (overflow visible violated)', () => {
		const ancestor = append(document.createElement('div'));
		ancestor.style.overflow = 'hidden';

		const source = document.createElement('div');
		source.style.cssText = 'width: 50px; height: 50px;';
		ancestor.appendChild(source);

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'clipped-space' });
	});

	it('skips when geometry has zero dimensions', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 0px; height: 0px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'missing-geometry' });
	});

	it('skips nonfinite geometry via controlled rect spy', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';
		vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(
			new DOMRect(NaN, 0, 50, 50)
		);

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'missing-geometry' });
	});

	it('skips when node budget of 128 nodes is exceeded', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';
		for (let i = 0; i < 130; i++) {
			source.appendChild(document.createElement('span'));
		}

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'snapshot-budget' });
	});

	it('skips unsupported content tag', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';
		source.appendChild(document.createElement('img'));

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-content' });
	});

	it('skips unsupported namespace (e.g. SVG)', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';
		source.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-content' });
	});

	it('skips unsupported layout (display: flex)', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'display: flex; width: 50px; height: 50px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-layout' });
	});

	it('skips unsupported layout (display: grid)', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'display: grid; width: 50px; height: 50px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-layout' });
	});

	it('skips unsupported layout (position: relative)', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'position: relative; width: 50px; height: 50px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-layout' });
	});

	it('skips elements with shadow roots', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';
		const child = document.createElement('div');
		child.attachShadow({ mode: 'open' });
	source.appendChild(child);

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-rendering' });
	});

	it('skips elements with background images', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'background-image: linear-gradient(to right, red, blue); width: 50px; height: 50px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-rendering' });
	});

	it('skips elements with generated pseudo-element content', () => {
		const style = append(document.createElement('style'));
		style.textContent = '.has-pseudo::before { content: "generated"; }';

		const source = append(document.createElement('div'));
		source.className = 'has-pseudo';
		source.style.cssText = 'width: 50px; height: 50px;';

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unsupported-rendering' });
	});

	it('skips when geometry changes during capture (unstable geometry)', () => {
		const source = append(document.createElement('div'));
		source.style.cssText = 'width: 50px; height: 50px;';

		let count = 0;
		vi.spyOn(source, 'getBoundingClientRect').mockImplementation(() => {
			count++;
			if (count === 1) {
				return new DOMRect(10, 10, 50, 50);
			}
			return new DOMRect(20, 10, 50, 50);
		});

		const outcome = captureHTML(source);
		expect(outcome).toEqual({ kind: 'skipped', reason: 'unstable-geometry' });
	});
});

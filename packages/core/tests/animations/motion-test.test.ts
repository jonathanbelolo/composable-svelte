/**
 * Simple test to verify Motion One is working in browser environment.
 */

import { describe, it, expect } from 'vitest';
import { animate } from 'motion';

describe('Motion One Basic Test', () => {
	it('should import Motion One animate function', () => {
		expect(typeof animate).toBe('function');
	});

	it('should animate element with duration', async () => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		try {
			console.log('Initial opacity:', window.getComputedStyle(div).opacity);

			const animation = animate(
				div,
				{ opacity: [0, 1] },
				{ duration: 0.2 }
			);

			await animation.finished;

			// Give one more frame for styles to apply
			await new Promise(resolve => requestAnimationFrame(resolve));

			const computedOpacity = window.getComputedStyle(div).opacity;
			console.log('Final computed opacity:', computedOpacity);
			expect(parseFloat(computedOpacity)).toBe(1);
		} catch (error) {
			console.error('Animation error:', error);
			throw error;
		} finally {
			document.body.removeChild(div);
		}
	});

	it('should animate with spring type', async () => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		try {
			console.log('Initial opacity:', window.getComputedStyle(div).opacity);

			const animation = animate(
				div,
				{ opacity: [0, 1], scale: [0.95, 1] },
				{
					type: 'spring',
					visualDuration: 0.3,
					bounce: 0.25
				}
			);

			await animation.finished;

			// Give one more frame for styles to apply
			await new Promise(resolve => requestAnimationFrame(resolve));

			const computedOpacity = window.getComputedStyle(div).opacity;
			console.log('Final computed opacity:', computedOpacity);
			expect(parseFloat(computedOpacity)).toBe(1);
		} catch (error) {
			console.error('Animation error:', error);
			throw error;
		} finally {
			document.body.removeChild(div);
		}
	});
});

/**
 * `Tooltip` used `onfocus` / `onblur` on its positioning `<div>`. Neither event
 * bubbles, and the div has no `tabindex`, so it can never be focused itself —
 * the handlers were dead and keyboard users never saw a tooltip. `focusin` /
 * `focusout` do bubble, so focusing the wrapped trigger now reaches them.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TooltipKeyboardTest from './test-components/TooltipKeyboardTest.svelte';

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Tooltip keyboard access', () => {
	it('shows on focus of the wrapped trigger', async () => {
		const { container } = render(TooltipKeyboardTest, { content: 'Saved' });
		await settle(50);

		expect(container.querySelector('[role="tooltip"]'), 'hidden before focus').toBeNull();

		container.querySelector('button')!.focus();
		await settle();

		expect(
			container.querySelector('[role="tooltip"]'),
			'focusing the trigger must reveal the tooltip'
		).not.toBeNull();
	});
});

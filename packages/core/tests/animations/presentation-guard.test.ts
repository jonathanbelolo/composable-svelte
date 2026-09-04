import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ModalTest from './test-components/ModalTest.svelte';

describe('presentationCompleted arriving outside `presenting`', () => {
	it('is refused, rather than building a `presented` state with no content', async () => {
		render(ModalTest, { startOpen: false });
		const store = (window as never as Record<string, any>).__modalTestStore;

		expect(store.state.presentation).toEqual({ status: 'idle' });

		// `ModalPrimitive` only fires this from its `presenting` branch, so a
		// component cannot produce it here — but a reducer is reachable directly,
		// and without the guard the spread yields `{ status: 'presented' }` with
		// no `content`, which is not a `PresentationState`.
		store.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } });

		expect(store.state.presentation).toEqual({ status: 'idle' });
	});
});

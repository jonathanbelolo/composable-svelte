import { describe, it, expect } from 'vitest';
import { dropdownMenuReducer } from '../../src/lib/components/ui/dropdown-menu/dropdown-menu.reducer.js';
import {
	createInitialDropdownMenuState,
	type DropdownMenuState
} from '../../src/lib/components/ui/dropdown-menu/dropdown-menu.types.js';

describe('dropdownMenuReducer presentation guard', () => {
	it('refuses presentationCompleted when idle rather than building presented state without content', () => {
		const initialState = createInitialDropdownMenuState([]);
		expect(initialState.presentation).toEqual({ status: 'idle' });

		const [nextState] = dropdownMenuReducer(
			initialState,
			{ type: 'presentation', event: { type: 'presentationCompleted' } },
			{}
		);
		expect(nextState.presentation).toEqual({ status: 'idle' });
	});

	it('refuses presentationCompleted in stale wrong-phase (dismissing)', () => {
		const dismissingState: DropdownMenuState = {
			...createInitialDropdownMenuState([]),
			presentation: { status: 'dismissing', content: true }
		};

		const [nextState] = dropdownMenuReducer(
			dismissingState,
			{ type: 'presentation', event: { type: 'presentationCompleted' } },
			{}
		);
		expect(nextState.presentation).toEqual({ status: 'dismissing', content: true });
	});

	it('accepts presentationCompleted when presenting and transitions to presented', () => {
		const [presentingState] = dropdownMenuReducer(createInitialDropdownMenuState([]), { type: 'opened' }, {});
		expect(presentingState.presentation).toEqual({ status: 'presenting', content: true });

		const [presentedState] = dropdownMenuReducer(
			presentingState,
			{ type: 'presentation', event: { type: 'presentationCompleted' } },
			{}
		);
		expect(presentedState.presentation).toEqual({ status: 'presented', content: true });
	});
});

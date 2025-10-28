/**
 * Tests for Command Palette
 *
 * Tests search/filtering, keyboard navigation, command execution, and edge cases.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '../src/test/test-store.js';
import { commandReducer } from '../src/components/command/command.reducer.js';
import {
	createInitialCommandState,
	type CommandItem
} from '../src/components/command/command.types.js';

describe('Command Palette', () => {
	// Sample commands for testing
	const sampleCommands: CommandItem[] = [
		{ id: '1', label: 'New File', description: 'Create a new file', keywords: ['create', 'add'] },
		{ id: '2', label: 'Open File', description: 'Open an existing file', keywords: ['load'] },
		{ id: '3', label: 'Save File', description: 'Save current file', keywords: ['write'] },
		{
			id: '4',
			label: 'Delete File',
			description: 'Delete current file',
			keywords: ['remove'],
			disabled: true
		},
		{ id: '5', label: 'New Folder', description: 'Create a new folder', keywords: ['directory'] }
	];

	describe('Opening and Closing', () => {
		it('opens the command palette', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands }),
				reducer: commandReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.query).toBe('');
				expect(state.selectedIndex).toBe(0);
				expect(state.filteredCommands).toEqual(sampleCommands);
			});

			store.assertNoPendingActions();
		});

		it('closes the command palette', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'closed' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.query).toBe('');
				expect(state.selectedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});

		it('toggles open state', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands }),
				reducer: commandReducer
			});

			// Toggle open
			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			// Toggle closed
			await store.send({ type: 'toggled' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.query).toBe('');
			});

			store.assertNoPendingActions();
		});

		it('resets state when opening', async () => {
			const initialState = createInitialCommandState({ commands: sampleCommands });
			initialState.query = 'test';
			initialState.selectedIndex = 2;
			initialState.filteredCommands = [sampleCommands[0]];

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.query).toBe('');
				expect(state.selectedIndex).toBe(0);
				expect(state.filteredCommands).toEqual(sampleCommands);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Search and Filtering', () => {
		it('filters commands by label', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'file' }, (state) => {
				expect(state.query).toBe('file');
				expect(state.filteredCommands).toHaveLength(3);
				expect(state.filteredCommands.map((c) => c.id)).toEqual(['1', '2', '3']);
				expect(state.selectedIndex).toBe(0); // Reset to first result
			});

			store.assertNoPendingActions();
		});

		it('filters commands by description', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'create' }, (state) => {
				expect(state.filteredCommands).toHaveLength(2);
				expect(state.filteredCommands.map((c) => c.id)).toEqual(['1', '5']);
			});

			store.assertNoPendingActions();
		});

		it('filters commands by keywords', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'directory' }, (state) => {
				expect(state.filteredCommands).toHaveLength(1);
				expect(state.filteredCommands[0].id).toBe('5');
			});

			store.assertNoPendingActions();
		});

		it('returns empty array for no matches', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'xyz123' }, (state) => {
				expect(state.filteredCommands).toHaveLength(0);
				expect(state.selectedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('filters case-insensitively', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'FILE' }, (state) => {
				expect(state.filteredCommands).toHaveLength(3);
			});

			await store.send({ type: 'queryChanged', query: 'FiLe' }, (state) => {
				expect(state.filteredCommands).toHaveLength(3);
			});

			store.assertNoPendingActions();
		});

		it('excludes disabled commands from search results', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'delete' }, (state) => {
				expect(state.filteredCommands).toHaveLength(0); // Disabled command filtered out
			});

			store.assertNoPendingActions();
		});

		it('clears query', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.query = 'file';
			initialState.filteredCommands = [sampleCommands[0]];

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'clearQuery' }, (state) => {
				expect(state.query).toBe('');
				expect(state.filteredCommands).toEqual(sampleCommands);
				expect(state.selectedIndex).toBe(0);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Max Results Limit', () => {
		it('limits results to maxResults', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({
					commands: sampleCommands,
					isOpen: true,
					maxResults: 2
				}),
				reducer: commandReducer
			});

			await store.send({ type: 'queryChanged', query: 'file' }, (state) => {
				expect(state.filteredCommands).toHaveLength(2); // Limited to 2
			});

			store.assertNoPendingActions();
		});

		it('applies maxResults when updating commands', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({
					commands: [],
					isOpen: true,
					maxResults: 2
				}),
				reducer: commandReducer
			});

			await store.send({ type: 'commandsUpdated', commands: sampleCommands }, (state) => {
				expect(state.filteredCommands).toHaveLength(2); // Limited to 2
			});

			store.assertNoPendingActions();
		});
	});

	describe('Keyboard Navigation', () => {
		const filteredCommands: CommandItem[] = [
			sampleCommands[0],
			sampleCommands[1],
			sampleCommands[2]
		];

		it('navigates to next command', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('navigates to previous command', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 2;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'previousCommand' }, (state) => {
				expect(state.selectedIndex).toBe(1);
			});

			store.assertNoPendingActions();
		});

		it('wraps around to beginning when at end', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 2; // Last item

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(0); // Wrapped to first
			});

			store.assertNoPendingActions();
		});

		it('wraps around to end when at beginning', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 0; // First item

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'previousCommand' }, (state) => {
				expect(state.selectedIndex).toBe(2); // Wrapped to last
			});

			store.assertNoPendingActions();
		});

		it('ignores navigation when no commands', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = [];
			initialState.selectedIndex = -1;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(-1);
			});

			await store.send({ type: 'previousCommand' }, (state) => {
				expect(state.selectedIndex).toBe(-1);
			});

			store.assertNoPendingActions();
		});

		it('selects command by index', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'selectCommand', index: 2 }, (state) => {
				expect(state.selectedIndex).toBe(2);
			});

			store.assertNoPendingActions();
		});

		it('ignores invalid selection index', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 1;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'selectCommand', index: 10 }, (state) => {
				expect(state.selectedIndex).toBe(1); // Unchanged
			});

			await store.send({ type: 'selectCommand', index: -1 }, (state) => {
				expect(state.selectedIndex).toBe(1); // Unchanged
			});

			store.assertNoPendingActions();
		});
	});

	describe('Command Execution', () => {
		it('executes selected command and closes palette', async () => {
			const executedCommands: CommandItem[] = [];
			const command = sampleCommands[1];

			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = [command];
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd) => executedCommands.push(cmd)
				}
			});

			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.query).toBe('');
				expect(state.selectedIndex).toBe(0);
			});

			store.assertNoPendingActions();
			expect(executedCommands).toEqual([command]);
		});

		it('executes command by index', async () => {
			const executedCommands: CommandItem[] = [];
			const filteredCommands = [sampleCommands[0], sampleCommands[1], sampleCommands[2]];

			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = filteredCommands;
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd) => executedCommands.push(cmd)
				}
			});

			await store.send({ type: 'executeCommand', index: 2 }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(executedCommands).toEqual([sampleCommands[2]]);
		});

		it('ignores execution of disabled commands', async () => {
			const executedCommands: CommandItem[] = [];
			const disabledCommand = sampleCommands[3]; // Disabled

			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = [disabledCommand];
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd) => executedCommands.push(cmd)
				}
			});

			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(true); // Still open
			});

			store.assertNoPendingActions();
			expect(executedCommands).toHaveLength(0); // Not executed
		});

		it('ignores execution with invalid index', async () => {
			const executedCommands: CommandItem[] = [];

			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = [sampleCommands[0]];
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd) => executedCommands.push(cmd)
				}
			});

			await store.send({ type: 'executeCommand', index: 10 }, (state) => {
				expect(state.isOpen).toBe(true); // Still open
			});

			store.assertNoPendingActions();
			expect(executedCommands).toHaveLength(0);
		});

		it('calls onSelect callback if provided', async () => {
			const onSelectCalled: string[] = [];

			const commandWithCallback: CommandItem = {
				id: 'test',
				label: 'Test',
				onSelect: () => onSelectCalled.push('called')
			};

			const initialState = createInitialCommandState({
				commands: [commandWithCallback],
				isOpen: true
			});
			initialState.filteredCommands = [commandWithCallback];
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(onSelectCalled).toEqual(['called']);
		});

		it('dispatches action if provided', async () => {
			const dispatchedActions: any[] = [];

			const commandWithAction: CommandItem = {
				id: 'test',
				label: 'Test',
				action: { type: 'customAction', payload: 'test' }
			};

			const initialState = createInitialCommandState({
				commands: [commandWithAction],
				isOpen: true
			});
			initialState.filteredCommands = [commandWithAction];
			initialState.selectedIndex = 0;

			const store = createTestStore({
				initialState,
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd, dispatch) => {
						if (cmd.action) {
							dispatchedActions.push(cmd.action);
							dispatch(cmd.action);
						}
					}
				}
			});

			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(false);
			});

			// Receive the dispatched custom action
			await store.receive({ type: 'customAction', payload: 'test' }, (state) => {
				// The custom action doesn't change command state, so state should be unchanged
				expect(state.isOpen).toBe(false);
			});

			store.assertNoPendingActions();
			expect(dispatchedActions).toEqual([{ type: 'customAction', payload: 'test' }]);
		});
	});

	describe('Commands Update', () => {
		it('updates commands and refilters', async () => {
			const initialState = createInitialCommandState({
				commands: [sampleCommands[0]],
				isOpen: true
			});
			initialState.query = 'file';
			initialState.filteredCommands = [sampleCommands[0]];

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			const newCommands = [...sampleCommands];

			await store.send({ type: 'commandsUpdated', commands: newCommands }, (state) => {
				expect(state.commands).toEqual(newCommands);
				expect(state.filteredCommands).toHaveLength(3); // Re-filtered with query 'file'
			});

			store.assertNoPendingActions();
		});

		it('adjusts selectedIndex when commands shrink', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.filteredCommands = sampleCommands;
			initialState.selectedIndex = 4; // Last item

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			const newCommands = [sampleCommands[0], sampleCommands[1]]; // Only 2 items

			await store.send({ type: 'commandsUpdated', commands: newCommands }, (state) => {
				expect(state.selectedIndex).toBe(1); // Adjusted to last valid index
			});

			store.assertNoPendingActions();
		});
	});

	describe('Reset', () => {
		it('resets state to initial values', async () => {
			const initialState = createInitialCommandState({
				commands: sampleCommands,
				isOpen: true
			});
			initialState.query = 'test';
			initialState.selectedIndex = 2;
			initialState.filteredCommands = [sampleCommands[0]];

			const store = createTestStore({
				initialState,
				reducer: commandReducer
			});

			await store.send({ type: 'reset' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.query).toBe('');
				expect(state.selectedIndex).toBe(0);
				expect(state.filteredCommands).toEqual(sampleCommands);
			});

			store.assertNoPendingActions();
		});
	});

	describe('Custom Filter Function', () => {
		it('uses custom filter function', async () => {
			const customFilter = vi.fn(
				(commands: CommandItem[], query: string): CommandItem[] => {
					// Custom logic: only return commands with exact label match
					return commands.filter((cmd) => cmd.label.toLowerCase() === query.toLowerCase());
				}
			);

			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands, isOpen: true }),
				reducer: commandReducer,
				dependencies: {
					filterFunction: customFilter
				}
			});

			await store.send({ type: 'queryChanged', query: 'New File' }, (state) => {
				expect(state.filteredCommands).toHaveLength(1);
				expect(state.filteredCommands[0].id).toBe('1');
			});

			store.assertNoPendingActions();
			expect(customFilter).toHaveBeenCalledWith(sampleCommands, 'New File');
		});
	});

	describe('Full User Flow', () => {
		it('complete command palette flow', async () => {
			const executedCommands: CommandItem[] = [];

			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands }),
				reducer: commandReducer,
				dependencies: {
					onCommandExecute: (cmd) => executedCommands.push(cmd)
				}
			});

			// Open palette
			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
				expect(state.filteredCommands).toEqual(sampleCommands);
			});

			// Search
			await store.send({ type: 'queryChanged', query: 'file' }, (state) => {
				expect(state.filteredCommands).toHaveLength(3);
				expect(state.selectedIndex).toBe(0);
			});

			// Navigate
			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(1);
			});

			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(2);
			});

			// Execute
			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(false);
				expect(state.query).toBe('');
			});

			store.assertNoPendingActions();
			expect(executedCommands).toEqual([sampleCommands[2]]); // Save File
		});

		it('handles no results gracefully', async () => {
			const store = createTestStore({
				initialState: createInitialCommandState({ commands: sampleCommands }),
				reducer: commandReducer
			});

			await store.send({ type: 'opened' }, (state) => {
				expect(state.isOpen).toBe(true);
			});

			await store.send({ type: 'queryChanged', query: 'nonexistent' }, (state) => {
				expect(state.filteredCommands).toHaveLength(0);
				expect(state.selectedIndex).toBe(-1);
			});

			// Try to navigate (should be no-op)
			await store.send({ type: 'nextCommand' }, (state) => {
				expect(state.selectedIndex).toBe(-1);
			});

			// Try to execute (should be no-op)
			await store.send({ type: 'executeCommand' }, (state) => {
				expect(state.isOpen).toBe(true); // Still open
			});

			store.assertNoPendingActions();
		});
	});
});

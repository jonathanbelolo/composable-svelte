import { Command, commandReducer, createInitialCommandState } from '@composable-svelte/core';
import type { CommandItemData, CommandGroupData } from '@composable-svelte/core';
import { Toaster, toastReducer, createToastStore, Command as CombinedCommand } from '@composable-svelte/core/components';

const item: CommandItemData = { id: 'open', label: 'Open' };
const group: CommandGroupData = { id: 'files', label: 'Files' };
void [Command, CombinedCommand, commandReducer, createInitialCommandState, Toaster, toastReducer, createToastStore, item, group];

import { expect, it } from 'vitest';
import * as root from '../src/lib/index.js';
import * as components from '../src/lib/components/index.js';
import * as command from '../src/lib/components/command/index.js';
import * as toast from '../src/lib/components/toast/index.js';

it('exposes the command assembly through the root and combined component entry', () => {
  const names = ['Command', 'CommandInput', 'CommandList', 'CommandGroup', 'CommandItem', 'commandReducer', 'createInitialCommandState'] as const;
  for (const name of names) {
    expect(Reflect.get(root, name), `root ${name}`).toBe(Reflect.get(command, name));
    expect(Reflect.get(components, name), `components ${name}`).toBe(Reflect.get(command, name));
    expect(Reflect.get(command, name)).toBeDefined();
  }
});

it('exposes toast assembly through the combined component entry', () => {
  const names = ['Toaster', 'Toast', 'ToastTitle', 'ToastDescription', 'ToastAction', 'toastReducer', 'createToastStore'] as const;
  for (const name of names) {
    expect(Reflect.get(components, name), name).toBe(Reflect.get(toast, name));
    expect(Reflect.get(toast, name)).toBeDefined();
  }
});

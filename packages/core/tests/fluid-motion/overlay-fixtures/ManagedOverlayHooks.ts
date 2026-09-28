/** Test hooks filled by ManagedOverlayPage during initialisation. */
export const managedHooks: { host?: unknown; open?: () => void; status?: () => string; child?: () => unknown; completions: { present: number; dismiss: number } } = { completions: { present: 0, dismiss: 0 } };

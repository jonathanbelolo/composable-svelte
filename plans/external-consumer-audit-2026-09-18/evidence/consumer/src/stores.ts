import { createSessionStore, createLoginStore } from '@composable-svelte/auth';
import { createHttpAuthDeps } from '@composable-svelte/auth/http';

// One dependency object drives both: the session calls and the flow calls.
const deps = createHttpAuthDeps();

export const session = createSessionStore(deps);
export const login = createLoginStore(deps);

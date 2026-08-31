/**
 * Headless auth flows.
 *
 * Each flow is a reducer, its state and action types, and the Zod schema its
 * form validates against — no markup. The styled components in
 * `@composable-svelte/auth/components` are built on these, and a consumer who
 * wants their own markup can use these directly.
 */

export {
	loginReducer,
	createInitialLoginState,
	loginFormConfig,
	loginSchema,
	emptyLoginFields
} from './login/index.js';

export type {
	LoginFields,
	LoginState,
	LoginAction,
	LoginStatus,
	LoginDependencies
} from './login/index.js';

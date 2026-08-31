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
	createLoginStore,
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

export {
	signupReducer,
	createInitialSignupState,
	createSignupStore,
	signupFormConfig,
	signupSchema,
	emptySignupFields,
	passwordCriteria,
	evaluatePasswordCriteria,
	meetsPasswordCriteria,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH
} from './signup/index.js';

export type {
	SignupFields,
	PasswordCriterion,
	SignupState,
	SignupAction,
	SignupStatus,
	SignupDependencies
} from './signup/index.js';

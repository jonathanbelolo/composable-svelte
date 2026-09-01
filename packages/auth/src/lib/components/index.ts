/**
 * Styled components.
 *
 * Two kinds. The guards (`AuthGuard`, `RoleGate`) render nothing of their own —
 * they choose between snippets. The forms and their primitives do render, in
 * scoped CSS built on core's theme tokens: `hsl(var(--background, 0 0% 100%))`
 * follows a consumer's theme and dark mode when core's stylesheet is loaded and
 * falls back to sane defaults when it is not.
 *
 * Not Tailwind, and that is not a preference. The preset's `contentGlob`
 * resolves to core's `dist` only, so a utility class in `auth/dist` is purged
 * in every consuming app — which is exactly the "renders transparent" defect
 * the root CLAUDE.md opens with.
 *
 * A consumer who wants entirely different markup should build on
 * `@composable-svelte/auth/flows` instead; these are the reference rendering of
 * those reducers, not the only one.
 */

export { default as AuthGuard } from './AuthGuard.svelte';
export { default as RoleGate } from './RoleGate.svelte';
export { default as LoginForm } from './LoginForm.svelte';
export { default as PasswordInput } from './PasswordInput.svelte';
export { default as PasswordCriteria } from './PasswordCriteria.svelte';
export { default as SignupForm } from './SignupForm.svelte';
export { default as EmailVerification } from './EmailVerification.svelte';
export { default as ForgotPasswordForm } from './ForgotPasswordForm.svelte';
export { default as ResetPasswordForm } from './ResetPasswordForm.svelte';

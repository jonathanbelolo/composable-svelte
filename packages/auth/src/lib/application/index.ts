/**
 * The managed auth feature: a persistent session with optional login, MFA,
 * signup, password-recovery and email-verification flows plus MFA enrolment
 * and management settings flows, composed on
 * `@composable-svelte/core/application`.
 *
 * Also reachable from `@composable-svelte/auth`.
 */

export {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureState,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureCatalog,
	type AuthHandoff,
	type AuthHandoffSource,
	type AuthHandoffRefusalReason,
	type AuthMfaOutcome,
	type AuthOAuthOutcome,
	type AuthMagicLinkOutcome,
	type AuthConnectedAccountsOutcome,
	type AuthChangeEmailOutcome,
	type AuthChangeEmailConfirmOutcome,
	type AuthChangePasswordOutcome,
	type AuthDeleteAccountOutcome,
	type AuthSessionRefreshOutcome
} from './feature.js';

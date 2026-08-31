export {
	emailVerificationReducer,
	createInitialEmailVerificationState,
	createEmailVerificationStore,
	tokenFromUrl
} from './reducer.js';

export type {
	EmailVerificationState,
	EmailVerificationAction,
	EmailVerificationStatus,
	EmailVerificationDependencies,
	ResendStatus
} from './types.js';

export {
	magicLinkRequestReducer,
	createInitialMagicLinkRequestState,
	createMagicLinkRequestStore,
	magicLinkRequestFormConfig
} from './reducer.js';
export { magicLinkSchema, emptyMagicLinkFields } from './schema.js';

export type { MagicLinkFields } from './schema.js';
export type {
	MagicLinkRequestState,
	MagicLinkRequestAction,
	MagicLinkRequestStatus,
	MagicLinkRequestDependencies
} from './types.js';

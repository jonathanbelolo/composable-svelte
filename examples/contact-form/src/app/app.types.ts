import type { ContactFormState, ContactFormAction } from '../features/contact-form/contact-form.types.js';

/**
 * App-level state
 *
 * Demonstrates integrating form state into a parent reducer.
 */
export interface AppState {
	/**
	 * Contact form state (managed by form reducer)
	 */
	contactForm: ContactFormState;

	/**
	 * Submission history (parent observes form submissions)
	 */
	submissionHistory: Array<{
		timestamp: Date;
		name: string;
		email: string;
	}>;

	/**
	 * Success message (shown after successful submission)
	 */
	successMessage: string | null;
}

/**
 * App-level actions
 */
export type AppAction =
	| {
			type: 'contactForm';
			action: ContactFormAction;
	  }
	| {
			type: 'successMessageDismissed';
	  };

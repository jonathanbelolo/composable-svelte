/**
 * Form System Type Definitions
 *
 * Reducer-first form state management with Zod validation integration.
 *
 * @packageDocumentation
 */

import type { ZodSchema } from 'zod';

/**
 * Complete form state for a given data shape.
 *
 * @template T - The shape of the form data (must be a record type)
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string().min(2),
 *   email: z.string().email()
 * });
 *
 * type ContactData = z.infer<typeof schema>;
 *
 * const state: FormState<ContactData> = {
 *   data: { name: '', email: '' },
 *   fields: {
 *     name: { touched: false, dirty: false, error: null, isValidating: false, warnings: [] },
 *     email: { touched: false, dirty: false, error: null, isValidating: false, warnings: [] }
 *   },
 *   schema,
 *   formErrors: [],
 *   isValidating: false,
 *   isSubmitting: false,
 *   submitCount: 0,
 *   submitError: null,
 *   lastSubmitted: null
 * };
 * ```
 */
export interface FormState<T extends Record<string, any>> {
	/**
	 * Current form data values.
	 */
	data: T;

	/**
	 * Per-field state tracking.
	 * Each key corresponds to a field in the form data.
	 */
	fields: {
		[K in keyof T]: FieldState;
	};

	/**
	 * Zod schema for validation.
	 * Stored in state to allow dynamic schema changes (conditional validation).
	 */
	schema: ZodSchema<T>;

	/**
	 * Form-level validation errors (cross-field validation, refinements).
	 */
	formErrors: string[];

	/**
	 * Which field currently has focus, or null.
	 *
	 * Form-level rather than per-field because only one field can hold focus.
	 * Deliberately separate from `touched`: `touched` gates error display, so
	 * marking a field touched on focus would fire its "required" error as the
	 * user tabs in. `fieldBlurred` is what touches.
	 */
	focusedField: keyof T | null;

	/**
	 * Is entire form currently validating?
	 */
	isValidating: boolean;

	/**
	 * Is form currently submitting?
	 */
	isSubmitting: boolean;

	/**
	 * Number of submission attempts (increments even on validation failure).
	 */
	submitCount: number;

	/**
	 * Last submission error (if any).
	 */
	submitError: string | null;

	/**
	 * Last successful submit timestamp.
	 */
	lastSubmitted: Date | null;
}

/**
 * State for an individual form field.
 *
 * @example
 * ```typescript
 * const fieldState: FieldState = {
 *   value: 'John',       // Current field value
 *   touched: true,       // User has interacted with field
 *   dirty: true,         // Value differs from initial
 *   error: 'Too short',  // Validation error message
 *   isValidating: false, // Not currently validating
 *   warnings: []         // No warnings
 * };
 * ```
 */
export interface FieldState {
	/**
	 * Current field value.
	 */
	value: any;

	/**
	 * Has user interacted with this field (focused/blurred)?
	 */
	touched: boolean;

	/**
	 * Has value changed from initial value?
	 */
	dirty: boolean;

	/**
	 * Field-level validation error message (null if valid).
	 */
	error: string | null;

	/**
	 * Is this field currently validating (Zod + async)?
	 */
	isValidating: boolean;

	/**
	 * Non-blocking validation warnings.
	 */
	warnings: string[];

	/**
	 * Does this field currently have focus?
	 */
	focused: boolean;
}

/**
 * Form configuration.
 *
 * @template T - The shape of the form data
 *
 * @example
 * ```typescript
 * const config: FormConfig<ContactData> = {
 *   schema: contactSchema,
 *   initialData: { name: '', email: '', message: '' },
 *   mode: 'all',
 *   debounceMs: 500,
 *   asyncValidators: {
 *     email: async (email) => {
 *       const available = await checkEmailAvailability(email);
 *       if (!available) throw new Error('Email already registered');
 *     }
 *   },
 *   onSubmit: async (data) => {
 *     await fetch('/api/contact', {
 *       method: 'POST',
 *       body: JSON.stringify(data)
 *     });
 *   },
 *   onSubmitSuccess: (data) => {
 *     console.log('Form submitted!', data);
 *   },
 *   onSubmitError: (error) => {
 *     console.error('Submission failed:', error);
 *   }
 * };
 * ```
 */
export interface FormConfig<T extends Record<string, any>> {
	/**
	 * Zod schema for validation.
	 */
	schema: ZodSchema<T>;

	/**
	 * Initial form data values.
	 */
	initialData: T;

	/**
	 * Validation mode - when to validate fields.
	 * - `onBlur`: Validate when field loses focus
	 * - `onChange`: Validate as user types (debounced)
	 * - `onSubmit`: Only validate on form submission
	 * - `all`: Validate on both blur and change
	 *
	 * @default 'all'
	 */
	mode?: ValidationMode;

	/**
	 * Debounce delay for onChange validation (milliseconds).
	 * Only applies when mode is 'onChange' or 'all'.
	 *
	 * @default 300
	 */
	debounceMs?: number;

	/**
	 * Custom async validators per field.
	 * Run AFTER Zod validation passes.
	 *
	 * @example
	 * ```typescript
	 * asyncValidators: {
	 *   username: async (username) => {
	 *     const available = await api.checkUsername(username);
	 *     if (!available) throw new Error('Username taken');
	 *   }
	 * }
	 * ```
	 */
	asyncValidators?: Partial<{
		[K in keyof T]: (value: T[K]) => Promise<void>;
	}>;

	/**
	 * Submission handler - called after successful validation.
	 *
	 * @param data - Validated form data
	 * @throws Error if submission fails
	 */
	onSubmit: (data: T) => Promise<void>;

	/**
	 * Success callback - called after successful submission.
	 *
	 * @param data - Submitted form data
	 */
	onSubmitSuccess?: (data: T) => void;

	/**
	 * Error callback - called if submission fails.
	 *
	 * @param error - Submission error
	 */
	onSubmitError?: (error: Error) => void;
}

/**
 * Validation mode options.
 */
export type ValidationMode = 'onBlur' | 'onChange' | 'onSubmit' | 'all';

/**
 * All possible form actions.
 *
 * @template T - The shape of the form data
 */
export type FormAction<T extends Record<string, any>> =
	// ================================================================
	// Field Interactions
	// ================================================================
	| {
			type: 'fieldChanged';
			field: keyof T;
			value: unknown;
	  }
	| {
			type: 'fieldBlurred';
			field: keyof T;
	  }
	| {
			type: 'fieldFocused';
			field: keyof T;
	  }

	// ================================================================
	// Field Validation
	// ================================================================
	| {
			type: 'fieldValidationStarted';
			field: keyof T;
	  }
	| {
			type: 'fieldValidationCompleted';
			field: keyof T;
			error: string | null;
			warnings?: string[];
	  }

	// ================================================================
	// Form Validation
	// ================================================================
	| {
			type: 'formValidationStarted';
	  }
	| {
			type: 'formValidationCompleted';
			fieldErrors: Partial<Record<keyof T, string>>;
			formErrors: string[];
	  }

	// ================================================================
	// Submission
	// ================================================================
	| {
			type: 'submitTriggered';
	  }
	| {
			type: 'submissionStarted';
	  }
	| {
			type: 'submissionSucceeded';
			response?: unknown;
	  }
	| {
			type: 'submissionFailed';
			error: string;
	  }

	// ================================================================
	// Form Management
	// ================================================================
	| {
			type: 'formReset';
			data?: T;
	  }
	| {
			type: 'setFieldValue';
			field: keyof T;
			value: unknown;
	  }
	| {
			type: 'setFieldError';
			field: keyof T;
			error: string;
	  }
	| {
			type: 'clearFieldError';
			field: keyof T;
	  };

/**
 * The value a `FormField` hands to its children snippet.
 */
export interface FieldRenderProps<T extends Record<string, any>> {
	field: FieldState;
	send: (action: FormAction<T>) => void;
}

/**
 * The part of a store the form components actually consume.
 *
 * Narrower than `Store` on purpose. In integrated mode the caller passes a store
 * scoped to a slice of a parent's state, and every scoping helper in this
 * library returns `{state, dispatch, …}` — never a full `Store`. Demanding
 * `select`, `history` and `destroy` meant the documented integrated-mode pattern
 * could not typecheck, which is why three of the examples hand-roll this exact
 * shape and cast around it.
 *
 * `subscribe` is genuinely needed, not padding: `FormField.svelte` reads
 * `$store.data[name]`, the auto-subscription form.
 */
export interface FormStore<T extends Record<string, any>> {
	readonly state: FormState<T>;
	dispatch(action: FormAction<T>): void;
	subscribe(listener: (state: FormState<T>) => void): () => void;
}

/**
 * Props for the `Form` component.
 *
 * Declared here rather than inside the component: a generic `<script generics=...>`
 * component cannot reference a locally-declared interface from its emitted
 * declaration file.
 */
export interface FormProps<T extends Record<string, any>> {
	/**
	 * Form configuration (standalone mode).
	 * Mutually exclusive with `store`.
	 */
	config?: FormConfig<T> | undefined;
	/**
	 * External store from parent reducer (integrated mode).
	 * Mutually exclusive with `config`.
	 */
	store?: FormStore<T> | undefined;
	/**
	 * Optional class name for the form element.
	 */
	class?: string | undefined;
	/**
	 * Optional children (form fields and controls).
	 */
	children?: import('svelte').Snippet | undefined;
}

/**
 * Props for the `FormField` component.
 */
export interface FormFieldProps<T extends Record<string, any>> {
	/**
	 * The name of the field in the form data.
	 */
	name: keyof T & string;
	/**
	 * Optional class name for the field wrapper.
	 */
	class?: string | undefined;
	/**
	 * Children components (label, control, message, etc.).
	 */
	children?: import('svelte').Snippet<[FieldRenderProps<T>]> | undefined;
}

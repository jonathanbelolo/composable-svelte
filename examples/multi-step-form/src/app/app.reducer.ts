/** Business flow for the demo. Form validation and effect lifetimes stay in the framework. */
import { Effect, type Reducer } from '@composable-svelte/core';
import { scope } from '@composable-svelte/core/composition';
import { createFormReducer, type FormAction, type FormState } from '@composable-svelte/core/components/form';
import { personalInfoFormConfig } from '../features/onboarding/personal-info.config.js';
import { addressFormConfig } from '../features/onboarding/address.config.js';
import type { AddressData, PersonalInfoData } from '../features/onboarding/onboarding.types.js';
import type { AppState, AppAction } from './app.types.js';
const personalReducer = createFormReducer(personalInfoFormConfig);
const addressReducer = createFormReducer(addressFormConfig);
const personal = scope<AppState, AppAction, FormState<PersonalInfoData>, FormAction<PersonalInfoData>, {}>(s => s.personalInfoForm, (s, child) => ({ ...s, personalInfoForm: child }), a => a.type === 'personalInfoForm' ? a.action : null, action => ({ type: 'personalInfoForm', action }), personalReducer);
const address = scope<AppState, AppAction, FormState<AddressData>, FormAction<AddressData>, {}>(s => s.addressForm, (s, child) => ({ ...s, addressForm: child }), a => a.type === 'addressForm' ? a.action : null, action => ({ type: 'addressForm', action }), addressReducer);
const submissionGroup = 'onboarding-submission';
export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
    if (action.type === 'personalInfoForm') {
        const [next, effect] = personal(state, action, deps);
        const form = next.personalInfoForm;
        // Observe the accepted child transition, never an unaccepted/stale completion action.
        if (form.submitCount > state.personalInfoForm.submitCount && form.submitOutcome === 'succeeded') {
            return [{ ...next, completedData: { ...next.completedData, personalInfo: form.data },
                    currentStep: state.currentStep === 'personalInfo' ? 'address' : state.currentStep }, effect];
        }
        if (form.data !== state.personalInfoForm.data) {
            return [{ ...next, completedData: { ...next.completedData, personalInfo: null } }, effect];
        }
        return [next, effect];
    }
    if (action.type === 'addressForm') {
        const [next, effect] = address(state, action, deps);
        const form = next.addressForm;
        if (form.submitCount > state.addressForm.submitCount && form.submitOutcome === 'succeeded') {
            return [{ ...next, completedData: { ...next.completedData, address: form.data },
                    currentStep: state.currentStep === 'address' ? 'review' : state.currentStep }, effect];
        }
        if (form.data !== state.addressForm.data) {
            return [{ ...next, completedData: { ...next.completedData, address: null } }, effect];
        }
        return [next, effect];
    }
    switch (action.type) {
        case 'nextStep':
            if (state.isSubmitting)
                return [state, Effect.none()];
            if (state.currentStep === 'review')
                return [state, Effect.none()];
            return [state, Effect.run(dispatch => dispatch(state.currentStep === 'personalInfo'
                    ? { type: 'personalInfoForm', action: { type: 'submitTriggered' } }
                    : { type: 'addressForm', action: { type: 'submitTriggered' } }))];
        case 'previousStep':
            if (state.isSubmitting)
                return [state, Effect.none()];
            return [{ ...state, currentStep: state.currentStep === 'review' ? 'address' : 'personalInfo' }, Effect.none()];
        case 'goToStep':
            if (state.isSubmitting || (action.step !== 'personalInfo' && !state.completedData.personalInfo) ||
                (action.step === 'review' && !state.completedData.address))
                return [state, Effect.none()];
            return [{ ...state, currentStep: action.step }, Effect.none()];
        case 'submitOnboarding': {
            if (state.isSubmitting || state.submissionComplete)
                return [state, Effect.none()];
            const { personalInfo, address } = state.completedData;
            if (!personalInfo || !address || personalInfo !== state.personalInfoForm.data || address !== state.addressForm.data) {
                return [{ ...state, submitError: 'Please complete all steps before submitting' }, Effect.none()];
            }
            const data = { personalInfo, address };
            // This demo simulates latency using the framework-owned cancellable delay.
            return [{ ...state, isSubmitting: true, submitError: null },
                Effect.inGroup(Effect.afterDelay(1500, dispatch => dispatch({ type: 'submissionSucceeded', data })), submissionGroup)];
        }
        case 'submissionStarted':
            // Kept as a compatibility notification; submission begins atomically above.
            return [state, Effect.none()];
        case 'submissionSucceeded':
            if (!state.isSubmitting)
                return [state, Effect.none()];
            return [{ ...state, isSubmitting: false, submissionComplete: true, submittedData: action.data }, Effect.none()];
        case 'submissionFailed':
            if (!state.isSubmitting)
                return [state, Effect.none()];
            return [{ ...state, isSubmitting: false, submitError: action.error }, Effect.none()];
        case 'resetOnboarding': {
            // Delegate reset semantics and cancellation to each public form reducer.
            const [personalInfoForm, personalEffect] = personalReducer(state.personalInfoForm, { type: 'formReset' }, deps);
            const [addressForm, addressEffect] = addressReducer(state.addressForm, { type: 'formReset' }, deps);
            return [{ ...state, personalInfoForm, addressForm, currentStep: 'personalInfo', completedData: { personalInfo: null, address: null },
                    isSubmitting: false, submitError: null, submissionComplete: false, submittedData: null }, Effect.batch(Effect.cancelGroup(submissionGroup), Effect.map(personalEffect, (action): AppAction => ({ type: 'personalInfoForm', action })), Effect.map(addressEffect, (action): AppAction => ({ type: 'addressForm', action })))];
        }
    }
};

/**
 * Type definitions and Zod schemas for multi-step onboarding form
 *
 * This form has 3 steps:
 * 1. Personal Info (name, email, phone)
 * 2. Address (street, city, state, zip)
 * 3. Review (read-only summary before submission)
 */

import { z } from 'zod';

// Step 1: Personal Info
export const personalInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\d{3}-\d{3}-\d{4}$/, 'Phone must be in format: 123-456-7890')
});

export type PersonalInfoData = z.infer<typeof personalInfoSchema>;

// Step 2: Address
export const addressSchema = z.object({
  street: z.string().min(5, 'Street address must be at least 5 characters'),
  city: z.string().min(2, 'City must be at least 2 characters'),
  state: z.string().length(2, 'State must be 2 letters (e.g., CA, NY)').regex(/^[A-Z]{2}$/, 'State must be uppercase letters'),
  zipCode: z.string().regex(/^\d{5}$/, 'Zip code must be 5 digits')
});

export type AddressData = z.infer<typeof addressSchema>;

// Combined data (all steps)
export const completeOnboardingSchema = z.object({
  personalInfo: personalInfoSchema,
  address: addressSchema
});

export type CompleteOnboardingData = z.infer<typeof completeOnboardingSchema>;

// Step type
export type OnboardingStep = 'personalInfo' | 'address' | 'review';

// Step metadata
export interface StepMetadata {
  step: OnboardingStep;
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
}

export const STEPS: Record<OnboardingStep, StepMetadata> = {
  personalInfo: {
    step: 'personalInfo',
    title: 'Personal Information',
    description: 'Tell us about yourself',
    stepNumber: 1,
    totalSteps: 3
  },
  address: {
    step: 'address',
    title: 'Address',
    description: 'Where do you live?',
    stepNumber: 2,
    totalSteps: 3
  },
  review: {
    step: 'review',
    title: 'Review',
    description: 'Review your information before submitting',
    stepNumber: 3,
    totalSteps: 3
  }
};

<script lang="ts">
  import type { OnboardingStep, StepMetadata } from '../features/onboarding/onboarding.types.js';
  import { STEPS } from '../features/onboarding/onboarding.types.js';

  interface Props {
    currentStep: OnboardingStep;
    completedSteps: Set<OnboardingStep>;
    onStepClick?: (step: OnboardingStep) => void;
  }

  let { currentStep, completedSteps, onStepClick }: Props = $props();

  const steps: StepMetadata[] = [
    STEPS.personalInfo,
    STEPS.address,
    STEPS.review
  ];

  function isStepCompleted(step: OnboardingStep): boolean {
    return completedSteps.has(step);
  }

  function isStepCurrent(step: OnboardingStep): boolean {
    return currentStep === step;
  }

  function isStepClickable(step: OnboardingStep): boolean {
    // Can click on completed steps or current step
    return isStepCompleted(step) || isStepCurrent(step);
  }

  function handleStepClick(step: OnboardingStep) {
    if (isStepClickable(step) && onStepClick) {
      onStepClick(step);
    }
  }
</script>

<div class="w-full py-8" data-testid="step-indicator">
  <div class="flex items-center justify-between">
    {#each steps as step, index}
      <div class="flex items-center flex-1">
        <!-- Step Circle -->
        <button
          type="button"
          class="flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all {isStepCurrent(step.step)
            ? 'border-blue-600 bg-blue-600 text-white'
            : isStepCompleted(step.step)
              ? 'border-green-600 bg-green-600 text-white'
              : 'border-gray-300 bg-white text-gray-400'} {isStepClickable(step.step)
            ? 'cursor-pointer hover:scale-110'
            : 'cursor-not-allowed'}"
          onclick={() => handleStepClick(step.step)}
          disabled={!isStepClickable(step.step)}
          data-testid="step-{step.step}"
        >
          {#if isStepCompleted(step.step)}
            <!-- Checkmark -->
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {:else}
            <!-- Step Number -->
            <span class="text-sm font-semibold">{step.stepNumber}</span>
          {/if}
        </button>

        <!-- Step Label (below circle on mobile, inline on desktop) -->
        <div class="hidden md:flex md:flex-col md:ml-2">
          <span class="text-sm font-medium {isStepCurrent(step.step) ? 'text-blue-600' : 'text-gray-700'}">
            {step.title}
          </span>
          <span class="text-xs text-gray-500">{step.description}</span>
        </div>

        <!-- Connector Line -->
        {#if index < steps.length - 1}
          <div class="flex-1 h-0.5 mx-2 {isStepCompleted(step.step) ? 'bg-green-600' : 'bg-gray-300'}"></div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Mobile: Step labels below -->
  <div class="flex md:hidden justify-between mt-2">
    {#each steps as step}
      <div class="flex-1 text-center">
        <span class="text-xs font-medium {isStepCurrent(step.step) ? 'text-blue-600' : 'text-gray-700'}">
          {step.title}
        </span>
      </div>
    {/each}
  </div>
</div>

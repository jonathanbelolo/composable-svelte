<script lang="ts">
  import { Input } from '@composable-svelte/core/components/ui/input/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';
  import { Textarea } from '@composable-svelte/core/components/ui/textarea/index.js';
  import { Checkbox } from '@composable-svelte/core/components/ui/checkbox/index.js';
  import { RadioGroup, Radio } from '@composable-svelte/core/components/ui/radio/index.js';
  import { Switch } from '@composable-svelte/core/components/ui/switch/index.js';
  import { Select } from '@composable-svelte/core/components/ui/select/index.js';
  import { Slider } from '@composable-svelte/core/components/ui/slider/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  // Form state
  let name = $state('');
  let email = $state('');
  let bio = $state('');
  let acceptTerms = $state(false);
  let plan = $state('free');
  let notifications = $state(true);
  let country = $state(null);
  let experienceLevel = $state(5);

  const countryOptions = [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
    { value: 'au', label: 'Australia' }
  ];

  function handleSubmit() {
    console.log('Form submitted:', {
      name,
      email,
      bio,
      acceptTerms,
      plan,
      notifications,
      country,
      experienceLevel
    });
    alert('Form submitted! Check console for values.');
  }
</script>

<div class="space-y-12">
  <!-- Interactive Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Complete Form Example</h3>
      <p class="text-muted-foreground text-sm">
        All form components working together
      </p>
    </div>

    <div class="flex flex-col items-center justify-center p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-2xl space-y-8">
        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-6">
          <!-- Text Input -->
          <div class="space-y-2">
            <Label for="name">Full Name</Label>
            <Input
              id="name"
              bind:value={name}
              placeholder="John Doe"
              required
            />
          </div>

          <!-- Email Input -->
          <div class="space-y-2">
            <Label for="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              bind:value={email}
              placeholder="john@example.com"
              required
            />
          </div>

          <!-- Textarea -->
          <div class="space-y-2">
            <Label for="bio">Bio</Label>
            <Textarea
              id="bio"
              bind:value={bio}
              placeholder="Tell us about yourself..."
              rows={4}
            />
          </div>

          <!-- Select -->
          <div class="space-y-2">
            <Label for="country">Country</Label>
            <Select
              id="country"
              options={countryOptions}
              bind:value={country}
              placeholder="Select your country..."
            />
          </div>

          <!-- Radio Group -->
          <div class="space-y-2">
            <Label>Subscription Plan</Label>
            <RadioGroup bind:value={plan}>
              <Radio value="free">Free - $0/month</Radio>
              <Radio value="pro">Pro - $9/month</Radio>
              <Radio value="enterprise">Enterprise - $29/month</Radio>
            </RadioGroup>
          </div>

          <!-- Slider -->
          <div class="space-y-2">
            <div class="flex justify-between">
              <Label for="experience">Experience Level</Label>
              <span class="text-sm text-muted-foreground">{experienceLevel}/10</span>
            </div>
            <Slider
              id="experience"
              bind:value={experienceLevel}
              min={1}
              max={10}
            />
          </div>

          <!-- Switch -->
          <div class="flex items-center justify-between p-4 rounded-lg border">
            <div class="space-y-0.5">
              <Label for="notifications">Email Notifications</Label>
              <p class="text-sm text-muted-foreground">Receive updates about your account</p>
            </div>
            <Switch id="notifications" bind:checked={notifications} />
          </div>

          <!-- Checkbox -->
          <div class="flex items-center space-x-2">
            <Checkbox id="terms" bind:checked={acceptTerms} />
            <Label for="terms">I agree to the terms and conditions</Label>
          </div>

          <!-- Submit Button -->
          <Button type="submit" disabled={!acceptTerms} class="w-full">
            Submit Form
          </Button>
        </form>
      </div>
    </div>
  </section>

  <!-- Form Summary -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Current Form Values</h3>
      <p class="text-muted-foreground text-sm">
        Live preview of form state
      </p>
    </div>

    <div class="rounded-lg border bg-card p-6">
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <dt class="font-medium text-muted-foreground">Name</dt>
          <dd class="mt-1">{name || '(empty)'}</dd>
        </div>
        <div>
          <dt class="font-medium text-muted-foreground">Email</dt>
          <dd class="mt-1">{email || '(empty)'}</dd>
        </div>
        <div class="md:col-span-2">
          <dt class="font-medium text-muted-foreground">Bio</dt>
          <dd class="mt-1">{bio || '(empty)'}</dd>
        </div>
        <div>
          <dt class="font-medium text-muted-foreground">Country</dt>
          <dd class="mt-1">{country || '(not selected)'}</dd>
        </div>
        <div>
          <dt class="font-medium text-muted-foreground">Plan</dt>
          <dd class="mt-1">{plan}</dd>
        </div>
        <div>
          <dt class="font-medium text-muted-foreground">Experience</dt>
          <dd class="mt-1">{experienceLevel}/10</dd>
        </div>
        <div>
          <dt class="font-medium text-muted-foreground">Notifications</dt>
          <dd class="mt-1">{notifications ? 'Enabled' : 'Disabled'}</dd>
        </div>
        <div class="md:col-span-2">
          <dt class="font-medium text-muted-foreground">Terms Accepted</dt>
          <dd class="mt-1">{acceptTerms ? 'Yes ✓' : 'No'}</dd>
        </div>
      </dl>
    </div>
  </section>

  <!-- Form Components Used -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Components Used</h3>
      <p class="text-muted-foreground text-sm">
        This form demonstrates all form system components
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Input:</strong> Text and email fields</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Label:</strong> Accessible field labels</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Textarea:</strong> Multi-line bio input</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Select:</strong> Country dropdown</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Radio Group:</strong> Plan selection</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Slider:</strong> Experience level</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Switch:</strong> Notification toggle</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-primary mt-0.5">▪</span>
          <span><strong>Checkbox:</strong> Terms acceptance</span>
        </li>
      </ul>
    </div>
  </section>
</div>

<script lang="ts">
  import { Input } from '@composable-svelte/core/components/ui/input/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';

  let textValue = $state('');
  let emailValue = $state('');
  let passwordValue = $state('');
  let numberValue = $state(0);
  let searchValue = $state('');
  let disabledValue = $state('Disabled input');
  let errorValue = $state('invalid@');
  let hasError = $state(true);
</script>

<div class="space-y-12">
  <!-- Interactive Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Type in the input field to see live updates
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-2">
        <Label for="demo-input">Your name</Label>
        <Input
          id="demo-input"
          type="text"
          bind:value={textValue}
          placeholder="Enter your name..."
        />
      </div>
      <p class="text-sm text-muted-foreground">
        {textValue ? `Hello, ${textValue}!` : 'Start typing to see a greeting'}
      </p>
    </div>
  </section>

  <!-- Input Types -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Input Types</h3>
      <p class="text-muted-foreground text-sm">
        Different input types for various data formats
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Text -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Text</h4>
        <div class="space-y-2">
          <Label for="text-input">Username</Label>
          <Input
            id="text-input"
            type="text"
            placeholder="john_doe"
          />
        </div>
      </div>

      <!-- Email -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Email</h4>
        <div class="space-y-2">
          <Label for="email-input">Email address</Label>
          <Input
            id="email-input"
            type="email"
            bind:value={emailValue}
            placeholder="you@example.com"
          />
        </div>
      </div>

      <!-- Password -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Password</h4>
        <div class="space-y-2">
          <Label for="password-input">Password</Label>
          <Input
            id="password-input"
            type="password"
            bind:value={passwordValue}
            placeholder="••••••••"
          />
        </div>
      </div>

      <!-- Number -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Number</h4>
        <div class="space-y-2">
          <Label for="number-input">Age</Label>
          <Input
            id="number-input"
            type="number"
            bind:value={numberValue}
            placeholder="25"
          />
        </div>
      </div>

      <!-- Search -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Search</h4>
        <div class="space-y-2">
          <Label for="search-input">Search</Label>
          <Input
            id="search-input"
            type="search"
            bind:value={searchValue}
            placeholder="Search..."
          />
        </div>
      </div>

      <!-- URL -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">URL</h4>
        <div class="space-y-2">
          <Label for="url-input">Website</Label>
          <Input
            id="url-input"
            type="url"
            placeholder="https://example.com"
          />
        </div>
      </div>
    </div>
  </section>

  <!-- States -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">States</h3>
      <p class="text-muted-foreground text-sm">
        Different states like disabled, error, etc.
      </p>
    </div>

    <div class="space-y-6">
      <!-- Default -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Default</div>
        <div class="space-y-2">
          <Label for="default-input">Full name</Label>
          <Input
            id="default-input"
            type="text"
            placeholder="John Doe"
          />
        </div>
      </div>

      <!-- Disabled -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Disabled</div>
        <div class="space-y-2">
          <Label for="disabled-input">Disabled field</Label>
          <Input
            id="disabled-input"
            type="text"
            bind:value={disabledValue}
            disabled
          />
          <p class="text-xs text-muted-foreground">This field cannot be edited</p>
        </div>
      </div>

      <!-- Error -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Error state</div>
        <div class="space-y-2">
          <Label for="error-input">Email (with error)</Label>
          <Input
            id="error-input"
            type="email"
            bind:value={errorValue}
            error={hasError}
            errorId="error-message"
          />
          <p id="error-message" class="text-sm text-destructive">
            Please enter a valid email address
          </p>
        </div>
      </div>

      <!-- With placeholder -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <div class="mb-3 text-sm font-medium text-muted-foreground">With placeholder</div>
        <div class="space-y-2">
          <Label for="placeholder-input">Company name</Label>
          <Input
            id="placeholder-input"
            type="text"
            placeholder="Acme Inc."
          />
        </div>
      </div>
    </div>
  </section>

  <!-- Accessibility Features -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Accessibility Features</h3>
      <p class="text-muted-foreground text-sm">
        Built with accessibility in mind
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8 space-y-4">
      <ul class="space-y-2 text-sm">
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Label Association:</strong> Uses <code class="px-1.5 py-0.5 rounded bg-muted text-xs">id</code> to connect with labels</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Error Messages:</strong> Uses <code class="px-1.5 py-0.5 rounded bg-muted text-xs">aria-invalid</code> and <code class="px-1.5 py-0.5 rounded bg-muted text-xs">aria-describedby</code> for errors</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Keyboard Navigation:</strong> Full keyboard support (Tab, Shift+Tab)</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Focus Indicators:</strong> Clear visual focus ring for keyboard users</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Placeholder Text:</strong> Supports placeholder for hints (not a replacement for labels)</span>
        </li>
      </ul>

      <div class="pt-4 border-t space-y-2">
        <Label for="accessible-input">Accessible input example</Label>
        <Input
          id="accessible-input"
          type="text"
          placeholder="Type here..."
          aria-label="Example accessible input"
        />
      </div>
    </div>
  </section>
</div>

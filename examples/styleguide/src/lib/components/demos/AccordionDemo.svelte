<script lang="ts">
  import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@composable-svelte/core/components/ui/accordion/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
</script>

<div class="space-y-12">
  <!-- Basic Accordion Demo --><section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Accordion</h3>
      <p class="text-muted-foreground text-sm">
        Simple accordion with collapsible sections
      </p>
    </div>

    <Accordion class="max-w-2xl">
      <AccordionItem id="item-1">
        <AccordionTrigger>What is Composable Svelte?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Composable Svelte is a state management library inspired by The Composable Architecture (TCA) from Swift.
            It provides predictable state management with reducer patterns, effects, and comprehensive testing utilities.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="item-2">
        <AccordionTrigger>How does the reducer pattern work?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Reducers are pure functions that take the current state and an action, then return a new state and optional effects.
            This makes state changes predictable and testable. All business logic lives in reducers, keeping components simple.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="item-3">
        <AccordionTrigger>What are effects in Composable Svelte?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Effects represent side effects like API calls, timers, or animations. They're declarative data structures
            that the store executes after state updates. This separation makes testing easier and state changes more predictable.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="item-4">
        <AccordionTrigger>Can I use this with SvelteKit?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Yes! Composable Svelte works seamlessly with SvelteKit. You can use stores in your routes and components,
            and integrate with SvelteKit's navigation and data loading patterns.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>

  <!-- Single Item Mode -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Single Item Accordion</h3>
      <p class="text-muted-foreground text-sm">
        Only one item can be expanded at a time
      </p>
    </div>

    <Accordion allowMultiple={false} initialExpandedIds={['feature-1']} class="max-w-2xl">
      <AccordionItem id="feature-1">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span>Type Safety</span>
            <Badge variant="success">Core</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Full TypeScript support with type inference for state, actions, and effects.
            Catch errors at compile time and enjoy autocomplete throughout your codebase.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="feature-2">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span>Testability</span>
            <Badge variant="primary">Core</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            TestStore provides exhaustive testing with send/receive pattern. Test all state changes and effects
            in isolation without mocking dependencies.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="feature-3">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span>Composability</span>
            <Badge variant="secondary">Core</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Reducers compose like Lego blocks using scope() and ifLet() operators.
            Build complex features from simple, reusable pieces.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>

  <!-- Disabled Items -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled Items</h3>
      <p class="text-muted-foreground text-sm">
        Individual items can be disabled
      </p>
    </div>

    <Accordion class="max-w-2xl">
      <AccordionItem id="enabled-1">
        <AccordionTrigger>Active Section</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            This section is fully interactive and can be toggled.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="disabled-1" disabled={true}>
        <AccordionTrigger>Disabled Section (Coming Soon)</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            This content is currently unavailable.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="enabled-2">
        <AccordionTrigger>Another Active Section</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            This section can also be toggled normally.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>

  <!-- FAQ Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">FAQ Example</h3>
      <p class="text-muted-foreground text-sm">
        Common use case for accordion components
      </p>
    </div>

    <Accordion initialExpandedIds={['faq-1']} class="max-w-2xl">
      <AccordionItem id="faq-1">
        <AccordionTrigger>How do I install Composable Svelte?</AccordionTrigger>
        <AccordionContent>
          <div class="space-y-2">
            <p class="text-muted-foreground">Install via npm or pnpm:</p>
            <pre class="bg-muted p-3 rounded text-xs overflow-x-auto"><code>npm install @composable-svelte/core
pnpm add @composable-svelte/core</code></pre>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="faq-2">
        <AccordionTrigger>Do I need to learn new concepts?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            If you're familiar with Redux or similar state management libraries, the concepts will be familiar.
            The main patterns are reducers (pure functions), actions (events), and effects (side effects).
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="faq-3">
        <AccordionTrigger>Is it production ready?</AccordionTrigger>
        <AccordionContent>
          <p class="text-muted-foreground">
            Yes! The library has comprehensive tests, type safety, and follows Svelte 5 best practices.
            It's built for real-world applications with navigation, animations, and complex state management.
          </p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="faq-4">
        <AccordionTrigger>How does it compare to other libraries?</AccordionTrigger>
        <AccordionContent>
          <div class="text-muted-foreground space-y-2">
            <p>Compared to other state management solutions:</p>
            <ul class="list-disc list-inside space-y-1 ml-2">
              <li>More structured than Svelte stores alone</li>
              <li>Type-safe like Redux Toolkit</li>
              <li>Testable like TCA (The Composable Architecture)</li>
              <li>Built specifically for Svelte 5 with runes</li>
            </ul>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="faq-5">
        <AccordionTrigger>Where can I get help?</AccordionTrigger>
        <AccordionContent>
          <div class="text-muted-foreground space-y-2">
            <p>Several resources are available:</p>
            <ul class="list-disc list-inside space-y-1 ml-2">
              <li>Documentation and API reference</li>
              <li>GitHub issues for bug reports</li>
              <li>Example applications in the repository</li>
              <li>Community discussions</li>
            </ul>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>

  <!-- Settings Panel Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Settings Panel Example</h3>
      <p class="text-muted-foreground text-sm">
        Organize configuration options
      </p>
    </div>

    <Accordion class="max-w-2xl border rounded-lg p-4">
      <AccordionItem id="settings-general">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span class="text-lg">⚙️</span>
            <span>General Settings</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Theme</span>
              <span class="font-medium">Dark</span>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Language</span>
              <span class="font-medium">English</span>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Timezone</span>
              <span class="font-medium">UTC-8</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="settings-notifications">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span class="text-lg">🔔</span>
            <span>Notifications</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Email Notifications</span>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Push Notifications</span>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">SMS Alerts</span>
              <Badge variant="default">Disabled</Badge>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem id="settings-privacy">
        <AccordionTrigger>
          <div class="flex items-center gap-2">
            <span class="text-lg">🔒</span>
            <span>Privacy & Security</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Two-Factor Auth</span>
              <Badge variant="success">Active</Badge>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Login History</span>
              <span class="font-medium text-primary cursor-pointer">View</span>
            </div>
            <div class="flex items-center justify-between p-2 hover:bg-accent rounded">
              <span class="text-muted-foreground">Data Export</span>
              <span class="font-medium text-primary cursor-pointer">Request</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>
</div>

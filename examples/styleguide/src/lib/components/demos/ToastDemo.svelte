<script lang="ts">
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  // Note: This is a simplified demo showing toast notification patterns
  // The actual toast component integration will be added once the toast system is fully implemented
</script>

<div class="space-y-12">
  <!-- Toast Preview Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Toast Notifications</h3>
      <p class="text-muted-foreground text-sm">
        Temporary messages that appear and auto-dismiss
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Toast Variants</CardTitle>
        <CardDescription>Different toast notification styles</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <!-- Default Toast Preview -->
          <div class="rounded-lg border bg-card p-4 shadow-lg max-w-md">
            <div class="flex items-start gap-3">
              <div class="flex-1">
                <p class="text-sm font-semibold">Default Notification</p>
                <p class="text-xs text-muted-foreground mt-1">This is a default toast message</p>
              </div>
              <button class="text-muted-foreground hover:text-foreground">×</button>
            </div>
          </div>

          <!-- Success Toast Preview -->
          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-4 shadow-lg max-w-md">
            <div class="flex items-start gap-3">
              <span class="text-green-600 dark:text-green-400">✓</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-green-900 dark:text-green-100">Success!</p>
                <p class="text-xs text-green-700 dark:text-green-300 mt-1">Your changes have been saved successfully</p>
              </div>
              <button class="text-green-600 hover:text-green-800 dark:text-green-400">×</button>
            </div>
          </div>

          <!-- Error Toast Preview -->
          <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4 shadow-lg max-w-md">
            <div class="flex items-start gap-3">
              <span class="text-red-600 dark:text-red-400">!</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-red-900 dark:text-red-100">Error Occurred</p>
                <p class="text-xs text-red-700 dark:text-red-300 mt-1">Failed to save changes. Please try again.</p>
              </div>
              <button class="text-red-600 hover:text-red-800 dark:text-red-400">×</button>
            </div>
          </div>

          <!-- Warning Toast Preview -->
          <div class="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 p-4 shadow-lg max-w-md">
            <div class="flex items-start gap-3">
              <span class="text-yellow-600 dark:text-yellow-400">⚠</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-yellow-900 dark:text-yellow-100">Warning</p>
                <p class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Your session will expire in 5 minutes</p>
              </div>
              <button class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400">×</button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Practical examples of toast notifications
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Form Submission -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Form Submission</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Success Example:</p>
            <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3 text-xs">
              <p class="font-semibold text-green-900 dark:text-green-100">Form submitted</p>
              <p class="text-green-700 dark:text-green-300">Your feedback has been received</p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Error Example:</p>
            <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-xs">
              <p class="font-semibold text-red-900 dark:text-red-100">Submission failed</p>
              <p class="text-red-700 dark:text-red-300">Please check all required fields</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- File Operations -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">File Operations</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Upload Success:</p>
            <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3 text-xs">
              <p class="font-semibold text-green-900 dark:text-green-100">File uploaded</p>
              <p class="text-green-700 dark:text-green-300">document.pdf uploaded successfully</p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Delete Confirmation:</p>
            <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3 text-xs">
              <p class="font-semibold text-green-900 dark:text-green-100">File deleted</p>
              <p class="text-green-700 dark:text-green-300">document.pdf has been removed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Data Operations -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Data Operations</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Save Confirmation:</p>
            <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3 text-xs">
              <p class="font-semibold text-green-900 dark:text-green-100">Data saved</p>
              <p class="text-green-700 dark:text-green-300">All changes have been synchronized</p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Unsaved Changes Warning:</p>
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 p-3 text-xs">
              <p class="font-semibold text-yellow-900 dark:text-yellow-100">Unsaved changes</p>
              <p class="text-yellow-700 dark:text-yellow-300">Save before leaving?</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- System Messages -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">System Messages</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Update Notification:</p>
            <div class="rounded-lg border bg-card p-3 text-xs">
              <p class="font-semibold">New update available</p>
              <p class="text-muted-foreground">Version 2.0.0 is ready to install</p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-muted-foreground">Maintenance Alert:</p>
            <div class="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800 p-3 text-xs">
              <p class="font-semibold text-yellow-900 dark:text-yellow-100">Maintenance scheduled</p>
              <p class="text-yellow-700 dark:text-yellow-300">System will be down tomorrow 2-4 AM</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Action Confirmations -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Action Confirmations</h3>
      <p class="text-muted-foreground text-sm">
        Quick feedback for user actions
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Common Action Toasts</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Copied!</p>
            <p class="text-green-700 dark:text-green-300">Text copied to clipboard</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Liked!</p>
            <p class="text-green-700 dark:text-green-300">Added to your favorites</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Shared</p>
            <p class="text-green-700 dark:text-green-300">Link copied to clipboard</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Bookmarked</p>
            <p class="text-green-700 dark:text-green-300">Added to reading list</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Deleted</p>
            <p class="text-green-700 dark:text-green-300">Item moved to trash</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Restored</p>
            <p class="text-green-700 dark:text-green-300">Item restored from trash</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Archived</p>
            <p class="text-green-700 dark:text-green-300">Conversation archived</p>
          </div>

          <div class="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-3">
            <p class="font-semibold text-green-900 dark:text-green-100">Sent</p>
            <p class="text-green-700 dark:text-green-300">Message delivered</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Error Messages -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Error Handling</h3>
      <p class="text-muted-foreground text-sm">
        Inform users of errors and issues
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Error Scenarios</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4">
            <p class="text-sm font-semibold text-red-900 dark:text-red-100">Network error</p>
            <p class="text-xs text-red-700 dark:text-red-300 mt-1">Could not connect to server. Check your connection.</p>
          </div>

          <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4">
            <p class="text-sm font-semibold text-red-900 dark:text-red-100">Permission denied</p>
            <p class="text-xs text-red-700 dark:text-red-300 mt-1">You do not have access to this resource</p>
          </div>

          <div class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-4">
            <p class="text-sm font-semibold text-red-900 dark:text-red-100">Validation failed</p>
            <p class="text-xs text-red-700 dark:text-red-300 mt-1">Please enter a valid email address</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Toast Positioning -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Toast Positioning</h3>
      <p class="text-muted-foreground text-sm">
        Common placement patterns for toast notifications
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div class="space-y-2">
            <Badge variant="secondary" class="text-[10px]">Top Right (Default)</Badge>
            <p class="text-muted-foreground">Most common position, doesn't block main content</p>
          </div>

          <div class="space-y-2">
            <Badge variant="secondary" class="text-[10px]">Bottom Right</Badge>
            <p class="text-muted-foreground">Alternative position, useful for chat applications</p>
          </div>

          <div class="space-y-2">
            <Badge variant="secondary" class="text-[10px]">Top Center</Badge>
            <p class="text-muted-foreground">For important system-wide notifications</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Best Practices -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Best Practices</h3>
      <p class="text-muted-foreground text-sm">
        Guidelines for using toast notifications effectively
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <ul class="space-y-3 text-sm">
          <li class="flex items-start gap-2">
            <span class="text-green-600 mt-0.5">✓</span>
            <span><strong>Keep messages concise:</strong> Users should understand the notification at a glance</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-600 mt-0.5">✓</span>
            <span><strong>Use appropriate variants:</strong> Match the toast type to the message severity</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-600 mt-0.5">✓</span>
            <span><strong>Auto-dismiss for success:</strong> Success messages can disappear automatically (3-5 seconds)</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-600 mt-0.5">✓</span>
            <span><strong>Persist errors:</strong> Error messages should require user acknowledgment or longer timeout</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-green-600 mt-0.5">✓</span>
            <span><strong>Stack limit:</strong> Show maximum 3-5 toasts at once, queue the rest</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-red-600 mt-0.5">✗</span>
            <span><strong>Avoid overuse:</strong> Too many toasts can overwhelm users</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-red-600 mt-0.5">✗</span>
            <span><strong>Don't use for critical info:</strong> Use modals for important decisions requiring user action</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-red-600 mt-0.5">✗</span>
            <span><strong>Avoid long text:</strong> Keep titles under 40 characters, descriptions under 120</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  </section>
</div>

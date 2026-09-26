import { test, expect } from '@playwright/test';

test.describe('Support Conversation Workspace - Browser Interaction', () => {
  test('full end-to-end support workspace workflow in production build', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // 1. Navigate to the application
    await page.goto('/');

    // 2. Verify header, title, and conversation selector
    await expect(page.locator('h1')).toHaveText('Support Conversation Workspace');
    await expect(page.getByTestId('active-id')).toHaveText('conv-1');

    // 3. Verify all 3 packaged features are visible in the UI
    // - FullStreamingChat
    await expect(page.locator('.full-streaming-chat')).toBeVisible();
    // - CodeEditor
    await expect(page.locator('.cm-editor')).toBeVisible();
    // - VoiceInput
    await expect(page.locator('.voice-input')).toBeVisible();
    // - Qualification notice
    await expect(page.getByTestId('qualification-notice')).toBeVisible();
    // - Media Embed
    await expect(page.getByTestId('media-box')).toBeVisible();

    // 4. Test live editor commands via observeChildActions
    await expect(page.locator('.cm-content')).toContainText('verifyAuthToken');
    // Click "+ Snippet" command button
    await page.getByTestId('editor-insert-snippet-btn').click();
    // Live CodeMirror engine receives and executes insertText command
    await expect(page.locator('.cm-content')).toContainText('Injected live snippet');

    // Click "Undo" command button
    await page.getByTestId('editor-undo-btn').click();
    await expect(page.locator('.cm-content')).not.toContainText('Injected live snippet');

    // 5. Test streaming chat interaction & durable completed response recording
    const chatInput = page.locator('.full-streaming-chat textarea');
    await chatInput.fill('Can you check this token verification function?');
    const sendBtn = page.locator('button[aria-label="Send message"], button[type="submit"]');
    await sendBtn.click();

    // Assistant reply should stream in chat
    await expect(page.locator('.full-streaming-chat')).toContainText('Assistant answer:');

    // Durable recorded outcomes: the parent reducer records the completed response
    await expect(page.getByTestId('archived-reply-item')).toBeVisible();
    await expect(page.getByTestId('archived-count')).toHaveText('1');

    // 6. Test Send Draft to Chat command
    await page.getByTestId('editor-send-to-chat-btn').click();
    await expect(page.locator('.full-streaming-chat')).toContainText(
      'Here is the current code draft for review:'
    );

    // 7. Test conversation switching & independence (replaceOn)
    // Switch to Issue #102
    await page.getByTestId('switch-to-conv-2-btn').click();
    await expect(page.getByTestId('active-id')).toHaveText('conv-2');
    // Conv-2 has its own independent draft
    await expect(page.locator('.cm-content')).toContainText('calculateBufferSize');
    // Conv-2 has 0 archived replies initially
    await expect(page.getByTestId('archived-count')).toHaveText('0');

    // Switch back to Issue #101
    await page.getByTestId('switch-to-conv-1-btn').click();
    await expect(page.getByTestId('active-id')).toHaveText('conv-1');
    await expect(page.locator('.cm-content')).toContainText('verifyAuthToken');
    // Conv-1 retained its archived replies
    await expect(page.getByTestId('archived-count')).not.toHaveText('0');

    // 8. Test closing conversation
    await page.getByTestId('close-conversation-btn').click();
    await expect(page.getByTestId('empty-workspace')).toBeVisible();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(page.locator('.full-streaming-chat')).toHaveCount(0);

    // Reopen conversation
    await page.getByTestId('empty-open-conv-1-btn').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.getByTestId('active-id')).toHaveText('conv-1');

    // Verify no unhandled page errors occurred
    expect(pageErrors).toEqual([]);
  });
});

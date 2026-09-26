import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
async function runFixture(scenario: string) {
  try {
    const { stdout, stderr } = await execute(process.execPath, [
      join(packageRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'test-store-cleanup-fixture.config.ts'
    ], { cwd: packageRoot, env: { ...process.env, COMPOSABLE_CLEANUP_FIXTURE: scenario }, timeout: 15000 });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code, output: (failure.stdout ?? '') + (failure.stderr ?? '') };
  }
}

describe('TestStore owning-test cleanup reporting', () => {
  it('automatic teardown fails the owning test for an asynchronous cleanup rejection', async () => {
    const result = await runFixture('automatic-rejection');
    expect(result.code).toBe(1);
    expect(result.output).toContain('effect rejected, and nothing asked: owned cleanup rejection');
  });
  it('legacy automatic teardown does not require advancing fake cleanup timers', async () => {
    const result = await runFixture('fake-timer-pending');
    expect(result.code, result.output).toBe(0);
  });
  it('a pending cleanup cannot mask a known unconsumed rejection', async () => {
    const result = await runFixture('failure-and-pending');
    expect(result.code).toBe(1);
    expect(result.output).toContain('effect rejected, and nothing asked: owned cleanup rejection');
  });
  it('explicit settlement reports a dispatch-only store cleanup through the awaited promise', async () => {
    const result = await runFixture('dispatch-only');
    expect(result.code, result.output).toBe(0);
    expect(result.output).not.toContain('Uncaught Exception');
  });
});

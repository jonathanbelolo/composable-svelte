import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

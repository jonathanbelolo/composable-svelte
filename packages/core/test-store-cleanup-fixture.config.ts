import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/fixtures/test-store-cleanup.fixture.ts'],maxWorkers:1}});

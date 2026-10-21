import { defineConfig } from 'vitest/config';

// Companion browser tests use node:test and run in their own workflow.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });

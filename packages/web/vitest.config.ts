import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Multi-QTSP facade T14 added `tests/integration/**` to exercise
    // the on-disk `fixtures/trust/` tree against the spec §3.4
    // state-vs-evidence rules. Lives next to the existing unit
    // tree rather than gating on a flag — the integration test is
    // pure file IO, no slow services.
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/setup.ts'],
  },
});

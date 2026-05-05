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
    //
    // Multi-QTSP facade T15 added `tests/build/**` for the landing
    // bundle-size budget test. Discovery only — the test body is
    // gated on `RUN_BUNDLE_SIZE=1` so default `pnpm test` doesn't
    // pay the 60-90s build cost. Run explicitly via
    // `pnpm -F @zkqes/web test:bundle-size`.
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'tests/build/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['./tests/setup.ts'],
  },
});

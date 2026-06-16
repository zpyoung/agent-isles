import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/browser',
  // Per-test budget. Specs normally finish in 1–2s; the generous ceiling only
  // protects a momentarily starved CI runner from failing a test that would
  // otherwise pass. Standardized here so individual specs don't need ad-hoc
  // test.setTimeout overrides.
  timeout: 60_000,
  // Flaky CI timeouts pass on rerun; retry automatically so a single hiccup
  // doesn't redden push-to-main and force a manual `gh run rerun --failed`.
  retries: isCI ? 2 : 0,
  // Cap parallelism on CI. Each spec boots its own Chromium page plus an HTTP
  // (or live) server; oversubscribing a shared runner starves startup. Matches
  // the unit suite's --test-concurrency=2.
  workers: isCI ? 2 : undefined,
  outputDir: 'dist/playwright-test-results',
  reporter: isCI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'dist/playwright-report' }],
      ]
    : [['list']],
  use: {
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});

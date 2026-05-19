import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/browser-smoke.yml', 'utf8');

test('browser smoke workflow runs on pull requests with Playwright Chromium', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /dist\/browser-smoke-artifacts/);
});

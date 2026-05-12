import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/ci.yml';

test('GitHub Actions CI runs build, tests, and render smoke on Node 20', () => {
  assert.equal(existsSync(workflowPath), true, 'CI workflow should exist');

  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^name:\s*CI/m);
  assert.match(workflow, /^\s*push:/m);
  assert.match(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /uses:\s*actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*20/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm run build/);
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm run render -- --out dist\/demo\.html/);
});

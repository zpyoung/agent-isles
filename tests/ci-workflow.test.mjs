import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/ci.yml';
const npmReleaseWorkflowPath = '.github/workflows/npm-release.yml';

test('GitHub Actions CI runs install, tests, and render smoke on Node 20', () => {
  assert.equal(existsSync(workflowPath), true, 'CI workflow should exist');

  const workflow = readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /^name:\s*CI/m);
  assert.match(workflow, /^\s*push:/m);
  assert.match(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /uses:\s*actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*20/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm run render -- --out dist\/demo\.html/);
});

test('GitHub release workflow publishes matching package versions to npm', () => {
  assert.equal(existsSync(npmReleaseWorkflowPath), true, 'npm release workflow should exist');

  const workflow = readFileSync(npmReleaseWorkflowPath, 'utf8');

  assert.match(workflow, /^name:\s*Publish npm package/m);
  assert.match(workflow, /^"on":\n\s+release:\n\s+types:\s*\[published\]/m);
  assert.match(workflow, /^\s*id-token:\s*write/m);
  assert.match(workflow, /registry-url:\s*https:\/\/registry\.npmjs\.org/);
  assert.match(workflow, /RELEASE_TAG="\$\{GITHUB_REF_NAME#v\}"/);
  assert.match(workflow, /Release tag \$\{GITHUB_REF_NAME\} does not match package\.json version/);
  assert.match(workflow, /npm view "\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}" version/);
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm run render -- --out dist\/demo\.html --assets local/);
  assert.match(workflow, /run:\s*npm run pack:dry-run/);
  assert.match(workflow, /NODE_AUTH_TOKEN:\s*\$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.match(workflow, /npm publish --access public --tag next --provenance/);
  assert.match(workflow, /npm publish --access public --tag latest --provenance/);
});

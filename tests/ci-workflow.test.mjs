import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/ci.yml';
const npmPublishWorkflowPath = '.github/workflows/npm-publish.yml';
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

test('npm publish workflow auto-publishes merge builds with tokenless OIDC', () => {
  assert.equal(existsSync(npmPublishWorkflowPath), true, 'npm publish workflow should exist');
  assert.equal(existsSync(npmReleaseWorkflowPath), false, 'legacy release-triggered npm workflow should be removed');

  const workflow = readFileSync(npmPublishWorkflowPath, 'utf8');

  assert.match(workflow, /^name:\s*Publish npm package on merge/m);
  assert.match(workflow, /^"on":\n\s+push:\n\s+branches:\s*\[main\]/m);
  assert.match(workflow, /^\s+workflow_dispatch:\n\s+inputs:\n\s+dry_run:/m);
  assert.match(workflow, /^\s*contents:\s*write/m);
  assert.match(workflow, /^\s*id-token:\s*write/m);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /github\.event\.head_commit\.message \|\| ''/);
  assert.match(workflow, /uses:\s*actions\/setup-node@v4/);
  assert.match(workflow, /registry-url:\s*https:\/\/registry\.npmjs\.org/);
  assert.match(workflow, /run:\s*npm install -g npm@latest/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm test/);
  assert.match(workflow, /run:\s*npm run render -- --out dist\/demo\.html --assets local/);
  assert.match(workflow, /npm view "\$\{PKG_NAME\}@next"\s+version/);
  assert.match(workflow, /npm view "\$\{PKG_NAME\}@latest" version/);
  assert.match(workflow, /npx --yes semver -i prerelease --preid alpha/);
  assert.match(workflow, /run:\s*npm run pack:dry-run/);
  assert.doesNotMatch(workflow, /^\s*NODE_AUTH_TOKEN:|secrets\.NPM_TOKEN|^\s*NPM_TOKEN:/m);
  assert.match(workflow, /github\.event\.inputs\.dry_run == 'true'/);
  assert.match(workflow, /npm publish --access public --tag "\$\{\{ steps\.version\.outputs\.dist_tag \}\}" --provenance \$DRY_RUN/);
  assert.match(workflow, /git commit -m "chore\(release\): v\$\{VERSION\} \[skip ci\]"/);
  assert.match(workflow, /gh release create "v\$\{VERSION\}" --generate-notes/);
});

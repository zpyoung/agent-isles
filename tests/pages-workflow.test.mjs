import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/pages.yml';
const demoUrl = 'https://zpyoung.github.io/agent-isles/demo.html';
const escapedDemoUrl = demoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readRequiredFile(path) {
  assert.equal(existsSync(path), true, `expected ${path} to exist`);
  return readFileSync(path, 'utf8');
}

test('GitHub Pages workflow publishes the rendered demo from dist', () => {
  const workflow = readRequiredFile(workflowPath);

  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:\s*1/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run render -- --out dist\/demo\.html/);
  assert.match(workflow, /upload-pages-artifact@v3/);
  assert.match(workflow, /path:\s*dist/);
  assert.match(workflow, /deploy-pages@v4/);
});

test('README links to the source Markdown and published rendered demo', () => {
  const readme = readRequiredFile('README.md');

  assert.match(readme, new RegExp(escapedDemoUrl));
  assert.match(readme, /\[`?examples\/demo\.md`?\]\(examples\/demo\.md\)/);
});

test('wiki links to the source Markdown and published rendered demo', () => {
  const wikiHome = readRequiredFile('docs/wiki/Home.md');

  assert.match(wikiHome, new RegExp(escapedDemoUrl));
  assert.match(
    wikiHome,
    /\[examples\/demo\.md\]\(https:\/\/github\.com\/zpyoung\/agent-isles\/blob\/main\/examples\/demo\.md\)/,
  );
});

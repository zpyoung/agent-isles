import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = '.github/workflows/pages.yml';
const readme = readFileSync('README.md', 'utf8');
const wikiHome = readFileSync('docs/wiki/Home.md', 'utf8');
const demoUrl = 'https://zpyoung.github.io/agent-isles/demo.html';

test('GitHub Pages workflow publishes the rendered demo from dist', () => {
  assert.equal(existsSync(workflowPath), true, 'expected a GitHub Pages workflow');

  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run render -- --out dist\/demo\.html/);
  assert.match(workflow, /upload-pages-artifact@v3/);
  assert.match(workflow, /path:\s*dist/);
  assert.match(workflow, /deploy-pages@v4/);
});

test('README and wiki link to the source Markdown and published rendered demo', () => {
  for (const doc of [readme, wikiHome]) {
    assert.match(doc, new RegExp(demoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(doc, /examples\/demo\.md/);
  }
});

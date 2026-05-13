import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const fixture = resolve('tests/fixtures/simple.md');
const demo = resolve('examples/demo.md');
const componentBundle = resolve('dist/agent-components.js');

function assertCustomElementDefinition(bundle, tagName) {
  assert.match(bundle, new RegExp(`customElements\\.define\\(["']${tagName}["']`));
}

test('renderMarkdownFile renders Markdown with preserved agent islands and injected assets', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(fixture);

  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.match(html, /<agent-decision verdict="go" title="Proceed">/);
  assert.match(html, /Ship the first renderer slice\./);
  assert.match(html, /<agent-metric label="Coverage" value="92" unit="%" trend="up">\s*<\/agent-metric>/);
  assert.match(html, /<agent-copy-block lang="bash" label="Install command">/);
  assert.match(html, /npm install agent-isles/);
  assert.match(html, /bootstrap@5\.3\.3/);
  assert.match(html, /agent-components\.js/);
  assert.match(html, /Agent Isles theme/);
});

test('component bundle registers the initial agent island vocabulary', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-decision', 'agent-risk', 'agent-metric', 'agent-copy-block']) {
    assertCustomElementDefinition(bundle, tagName);
  }
});

test('sanitized render mode removes active HTML while preserving safe islands', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Safety Check

<agent-risk level="high" title="Review" onclick="steal()">
  <a href="javascript:alert(1)" class="btn btn-danger" data-bs-toggle="modal">bad link</a>
  <script>alert('owned')</script>
  <img src="x" onerror="steal()" alt="probe">
</agent-risk>
<agent-metric label="Coverage" value="92" unit="%" trend="up" onclick="steal()"></agent-metric>
<agent-copy-block label="Install command" lang="bash" onclick="steal()">npm install agent-isles</agent-copy-block>
<agent-tabs label="Safe tabs" onclick="steal()"><agent-tab title="One" active>Body</agent-tab></agent-tabs>
<agent-timeline label="Safe timeline"><agent-step status="done" label="Reviewed" onclick="steal()">Done</agent-step></agent-timeline>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-risk level="high" title="Review">/);
  assert.match(html, /<agent-metric label="Coverage" value="92" unit="%" trend="up"><\/agent-metric>/);
  assert.match(html, /<agent-copy-block label="Install command" lang="bash">npm install agent-isles<\/agent-copy-block>/);
  assert.match(html, /<agent-tabs label="Safe tabs"><agent-tab title="One" active(?:="")?>Body<\/agent-tab><\/agent-tabs>/);
  assert.match(html, /<agent-timeline label="Safe timeline"><agent-step status="done" label="Reviewed">Done<\/agent-step><\/agent-timeline>/);
  assert.match(html, /class="btn btn-danger"/);
  assert.match(html, /data-bs-toggle="modal"/);
  assert.match(html, /bad link/);
  assert.doesNotMatch(html, /<script>alert\('owned'\)<\/script>/i);
  assert.doesNotMatch(html, /alert\('owned'\)/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /onerror=/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('isles render --safe writes sanitized HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-safe-'));
  const inputFile = join(dir, 'unsafe.md');
  const outFile = join(dir, 'unsafe.html');

  writeFileSync(inputFile, '# Unsafe\n\n<div onclick="steal()"><script>bad()</script>Text</div>');

  execFileSync(process.execPath, ['bin/isles.mjs', 'render', inputFile, '--safe', '--out', outFile], {
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(html, /<div>Text<\/div>/);
  assert.doesNotMatch(html, /<script>bad\(\)<\/script>/i);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /bad\(\)/i);
});

test('isles render writes a complete HTML file and component bundle to --out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const outFile = join(dir, 'nested', 'simple.html');

  const stdout = execFileSync(process.execPath, ['bin/isles.mjs', 'render', fixture, '--out', outFile], {
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Rendered:/);
  assert.match(stdout, new RegExp(outFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.match(html, /<script type="module" src="\.\/agent-components\.js"><\/script>/);
  assert.ok(existsSync(join(dir, 'nested', 'agent-components.js')));
});

test('isles render uses a deterministic dist output path by default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const outFile = join(dir, 'dist', 'simple.html');

  const stdout = execFileSync(process.execPath, [resolve('bin/isles.mjs'), 'render', fixture], {
    cwd: dir,
    encoding: 'utf8',
  });
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Rendered:/);
  assert.match(stdout, new RegExp(outFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /<h1>Demo Island<\/h1>/);
  assert.ok(existsSync(join(dir, 'dist', 'agent-components.js')));
});

test('renderMarkdownFile rejects missing inputs with a friendly error', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const missingFile = resolve('tests/fixtures/missing.md');

  await assert.rejects(
    () => renderMarkdownFile(missingFile),
    (error) => {
      assert.equal(error.code, 'ERR_AGENT_ISLES_INPUT_NOT_FOUND');
      assert.match(error.message, /Input file not found:/);
      assert.match(error.message, new RegExp(missingFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('isles render rejects non-Markdown inputs before rendering', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-'));
  const txtFile = join(dir, 'notes.txt');
  writeFileSync(txtFile, '# Not Markdown');

  const result = spawnSync(process.execPath, [resolve('bin/isles.mjs'), 'render', txtFile], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported input file extension:/);
  assert.match(result.stderr, /Expected a Markdown file ending in \.md or \.markdown\./);
  assert.equal(result.stdout, '');
});

test('component bundle registers tabs and timeline islands', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-tabs', 'agent-tab', 'agent-timeline', 'agent-step']) {
    assertCustomElementDefinition(bundle, tagName);
  }
  assert.match(bundle, /role\W*tablist/);
  assert.match(bundle, /role\W*tabpanel/);
});

test('demo renders a multi-phase plan with tabs and timeline steps', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<agent-tabs>/);
  assert.match(html, /<agent-tab title="Phase 1 — Discover">/);
  assert.match(html, /<agent-tab title="Phase 2 — Build">/);
  assert.match(html, /<agent-timeline label="Discovery progress">/);
  assert.match(html, /<agent-step status="done" label="Renderer baseline">/);
  assert.match(html, /<agent-step status="active" label="Component expansion">/);
  assert.match(html, /<agent-step status="pending" label="Browser polish">/);
});

test('local asset mode writes network-free HTML and copies third-party assets', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-local-'));
  const outFile = join(dir, 'simple.html');

  const { html } = await renderMarkdownFile(fixture, { outFile, assetMode: 'local' });

  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /href="\.\/assets\/bootstrap\.min\.css"/);
  assert.match(html, /href="\.\/assets\/github-dark\.min\.css"/);
  assert.match(html, /src="\.\/assets\/bootstrap\.bundle\.min\.js"/);
  assert.match(html, /<script type="module" src="\.\/agent-components\.js"><\/script>/);
  assert.ok(existsSync(join(dir, 'assets', 'bootstrap.min.css')));
  assert.ok(existsSync(join(dir, 'assets', 'github-dark.min.css')));
  assert.ok(existsSync(join(dir, 'assets', 'bootstrap.bundle.min.js')));
  assert.ok(existsSync(join(dir, 'agent-components.js')));
});

test('CLI --assets local selects local asset mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-cli-local-'));
  const outFile = join(dir, 'simple.html');

  const stdout = execFileSync(
    process.execPath,
    ['bin/isles.mjs', 'render', fixture, '--assets', 'local', '--out', outFile],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Assets: local/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.ok(existsSync(join(dir, 'assets', 'bootstrap.min.css')));
});

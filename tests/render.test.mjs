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

test('component bundle registers the Gantt chart island vocabulary', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-gantt', 'agent-gantt-phase', 'agent-gantt-task']) {
    assertCustomElementDefinition(bundle, tagName);
  }
  assert.match(bundle, /role\W*grid/);
  assert.match(bundle, /agent-gantt-legend/);
});

test('sanitized render mode preserves safe Gantt tags and attributes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Safe Gantt

<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule" onclick="steal()">
  <agent-gantt-phase label="Core build" onclick="steal()">
    <agent-gantt-task label="Components + Storybook" start="3" end="5" tone="components" detail="2 wks" parallel onclick="steal()">
      <script>alert('owned')</script>
      Accessible notes survive.
    </agent-gantt-task>
  </agent-gantt-phase>
</agent-gantt>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">/);
  assert.match(html, /<agent-gantt-phase label="Core build">/);
  assert.match(
    html,
    /<agent-gantt-task label="Components \+ Storybook" start="3" end="5" tone="components" detail="2 wks" parallel(?:="")?>\s*Accessible notes survive\.\s*<\/agent-gantt-task>/,
  );
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /onclick=/i);
});

test('component bundle registers the status board island vocabulary', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-status-board', 'agent-status-item']) {
    assertCustomElementDefinition(bundle, tagName);
  }
  assert.match(bundle, /agent-status-summary/);
  assert.match(bundle, /Overall/);
});

test('sanitized render mode preserves safe status board tags and attributes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Safe Status Board

<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status" onclick="steal()">
  <agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g" onclick="steal()">
    <script>alert('owned')</script>
    CI green; render smoke passing.
  </agent-status-item>
</agent-status-board>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">/);
  assert.match(
    html,
    /<agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g">\s*CI green; render smoke passing\.\s*<\/agent-status-item>/,
  );
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /onclick=/i);
});

test('demo renders full and minimal status board examples', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h2>Status board<\/h2>/i);
  assert.match(html, /<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">/);
  assert.match(html, /<agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a">/);
  assert.match(html, /<agent-status-board label="Component readiness">/);
  assert.match(html, /<agent-status-item label="KPI" status="green" owner="Merlin">/);
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

test('demo renders a focused Gantt chart embedded in Markdown prose', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h2>Revised migration schedule<\/h2>/i);
  assert.match(html, /<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">/);
  assert.match(html, /<agent-gantt-phase label="Core build">/);
  assert.match(html, /<agent-gantt-task label="Components \+ Storybook" start="3" end="5" tone="components" detail="2 wks/);
  assert.match(html, /<agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" detail="Runs continuously beside component work" parallel(?:="")?>/);
});

test('demo can render source Markdown beside rendered output', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo, { showSource: true });

  assert.match(html, /class="agent-isles-source-comparison/);
  assert.match(html, /Source Markdown/);
  assert.match(html, /Rendered output/);
  assert.match(html, /<code class="language-markdown">/);
  assert.match(html, /# Agent Isles Demo: Launch Readiness Report/);
  assert.match(html, /&lt;agent-decision verdict=&quot;ship-with-guardrails&quot;/);
  assert.match(html, /<agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for agent reports">/);
});

test('source view uses a wide equal split and flush source indentation', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo, { showSource: true });
  const theme = readFileSync(resolve('src/theme/agent-theme.css'), 'utf8');

  assert.match(html, /agent-isles-source-pane col-12 col-xl-6/);
  assert.match(html, /agent-isles-rendered-pane col-12 col-xl-6/);
  assert.match(
    html,
    /<code class="language-markdown">#[^\n]/,
    'expected source Markdown to start flush with # immediately after opening code tag',
  );
  assert.doesNotMatch(html, /<code class="language-markdown">\s+#/);
  assert.match(theme, /\.agent-isles-page--source-view\s*{[^}]*max-width:\s*min\(1920px,\s*100vw\)/s);
  assert.doesNotMatch(theme, /\.agent-isles-source-pane\s*{[^}]*position:\s*sticky/s);
  assert.doesNotMatch(theme, /\.agent-isles-source-markdown\s*{[^}]*max-height:/s);
  assert.doesNotMatch(theme, /\.agent-isles-source-markdown\s*{[^}]*overflow:\s*auto/s);
});

test('CLI --show-source writes source comparison HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-source-view-'));
  const outFile = join(dir, 'demo.html');

  const stdout = execFileSync(
    process.execPath,
    ['bin/isles.mjs', 'render', demo, '--show-source', '--out', outFile],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Source view: enabled/);
  assert.match(html, /class="agent-isles-source-comparison/);
  assert.match(html, /&lt;agent-risk level=&quot;medium&quot; title=&quot;Raw HTML is a trust boundary&quot;&gt;/);
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

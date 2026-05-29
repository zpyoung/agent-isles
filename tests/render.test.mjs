import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const fixture = resolve('tests/fixtures/simple.md');
const demo = resolve('examples/demo.md');
const componentBundle = resolve('dist/agent-components.js');

function createPackFixture(manifest, files = {}) {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-render-pack-'));
  writeFileSync(join(packDir, 'agent-isles.pack.json'), JSON.stringify(manifest, null, 2));

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(packDir, filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return packDir;
}

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

test('renderMarkdownFile returns structured resolved pack data', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-render-pack-'));
  writeFileSync(join(packDir, 'agent-isles.pack.json'), JSON.stringify({
    agentIslesPackVersion: 1,
    name: 'render-pack',
  }, null, 2));

  const { resolvedPacks } = await renderMarkdownFile(fixture, {
    explicitPacks: [packDir],
    includeUserPacks: false,
  });

  assert.equal(resolvedPacks.packs.length, 1);
  assert.equal(resolvedPacks.packs[0].name, 'render-pack');
  assert.equal(resolvedPacks.packs[0].packDir, packDir);
});

test('component bundle registers the initial agent island vocabulary', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-decision', 'agent-risk', 'agent-metric', 'agent-copy-block']) {
    assertCustomElementDefinition(bundle, tagName);
  }
});

test('component bundle registers dependency DAG islands', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-dependency-map', 'agent-dependency']) {
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

test('sanitized render mode preserves safe dependency map markup', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Safe dependencies

<agent-dependency-map label="Chain" direction="vertical" legend="show" onclick="steal()">
  <agent-dependency id="edit-server" label="Edit server" status="ready" owner="Merlin" priority="P0" href="https://example.com" onclick="steal()">
    Starts the localhost edit workflow.
  </agent-dependency>
  <agent-dependency id="source-metadata" label="Source metadata" status="blocked" blocked-by="edit-server" onclick="steal()">
    Requires the edit server entrypoint first.
    <script>alert('owned')</script>
  </agent-dependency>
</agent-dependency-map>
`, { renderMode: 'sanitized' });

  assert.match(
    html,
    /<agent-dependency-map(?=[^>]*\blabel="Chain")(?=[^>]*\bdirection="vertical")(?=[^>]*\blegend="show")[^>]*>/,
  );
  assert.match(
    html,
    /<agent-dependency id="(?:user-content-)?edit-server" label="Edit server" status="ready" owner="Merlin" priority="P0" href="https:\/\/example\.com">/,
  );
  assert.match(
    html,
    /<agent-dependency id="(?:user-content-)?source-metadata" label="Source metadata" status="blocked" blocked-by="edit-server">/,
  );
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script>/i);
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

test('sanitized render mode preserves declared pack tags and attributes only', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-sanitize-'));
  const inputFile = join(dir, 'pack-safe.md');
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'safe-pack',
    tags: [
      { name: 'safe-card', attributes: ['tone', 'title'] },
    ],
  });

  writeFileSync(inputFile, `# Pack safe

<safe-card tone="info" title="Notice" secret="drop">Declared</safe-card>
<rogue-card tone="danger">Rogue</rogue-card>
`);

  const { html } = await renderMarkdownFile(inputFile, {
    explicitPacks: [packDir],
    includeUserPacks: false,
    renderMode: 'sanitized',
  });

  assert.match(html, /<safe-card tone="info" title="Notice">Declared<\/safe-card>/);
  assert.doesNotMatch(html, /secret=/i);
  assert.doesNotMatch(html, /<rogue-card/i);
  assert.match(html, /Rogue/);
});

test('sanitized render mode blocks unsafe pack-declared attributes and protocols', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-unsafe-'));
  const inputFile = join(dir, 'pack-unsafe.md');
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'unsafe-pack',
    tags: [
      { name: 'unsafe-card', attributes: ['href', 'src', 'onclick', 'style', 'title'] },
    ],
  });

  writeFileSync(inputFile, `# Pack unsafe

<unsafe-card title="Still safe" href="javascript:alert(1)" src="javascript:alert(2)" onclick="steal()" style="display:none">Body</unsafe-card>
`);

  const { html } = await renderMarkdownFile(inputFile, {
    explicitPacks: [packDir],
    includeUserPacks: false,
    renderMode: 'sanitized',
  });

  assert.match(html, /<unsafe-card title="Still safe">Body<\/unsafe-card>/);
  assert.doesNotMatch(html, /<unsafe-card[^>]*href=/i);
  assert.doesNotMatch(html, /<unsafe-card[^>]*src=/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /style=/i);
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

test('isles render rejects pack tag conflicts before writing output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-conflict-'));
  const inputFile = join(dir, 'conflict.md');
  const outFile = join(dir, 'conflict.html');
  const alphaPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'alpha-pack',
    version: '1.0.0',
    tags: ['shared-widget'],
  });
  const betaPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'beta-pack',
    version: '2.0.0',
    tags: ['shared-widget'],
  });

  writeFileSync(inputFile, '# Conflict\n\n<shared-widget></shared-widget>');

  const result = spawnSync(
    process.execPath,
    [
      resolve('bin/isles.mjs'),
      'render',
      inputFile,
      '--out',
      outFile,
      '--pack',
      alphaPack,
      '--pack',
      betaPack,
      '--no-user-packs',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /shared-widget/);
  assert.match(result.stderr, /alpha-pack@1\.0\.0/);
  assert.match(result.stderr, /beta-pack@2\.0\.0/);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(outFile), false);
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

test('component bundle registers the action list island vocabulary', () => {
  const bundle = readFileSync(componentBundle, 'utf8');

  for (const tagName of ['agent-action-list', 'agent-action']) {
    assertCustomElementDefinition(bundle, tagName);
  }
  assert.match(bundle, /group-by/);
  assert.match(bundle, /filter-status/);
  assert.match(bundle, /layout/);
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

<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status" hide-empty-groups onclick="steal()">
  <agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g" onclick="steal()">
    <script>alert('owned')</script>
    CI green; render smoke passing.
  </agent-status-item>
  <agent-status-item label="Security" status-color="amber" status-label="Medium Risk" owner="Team">
    Needs review.
  </agent-status-item>
</agent-status-board>
`, { renderMode: 'sanitized' });

  assert.match(html, /<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status" hide-empty-groups(?:="")?>/);
  assert.match(
    html,
    /<agent-status-item label="Renderer" status="green" owner="Merlin" updated="mon" history="g,g,g,g">\s*CI green; render smoke passing\.\s*<\/agent-status-item>/,
  );
  assert.match(
    html,
    /<agent-status-item label="Security" status-color="amber" status-label="Medium Risk" owner="Team">\s*Needs review\.\s*<\/agent-status-item>/,
  );
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /onclick=/i);
});

test('sanitized render mode preserves safe action list tags and attributes', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');

  const html = await renderMarkdown(`
# Safe actions

<agent-action-list label="Launch follow-ups" layout="table" group-by="status" filter-status="open,done" filter-priority="high,normal" show-done="false" onclick="steal()">
  <agent-action owner="Merlin" due="2026-05-24" priority="high" status="in-progress" onclick="steal()">
    Re-run render smoke after component bundle changes.
    <script>alert('owned')</script>
  </agent-action>
  <agent-action owner="Pix" status="done">Mirror docs to wiki.</agent-action>
</agent-action-list>
`, { renderMode: 'sanitized' });

  assert.match(
    html,
    /<agent-action-list label="Launch follow-ups" layout="table" group-by="status" filter-status="open,done" filter-priority="high,normal" show-done="false">/,
  );
  assert.match(
    html,
    /<agent-action owner="Merlin" due="2026-05-24" priority="high" status="in-progress">\s*Re-run render smoke after component bundle changes\.\s*<\/agent-action>/,
  );
  assert.match(html, /<agent-action owner="Pix" status="done">Mirror docs to wiki\.<\/agent-action>/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /onclick=/i);
});

test('demo renders full and minimal status board examples', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h3>Status board<\/h3>/i);
  assert.match(html, /<agent-status-board label="Project health" meta="wk 24" summary="bar" group-by="status">/);
  assert.match(html, /<agent-status-item label="Writeback" status="amber" owner="Zach" updated="tue" history="g,g,a,a">/);
  assert.match(html, /<agent-status-board label="Component readiness">/);
  assert.match(html, /<agent-status-item label="KPI" status="green" owner="Merlin">/);
});

test('demo renders a multi-phase plan with tabs and timeline steps', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<agent-tabs>/);
  assert.match(html, /<agent-tab title="Phase 1 — Discover" active(?:="")?>/);
  assert.match(html, /<agent-tab title="Phase 2 — Build">/);
  assert.match(html, /<agent-timeline label="Discovery progress">/);
  assert.match(html, /<agent-step status="done" label="Renderer baseline">/);
  assert.match(html, /<agent-step status="active" label="Component expansion">/);
  assert.match(html, /<agent-step status="pending" label="Browser polish">/);
});

test('demo renders a dependency chain map with blocked nodes', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(
    html,
    /<agent-dependency-map(?=[^>]*\blabel="Writeback dependency chain")(?=[^>]*\bdirection="vertical")(?=[^>]*\blegend="show")[^>]*>/,
  );
  assert.match(html, /<agent-dependency id="source-metadata" label="Source metadata" status="blocked" blocked-by="edit-server"/);
  assert.match(html, /<agent-dependency id="writeback-release" label="Writeback release" status="risk" blocked-by="browser-client, docs"/);
});

test('demo renders a focused Gantt chart embedded in Markdown prose', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(html, /<h3>Gantt chart<\/h3>/i);
  assert.match(html, /<agent-gantt weeks="28" milestones="12,15,28" label="Migration schedule">/);
  assert.match(html, /<agent-gantt-phase label="Core build">/);
  assert.match(html, /<agent-gantt-task label="Components \+ Storybook" start="3" end="5" tone="components" detail="2 wks/);
  assert.match(html, /<agent-gantt-task label="Testing — parallel" start="3" end="12" tone="testing" detail="Runs continuously beside component work" parallel(?:="")?>/);
});

test('demo renders action list islands with nested actions', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);

  assert.match(
    html,
    /<agent-action-list\s+label="From this demo"\s+layout="table"\s+group-by="status"\s+filter-status="open,in-progress"\s+filter-priority="high,normal"\s+show-done="false">/,
  );
  assert.match(html, /<agent-action owner="You" status="open">/);
  assert.match(html, /<agent-action owner="You" status="in-progress" priority="high" due="2026-05-24">/);
  assert.match(html, /<agent-action-list label="From standup \(minimal\)">/);
  assert.match(html, /<agent-action-list label="Launch follow-ups \(kanban\)" layout="kanban" show-done="false">/);
  assert.match(html, /<agent-action-list label="Launch follow-ups \(priority lanes\)" layout="priority" show-done="true">/);
});

test('demo gives every supported component a rendered/source side-by-side pair', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo);
  const supportedTags = [
    'agent-decision',
    'agent-risk',
    'agent-metric',
    'agent-delta',
    'agent-kpi',
    'agent-copy-block',
    'agent-status-board',
    'agent-status-item',
    'agent-dependency-map',
    'agent-dependency',
    'agent-tabs',
    'agent-tab',
    'agent-timeline',
    'agent-step',
    'agent-gantt',
    'agent-gantt-phase',
    'agent-gantt-task',
    'agent-action-list',
    'agent-action',
  ];

  assert.match(html, /class="agent-component-pane agent-component-rendered/);
  assert.match(html, /class="agent-component-pane agent-component-source-card/);
  assert.match(html, /Source Markdown/);
  assert.match(html, /Rendered output/);

  const componentCards = [...html.matchAll(/data-agent-components="([^"]+)"/g)]
    .map((match) => match[1].split(/\s+/));

  for (const tagName of supportedTags) {
    assert.ok(
      componentCards.some((cardTags) => cardTags.includes(tagName)),
      `expected ${tagName} to be assigned to a side-by-side card`,
    );
    assert.ok(html.includes(`<${tagName}`), `expected rendered ${tagName}`);
    assert.ok(html.includes(`&#x3C;${tagName}`), `expected source Markdown for ${tagName}`);
  }

  assert.doesNotMatch(html, /agent-gallery-example title=/);
});

test('demo can render source Markdown beside rendered output', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');

  const { html } = await renderMarkdownFile(demo, { showSource: true });

  assert.match(html, /class="agent-isles-source-comparison/);
  assert.match(html, /Source Markdown/);
  assert.match(html, /Rendered output/);
  assert.match(html, /<code class="language-markdown">/);
  assert.match(html, /# Agent Isles Demo: Component Gallery/);
  assert.match(html, /&lt;agent-decision verdict=&quot;ship-with-guardrails&quot;/);
  assert.match(html, /<agent-decision verdict="ship-with-guardrails" title="Use Markdown islands for reports">/);
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

test('isles render copies pack assets, writes metadata, and injects assets deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-assets-'));
  const outFile = join(dir, 'nested', 'pack.html');
  const inputFile = join(dir, 'pack.md');
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'alpha-pack',
      version: '1.2.3',
      description: 'Alpha components',
      tags: [{ name: 'alpha-card', attributes: ['tone'] }],
      assets: [
        { type: 'module', path: 'components/alpha-card.js' },
        { type: 'style', path: 'styles/alpha-card.css' },
      ],
    },
    {
      'components/alpha-card.js': 'customElements.define("alpha-card", class extends HTMLElement {});',
      'styles/alpha-card.css': 'alpha-card { display: block; }',
    },
  );

  writeFileSync(inputFile, '# Pack assets\n\n<alpha-card tone="good">Copied</alpha-card>');

  execFileSync(
    process.execPath,
    [resolve('bin/isles.mjs'), 'render', inputFile, '--out', outFile, '--pack', packDir, '--no-user-packs'],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');
  const packsJson = JSON.parse(readFileSync(join(dir, 'nested', 'assets', 'agent-isles', 'packs.json'), 'utf8'));

  const packStyle = './assets/agent-isles/packs/alpha-pack-1.2.3/styles/alpha-card.css';
  const packModule = './assets/agent-isles/packs/alpha-pack-1.2.3/components/alpha-card.js';

  assert.ok(existsSync(join(dir, 'nested', 'assets', 'agent-isles', 'packs', 'alpha-pack-1.2.3', 'styles', 'alpha-card.css')));
  assert.ok(existsSync(join(dir, 'nested', 'assets', 'agent-isles', 'packs', 'alpha-pack-1.2.3', 'components', 'alpha-card.js')));
  assert.match(html, /<meta name="agent-isles-packs" content="alpha-pack@1\.2\.3" \/>/);
  assert.match(html, /<link rel="agent-isles-packs" href="\.\/assets\/agent-isles\/packs\.json" type="application\/json" \/>/);
  assert.match(html, new RegExp(`<link href="${packStyle.replaceAll('.', '\\.')}" rel="stylesheet" data-agent-isles-pack="alpha-pack@1\\.2\\.3" \\/>`));
  assert.match(html, new RegExp(`<script type="module" src="${packModule.replaceAll('.', '\\.')}" data-agent-isles-pack="alpha-pack@1\\.2\\.3"><\\/script>`));
  assert.deepEqual(packsJson.packs, [
    {
      id: 'alpha-pack@1.2.3',
      safeId: 'alpha-pack-1.2.3',
      name: 'alpha-pack',
      version: '1.2.3',
      description: 'Alpha components',
      tags: [{ name: 'alpha-card', attributes: ['tone'] }],
      assets: [
        {
          type: 'module',
          path: 'components/alpha-card.js',
          outputPath: 'assets/agent-isles/packs/alpha-pack-1.2.3/components/alpha-card.js',
        },
        {
          type: 'style',
          path: 'styles/alpha-card.css',
          outputPath: 'assets/agent-isles/packs/alpha-pack-1.2.3/styles/alpha-card.css',
        },
      ],
    },
  ]);

  const coreStyleIndex = html.indexOf('bootstrap@5.3.3/dist/css/bootstrap.min.css');
  const themeIndex = html.indexOf('Agent Isles theme');
  const packStyleIndex = html.indexOf(packStyle);
  const bootstrapScriptIndex = html.indexOf('bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js');
  const coreModuleIndex = html.indexOf('./agent-components.js');
  const packModuleIndex = html.indexOf(packModule);

  assert.ok(coreStyleIndex >= 0, 'expected core Bootstrap stylesheet');
  assert.ok(themeIndex > coreStyleIndex, 'expected theme after core stylesheet');
  assert.ok(packStyleIndex > themeIndex, 'expected pack style after core styles');
  assert.ok(bootstrapScriptIndex > packStyleIndex, 'expected runtime after pack styles');
  assert.ok(coreModuleIndex > bootstrapScriptIndex, 'expected core module after runtime');
  assert.ok(packModuleIndex > coreModuleIndex, 'expected pack module after core module');
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

test('inline asset mode writes single-file HTML with all JavaScript and CSS embedded', async () => {
  const { renderMarkdownFile } = await import('../src/render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-inline-'));
  const outFile = join(dir, 'simple.html');

  const { html } = await renderMarkdownFile(fixture, { outFile, assetMode: 'inline' });

  assert.doesNotMatch(html, /<link[^>]*href="[^"]*\.css"/i);
  assert.doesNotMatch(html, /<script[^>]*src="[^"]*\.js"/i);
  assert.doesNotMatch(html, /<link[^>]*href="https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//i);
  assert.match(html, /\/\* Bootstrap CSS \*\//);
  assert.match(html, /\/\* Highlight\.js CSS \*\//);
  assert.match(html, /\/\* Bootstrap JS \*\//);
  assert.match(html, /\/\* Agent Isles component runtime \*\//);
  assert.match(html, /<script type="module">/);
  assert.match(html, /customElements\.define/);
  assert.equal(existsSync(join(dir, 'assets')), false, 'expected no assets directory in inline mode');
  assert.equal(existsSync(join(dir, 'agent-components.js')), false, 'expected no separate component bundle in inline mode');
});

test('CLI --assets inline selects inline asset mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-cli-inline-'));
  const outFile = join(dir, 'simple.html');

  const stdout = execFileSync(
    process.execPath,
    ['bin/isles.mjs', 'render', fixture, '--assets', 'inline', '--out', outFile],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');

  assert.match(stdout, /Assets: inline/);
  assert.doesNotMatch(html, /<link[^>]*href="[^"]*\.css"/i);
  assert.doesNotMatch(html, /<script[^>]*src="[^"]*\.js"/i);
  assert.doesNotMatch(html, /<link[^>]*href="https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//i);
  assert.match(html, /\/\* Agent Isles component runtime \*\//);
  assert.equal(existsSync(join(dir, 'assets')), false);
  assert.equal(existsSync(join(dir, 'agent-components.js')), false);
});

test('inline asset mode embeds pack JavaScript and CSS inline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-inline-'));
  const outFile = join(dir, 'pack.html');
  const inputFile = join(dir, 'pack.md');
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'beta-pack',
      version: '2.0.0',
      tags: [{ name: 'beta-widget', attributes: ['tone'] }],
      assets: [
        { type: 'module', path: 'beta-widget.js' },
        { type: 'style', path: 'beta-widget.css' },
      ],
    },
    {
      'beta-widget.js': 'customElements.define("beta-widget", class extends HTMLElement {});',
      'beta-widget.css': 'beta-widget { display: inline-block; }',
    },
  );

  writeFileSync(inputFile, '# Pack inline\n\n<beta-widget tone="neutral">Inlined</beta-widget>');

  execFileSync(
    process.execPath,
    [resolve('bin/isles.mjs'), 'render', inputFile, '--assets', 'inline', '--out', outFile, '--pack', packDir, '--no-user-packs'],
    { encoding: 'utf8' },
  );
  const html = readFileSync(outFile, 'utf8');

  assert.match(html, /\/\* Pack: beta-pack@2\.0\.0 - beta-widget\.css \*\//);
  assert.match(html, /beta-widget { display: inline-block; }/);
  assert.match(html, /\/\* Pack: beta-pack@2\.0\.0 - beta-widget\.js \*\//);
  assert.match(html, /customElements\.define\("beta-widget"/);
  assert.match(html, /<style data-agent-isles-pack="beta-pack@2\.0\.0">/);
  assert.match(html, /<script type="module" data-agent-isles-pack="beta-pack@2\.0\.0">/);
  assert.doesNotMatch(html, /<link[^>]*href="[^"]*beta-widget\.css"/i);
  assert.doesNotMatch(html, /<script[^>]*src="[^"]*beta-widget\.js"/i);
  assert.equal(existsSync(join(dir, 'assets')), false);
  assert.equal(existsSync(join(dir, 'agent-components.js')), false);
});

test('inline asset mode escapes raw-text end tags in embedded pack assets', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-inline-escape-'));
  const moduleFile = join(dir, 'breakout.js');
  const styleFile = join(dir, 'breakout.css');
  // Asset bodies containing the raw-text element terminators that would otherwise
  // prematurely close the injected <script>/<style> and break the single file.
  writeFileSync(moduleFile, 'const marker = "</script><script>alert(1)</script>";\n');
  writeFileSync(styleFile, '.x::before { content: "</style><style>body{background:red}"; }\n');

  const packAssetRecords = [
    {
      id: 'escape-pack@1.0.0',
      assets: [
        { type: 'module', path: 'breakout.js', resolvedPath: moduleFile },
        { type: 'style', path: 'breakout.css', resolvedPath: styleFile },
      ],
    },
  ];

  const html = await renderMarkdown('# Escape\n', { assetMode: 'inline', packAssetRecords });

  // The asset's own end tags must be neutralized so they cannot close our element.
  assert.ok(!html.includes('alert(1)</script>'), 'pack module end tag must be escaped');
  assert.ok(html.includes('alert(1)<\\/script>'), 'escaped module end tag must be present');
  assert.ok(!html.includes('"</style><style>'), 'pack style end tag must be escaped');
  assert.ok(html.includes('<\\/style>'), 'escaped style end tag must be present');
});

test('inline asset mode fails fast when a declared pack module asset is missing', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const packAssetRecords = [
    {
      id: 'gamma-pack@3.0.0',
      assets: [
        { type: 'module', path: 'gamma-widget.js', resolvedPath: resolve('tests/fixtures/__missing-inline-asset__.js') },
      ],
    },
  ];

  await assert.rejects(
    () => renderMarkdown('# Missing module\n', { assetMode: 'inline', packAssetRecords }),
    (error) => {
      assert.match(error.message, /gamma-pack@3\.0\.0/, 'error must identify the pack');
      assert.match(error.message, /gamma-widget\.js/, 'error must identify the asset path');
      return true;
    },
  );
});

test('inline asset mode fails fast when a declared pack style asset is missing', async () => {
  const { renderMarkdown } = await import('../src/render.mjs');
  const packAssetRecords = [
    {
      id: 'delta-pack@4.0.0',
      assets: [
        { type: 'style', path: 'delta-widget.css', resolvedPath: resolve('tests/fixtures/__missing-inline-style__.css') },
      ],
    },
  ];

  await assert.rejects(
    () => renderMarkdown('# Missing style\n', { assetMode: 'inline', packAssetRecords }),
    (error) => {
      assert.match(error.message, /delta-pack@4\.0\.0/, 'error must identify the pack');
      assert.match(error.message, /delta-widget\.css/, 'error must identify the asset path');
      return true;
    },
  );
});


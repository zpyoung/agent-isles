import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACK_MANIFEST_FILE = 'agent-isles.pack.json';
const islePath = fileURLToPath(new URL('../bin/isles.mjs', import.meta.url));
const repoRoot = resolve(dirname(islePath), '..');

/**
 * Creates a temporary pack directory with a manifest file.
 */
function createPackFixture(manifest, files = {}) {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-cli-test-'));
  const manifestPath = join(packDir, PACK_MANIFEST_FILE);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Create additional files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(packDir, filePath);
    const dir = join(fullPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  return packDir;
}

test('CLI accepts --pack option', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'cli-test-pack',
  });

  const mdFile = join(tmpdir(), 'test-cli-pack.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--pack', packDir], {
    encoding: 'utf8',
  });

  // Should not fail with pack option
  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Packs: 1/);
  assert.match(result.stdout, /cli-test-pack/);
});

test('CLI accepts multiple --pack options', () => {
  const pack1 = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'pack-1',
  });
  const pack2 = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'pack-2',
  });

  const mdFile = join(tmpdir(), 'test-cli-multi-pack.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(
    process.execPath,
    [islePath, 'render', mdFile, '--pack', pack1, '--pack', pack2],
    { encoding: 'utf8' },
  );

  // Should not fail with multiple pack options
  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
});

test('CLI accepts --no-user-packs option', () => {
  const mdFile = join(tmpdir(), 'test-cli-no-user-packs.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--no-user-packs'], {
    encoding: 'utf8',
  });

  // Should not fail with --no-user-packs option
  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Packs: 0/);
});

test('CLI resolves project config packs beside the Markdown input', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'project-config-pack',
  });
  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-cli-project-config-'));
  const mdFile = join(projectDir, 'test.md');
  writeFileSync(mdFile, '# Test\n');
  writeFileSync(join(projectDir, 'isles.config.json'), JSON.stringify({ packs: [packDir] }, null, 2));

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Packs: 1/);
  assert.match(result.stdout, /project-config-pack/);
});

test('CLI loads user config packs by default', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'user-config-pack',
  });
  const xdgConfigHome = mkdtempSync(join(tmpdir(), 'agent-isles-cli-user-config-home-'));
  const userConfigDir = join(xdgConfigHome, 'agent-isles');
  mkdirSync(userConfigDir, { recursive: true });
  writeFileSync(join(userConfigDir, 'isles.config.json'), JSON.stringify({ packs: [packDir] }, null, 2));

  const mdFile = join(tmpdir(), 'test-cli-user-pack.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
  });

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Packs: 1/);
  assert.match(result.stdout, /user-config-pack/);
});

test('CLI skips user config packs with --no-user-packs', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'skipped-user-config-pack',
  });
  const xdgConfigHome = mkdtempSync(join(tmpdir(), 'agent-isles-cli-skip-user-config-home-'));
  const userConfigDir = join(xdgConfigHome, 'agent-isles');
  mkdirSync(userConfigDir, { recursive: true });
  writeFileSync(join(userConfigDir, 'isles.config.json'), JSON.stringify({ packs: [packDir] }, null, 2));

  const mdFile = join(tmpdir(), 'test-cli-skip-user-pack.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--no-user-packs'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
  });

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Packs: 0/);
  assert.doesNotMatch(result.stdout, /skipped-user-config-pack/);
});

test('CLI rejects --pack without value', () => {
  const mdFile = join(tmpdir(), 'test-cli-pack-no-value.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--pack'], {
    encoding: 'utf8',
  });

  // Should fail with missing value error
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing value for --pack/);
});

test('CLI rejects unsupported V1+ pack source types with roadmap guidance', () => {
  const mdFile = join(tmpdir(), 'test-cli-pack-unsupported-source.md');
  writeFileSync(mdFile, '# Test\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--pack', 'npm:future-pack'], {
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm:/);
  assert.match(result.stderr, /not supported/i);
  assert.match(result.stderr, /V1\+/i);
  assert.match(result.stderr, /discussions\/64/);
});

test('CLI renders successfully with explicit pack containing assets', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'asset-pack',
      assets: [
        { type: 'module', path: 'components.js' },
        { type: 'style', path: 'styles.css' },
      ],
    },
    {
      'components.js': 'console.log("component");',
      'styles.css': '.theme {}',
    },
  );

  const mdFile = join(tmpdir(), 'test-cli-pack-assets.md');
  writeFileSync(mdFile, '# Test with pack\n');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--pack', packDir], {
    encoding: 'utf8',
  });

  // Should render successfully
  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Rendered:/);
});

test('CLI diagnoses explicit, project, and user pack resolution sources', () => {
  const explicitPack = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'explicit-diagnostics-pack',
      version: '1.0.0',
      tags: [{ name: 'explicit-widget', attributes: ['label', 'style', 'onclick'] }],
      assets: [{ type: 'module', path: 'explicit-widget.js' }],
    },
    {
      'explicit-widget.js': 'customElements.define("explicit-widget", class extends HTMLElement {});',
    },
  );
  const projectPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'project-diagnostics-pack',
    tags: ['project-widget'],
  });
  const userPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'user-diagnostics-pack',
    tags: [{ name: 'user-widget', attributes: ['tone'] }],
  });

  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-cli-packs-resolve-'));
  const mdFile = join(projectDir, 'diagnostics.md');
  writeFileSync(mdFile, '# Diagnostics\n');
  writeFileSync(join(projectDir, 'isles.config.json'), JSON.stringify({ packs: [projectPack] }, null, 2));

  const xdgConfigHome = mkdtempSync(join(tmpdir(), 'agent-isles-cli-packs-resolve-home-'));
  const userConfigDir = join(xdgConfigHome, 'agent-isles');
  mkdirSync(userConfigDir, { recursive: true });
  writeFileSync(join(userConfigDir, 'isles.config.json'), JSON.stringify({ packs: [userPack] }, null, 2));

  const result = spawnSync(
    process.execPath,
    [islePath, 'packs', 'resolve', mdFile, '--pack', explicitPack],
    {
      encoding: 'utf8',
      env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
    },
  );

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /Resolved packs: 3/);
  assert.match(result.stdout, /explicit-diagnostics-pack@1\.0\.0/);
  assert.match(result.stdout, /Source: explicit --pack/);
  assert.match(result.stdout, /project-diagnostics-pack/);
  assert.match(result.stdout, /Source: project config/);
  assert.match(result.stdout, /user-diagnostics-pack/);
  assert.match(result.stdout, /Source: user config/);
  assert.match(result.stdout, /explicit-widget/);
  assert.match(result.stdout, /sanitized attributes: label/);
  assert.doesNotMatch(result.stdout, /sanitized attributes: .*style/);
  assert.match(result.stdout, /Warnings:/);
  assert.match(result.stdout, /style.*ignored in sanitized mode/);
  assert.match(result.stdout, /onclick.*ignored in sanitized mode/);
  assert.match(result.stdout, /explicit-widget\.js -> assets\/agent-isles\/packs\/explicit-diagnostics-pack-1\.0\.0\/explicit-widget\.js/);
});

test('CLI pack diagnostics honor --no-user-packs', () => {
  const userPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'diagnostics-skipped-user-pack',
  });
  const xdgConfigHome = mkdtempSync(join(tmpdir(), 'agent-isles-cli-packs-resolve-skip-home-'));
  const userConfigDir = join(xdgConfigHome, 'agent-isles');
  mkdirSync(userConfigDir, { recursive: true });
  writeFileSync(join(userConfigDir, 'isles.config.json'), JSON.stringify({ packs: [userPack] }, null, 2));

  const mdFile = join(tmpdir(), 'test-cli-packs-resolve-no-user.md');
  writeFileSync(mdFile, '# Diagnostics\n');

  const result = spawnSync(process.execPath, [islePath, 'packs', 'resolve', mdFile, '--no-user-packs'], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
  });

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /User packs: disabled/);
  assert.match(result.stdout, /Resolved packs: 0/);
  assert.doesNotMatch(result.stdout, /diagnostics-skipped-user-pack/);
});

test('example fixture renders a third-party local pack custom element', () => {
  const mdFile = join(repoRoot, 'examples', 'pack-demo.md');
  const packDir = join(repoRoot, 'examples', 'packs', 'demo-widget-pack');
  const outFile = join(mkdtempSync(join(tmpdir(), 'agent-isles-example-pack-render-')), 'pack-demo.html');

  const result = spawnSync(process.execPath, [islePath, 'render', mdFile, '--out', outFile, '--pack', packDir, '--mode', 'sanitized'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);
  assert.match(result.stdout, /demo-widget-pack/);
  const html = readFileSync(outFile, 'utf8');
  assert.match(html, /<demo-widget title="Third-party island" tone="success">/);
  assert.match(html, /demo-widget\.js/);
  assert.match(html, /demo-widget\.css/);
  assert.equal(existsSync(join(dirname(outFile), 'assets', 'agent-isles', 'packs', 'demo-widget-pack-1.0.0', 'demo-widget.js')), true);
});

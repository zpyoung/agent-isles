import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const PACK_MANIFEST_FILE = 'agent-isles.pack.json';
const islePath = fileURLToPath(new URL('../bin/isles.mjs', import.meta.url));

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

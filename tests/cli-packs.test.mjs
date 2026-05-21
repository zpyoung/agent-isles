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

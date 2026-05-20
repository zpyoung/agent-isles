import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const {
  loadPackManifest,
  PackLoadError,
  PACK_ERROR_CODES,
  SUPPORTED_PACK_VERSION,
  PACK_MANIFEST_FILE,
  RESERVED_TAG_PREFIX,
  ASSET_TYPES,
} = await import('../src/pack-loader.mjs');

/**
 * Creates a temporary pack directory with a manifest file.
 */
function createPackFixture(manifest, files = {}) {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-test-'));
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

test('loadPackManifest loads a minimal valid pack with required fields only', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'my-pack',
  });

  const pack = loadPackManifest(packDir);

  assert.equal(pack.packVersion, 1);
  assert.equal(pack.name, 'my-pack');
  assert.equal(pack.version, undefined);
  assert.equal(pack.description, undefined);
  assert.equal(pack.homepage, undefined);
  assert.deepEqual(pack.tags, []);
  assert.deepEqual(pack.assets, []);
  assert.equal(pack.packDir, packDir);
  assert.equal(pack.manifestPath, join(packDir, PACK_MANIFEST_FILE));
});

test('loadPackManifest loads a complete pack with all optional fields', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'ui-kit',
      version: '2.1.0',
      description: 'Custom UI components',
      homepage: 'https://example.com/ui-kit',
      tags: [],
      assets: [],
    },
  );

  const pack = loadPackManifest(packDir);

  assert.equal(pack.name, 'ui-kit');
  assert.equal(pack.version, '2.1.0');
  assert.equal(pack.description, 'Custom UI components');
  assert.equal(pack.homepage, 'https://example.com/ui-kit');
});

test('loadPackManifest accepts a direct manifest file path', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'direct-path',
  });
  const manifestPath = join(packDir, PACK_MANIFEST_FILE);

  const pack = loadPackManifest(manifestPath);

  assert.equal(pack.name, 'direct-path');
  assert.equal(pack.packDir, packDir);
});

test('loadPackManifest normalizes simple tag names', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'tag-pack',
    tags: ['custom-button', 'custom-card'],
  });

  const pack = loadPackManifest(packDir);

  assert.equal(pack.tags.length, 2);
  assert.deepEqual(pack.tags[0], { name: 'custom-button', attributes: [] });
  assert.deepEqual(pack.tags[1], { name: 'custom-card', attributes: [] });
});

test('loadPackManifest normalizes tags with attributes', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'attrs-pack',
    tags: [
      { name: 'custom-widget', attributes: ['label', 'value', 'tone'] },
      { name: 'custom-panel', attributes: [] },
    ],
  });

  const pack = loadPackManifest(packDir);

  assert.equal(pack.tags.length, 2);
  assert.deepEqual(pack.tags[0], {
    name: 'custom-widget',
    attributes: ['label', 'value', 'tone'],
  });
  assert.deepEqual(pack.tags[1], { name: 'custom-panel', attributes: [] });
});

test('loadPackManifest validates and resolves asset paths', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'asset-pack',
      assets: [
        { type: 'module', path: 'components.js' },
        { type: 'style', path: 'styles/theme.css' },
      ],
    },
    {
      'components.js': 'console.log("component");',
      'styles/theme.css': '.theme {}',
    },
  );

  const pack = loadPackManifest(packDir);

  assert.equal(pack.assets.length, 2);
  assert.equal(pack.assets[0].type, 'module');
  assert.equal(pack.assets[0].path, 'components.js');
  assert.equal(pack.assets[0].resolvedPath, join(packDir, 'components.js'));
  assert.equal(pack.assets[1].type, 'style');
  assert.equal(pack.assets[1].path, 'styles/theme.css');
  assert.equal(pack.assets[1].resolvedPath, join(packDir, 'styles/theme.css'));
});

test('loadPackManifest rejects missing manifest file', () => {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-test-'));

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.MANIFEST_NOT_FOUND);
      assert.match(error.message, /Pack manifest not found/);
      return true;
    },
  );
});

test('loadPackManifest rejects non-existent pack path', () => {
  assert.throws(
    () => loadPackManifest('/tmp/non-existent-pack-dir'),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.MANIFEST_NOT_FOUND);
      assert.match(error.message, /Pack path not found/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid JSON', () => {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-test-'));
  const manifestPath = join(packDir, PACK_MANIFEST_FILE);
  writeFileSync(manifestPath, '{ invalid json }');

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_JSON);
      assert.match(error.message, /Failed to parse pack manifest/);
      return true;
    },
  );
});

test('loadPackManifest rejects missing agentIslesPackVersion field', () => {
  const packDir = createPackFixture({
    name: 'missing-version',
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.MISSING_REQUIRED_FIELD);
      assert.match(error.message, /agentIslesPackVersion/);
      return true;
    },
  );
});

test('loadPackManifest rejects missing name field', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.MISSING_REQUIRED_FIELD);
      assert.match(error.message, /Missing required field: name/);
      return true;
    },
  );
});

test('loadPackManifest rejects unsupported pack version', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 99,
    name: 'future-pack',
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.UNSUPPORTED_VERSION);
      assert.match(error.message, /Unsupported pack version: 99/);
      assert.match(error.message, new RegExp(`Expected version ${SUPPORTED_PACK_VERSION}`));
      return true;
    },
  );
});

test('loadPackManifest rejects invalid pack name - uppercase', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'MyPack',
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_NAME);
      assert.match(error.message, /Invalid pack name/);
      assert.match(error.message, /lowercase letter/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid pack name - special characters', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'my_pack',
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_NAME);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid pack name - starts with digit', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: '1-pack',
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_NAME);
      return true;
    },
  );
});

test('loadPackManifest accepts valid pack names', () => {
  for (const validName of ['my-pack', 'ui-kit', 'a', 'pack-v2', 'custom-123']) {
    const packDir = createPackFixture({
      agentIslesPackVersion: 1,
      name: validName,
    });

    const pack = loadPackManifest(packDir);
    assert.equal(pack.name, validName);
  }
});

test('loadPackManifest rejects reserved agent- tag prefix', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'reserved-pack',
    tags: ['agent-custom'],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.RESERVED_TAG_PREFIX);
      assert.match(error.message, /agent-custom/);
      assert.match(error.message, new RegExp(RESERVED_TAG_PREFIX));
      assert.match(error.message, /reserved/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid tag name - no hyphen', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-tag-pack',
    tags: ['button'],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_TAG_NAME);
      assert.match(error.message, /button/);
      assert.match(error.message, /contain at least one hyphen/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid tag name - uppercase', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-tag-pack',
    tags: ['Custom-Button'],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_TAG_NAME);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid tag name - starts with hyphen', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-tag-pack',
    tags: ['-custom-button'],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_TAG_NAME);
      return true;
    },
  );
});

test('loadPackManifest rejects tag declaration missing name field', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-tag-pack',
    tags: [{ attributes: ['label'] }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_TAG_NAME);
      assert.match(error.message, /missing required "name" field/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid attribute name - uppercase', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-attr-pack',
    tags: [{ name: 'custom-widget', attributes: ['myLabel'] }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ATTRIBUTE_NAME);
      assert.match(error.message, /myLabel/);
      return true;
    },
  );
});

test('loadPackManifest rejects invalid attribute name - special characters', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-attr-pack',
    tags: [{ name: 'custom-widget', attributes: ['my_label'] }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ATTRIBUTE_NAME);
      return true;
    },
  );
});

test('loadPackManifest accepts valid attribute names', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'attr-pack',
    tags: [
      {
        name: 'custom-widget',
        attributes: ['label', 'data-value', 'aria-label', 'my-attr-123'],
      },
    ],
  });

  const pack = loadPackManifest(packDir);
  assert.deepEqual(pack.tags[0].attributes, ['label', 'data-value', 'aria-label', 'my-attr-123']);
});

test('loadPackManifest rejects unknown asset type', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'bad-asset-pack',
      assets: [{ type: 'font', path: 'fonts/custom.woff2' }],
    },
    { 'fonts/custom.woff2': 'binary' },
  );

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ASSET_TYPE);
      assert.match(error.message, /Invalid asset type: "font"/);
      assert.match(error.message, /module, style/);
      return true;
    },
  );
});

test('loadPackManifest rejects asset with missing type field', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'bad-asset-pack',
      assets: [{ path: 'components.js' }],
    },
    { 'components.js': 'code' },
  );

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ASSET_TYPE);
      assert.match(error.message, /missing required "type" field/);
      return true;
    },
  );
});

test('loadPackManifest rejects asset with missing path field', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-asset-pack',
    assets: [{ type: 'module' }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ASSET_PATH);
      assert.match(error.message, /missing required "path" field/);
      return true;
    },
  );
});

test('loadPackManifest rejects absolute asset paths', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'bad-asset-pack',
    assets: [{ type: 'module', path: '/etc/passwd' }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.INVALID_ASSET_PATH);
      assert.match(error.message, /must be relative/);
      return true;
    },
  );
});

test('loadPackManifest rejects path traversal - parent directory', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'traversal-pack',
    assets: [{ type: 'module', path: '../outside.js' }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.PATH_TRAVERSAL);
      assert.match(error.message, /Path traversal detected/);
      assert.match(error.message, /\.\.\/outside\.js/);
      return true;
    },
  );
});

test('loadPackManifest rejects path traversal - complex pattern', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'traversal-pack',
    assets: [{ type: 'module', path: 'foo/../../outside.js' }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.PATH_TRAVERSAL);
      return true;
    },
  );
});

test('loadPackManifest rejects non-existent asset file', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'missing-asset-pack',
    assets: [{ type: 'module', path: 'components.js' }],
  });

  assert.throws(
    () => loadPackManifest(packDir),
    (error) => {
      assert.equal(error.code, PACK_ERROR_CODES.ASSET_NOT_FOUND);
      assert.match(error.message, /Asset file not found: components\.js/);
      return true;
    },
  );
});

test('loadPackManifest accepts both module and style asset types', () => {
  const packDir = createPackFixture(
    {
      agentIslesPackVersion: 1,
      name: 'multi-asset-pack',
      assets: [
        { type: ASSET_TYPES.MODULE, path: 'index.js' },
        { type: ASSET_TYPES.STYLE, path: 'styles.css' },
      ],
    },
    {
      'index.js': 'export default {};',
      'styles.css': '.class {}',
    },
  );

  const pack = loadPackManifest(packDir);
  assert.equal(pack.assets.length, 2);
  assert.equal(pack.assets[0].type, ASSET_TYPES.MODULE);
  assert.equal(pack.assets[1].type, ASSET_TYPES.STYLE);
});

test('loadPackManifest preserves PackLoadError structure with code and details', () => {
  const packDir = createPackFixture({
    agentIslesPackVersion: 999,
    name: 'error-pack',
  });

  try {
    loadPackManifest(packDir);
    assert.fail('Expected PackLoadError to be thrown');
  } catch (error) {
    assert.equal(error.name, 'PackLoadError');
    assert.equal(error.code, PACK_ERROR_CODES.UNSUPPORTED_VERSION);
    assert.ok(error.details);
    assert.equal(error.details.version, 999);
    assert.equal(error.details.supported, SUPPORTED_PACK_VERSION);
  }
});

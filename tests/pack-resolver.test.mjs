import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';
import test from 'node:test';

const PACK_MANIFEST_FILE = 'agent-isles.pack.json';

/**
 * Creates a temporary pack directory with a manifest file.
 */
function createPackFixture(manifest) {
  const packDir = mkdtempSync(join(tmpdir(), 'agent-isles-pack-test-'));
  const manifestPath = join(packDir, PACK_MANIFEST_FILE);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return packDir;
}

/**
 * Creates a temporary project directory with an isles.config.json file.
 */
function createProjectConfigFixture(config) {
  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-project-test-'));
  const configPath = join(projectDir, 'isles.config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return projectDir;
}

test('resolvePackInputs resolves explicit CLI packs in order', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const pack1 = createPackFixture({ agentIslesPackVersion: 1, name: 'pack-1' });
  const pack2 = createPackFixture({ agentIslesPackVersion: 1, name: 'pack-2' });

  const result = await resolvePackInputs({
    explicitPacks: [pack1, pack2],
    projectDir: null,
    includeUserPacks: false,
  });

  assert.equal(result.packs.length, 2);
  assert.equal(result.packs[0].name, 'pack-1');
  assert.equal(result.packs[0].packDir, pack1);
  assert.equal(result.packs[1].name, 'pack-2');
  assert.equal(result.packs[1].packDir, pack2);
});

test('resolvePackInputs loads project config packs from isles.config.json', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const pack1 = createPackFixture({ agentIslesPackVersion: 1, name: 'project-pack' });
  const projectDir = createProjectConfigFixture({
    packs: [pack1],
  });

  const result = await resolvePackInputs({
    explicitPacks: [],
    projectDir,
    includeUserPacks: false,
  });

  assert.equal(result.packs.length, 1);
  assert.equal(result.packs[0].name, 'project-pack');
});

test('resolvePackInputs applies deterministic resolution order: explicit > project > user', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const explicitPack = createPackFixture({ agentIslesPackVersion: 1, name: 'explicit-pack' });
  const projectPack = createPackFixture({ agentIslesPackVersion: 1, name: 'project-pack' });
  const userPack = createPackFixture({ agentIslesPackVersion: 1, name: 'user-pack' });

  const projectDir = createProjectConfigFixture({
    packs: [projectPack],
  });

  // Create a mock user config dir
  const userConfigDir = mkdtempSync(join(tmpdir(), 'agent-isles-user-config-'));
  const userConfigPath = join(userConfigDir, 'isles.config.json');
  writeFileSync(userConfigPath, JSON.stringify({ packs: [userPack] }, null, 2));

  const result = await resolvePackInputs({
    explicitPacks: [explicitPack],
    projectDir,
    includeUserPacks: true,
    userConfigDir, // Override for testing
  });

  assert.equal(result.packs.length, 3);
  assert.equal(result.packs[0].name, 'explicit-pack');
  assert.equal(result.packs[1].name, 'project-pack');
  assert.equal(result.packs[2].name, 'user-pack');
});

test('resolvePackInputs deduplicates identical pack paths', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const pack1 = createPackFixture({ agentIslesPackVersion: 1, name: 'shared-pack' });

  const projectDir = createProjectConfigFixture({
    packs: [pack1],
  });

  const result = await resolvePackInputs({
    explicitPacks: [pack1], // Same pack in explicit
    projectDir,
    includeUserPacks: false,
  });

  // Should only appear once (explicit takes precedence)
  assert.equal(result.packs.length, 1);
  assert.equal(result.packs[0].name, 'shared-pack');
});

test('resolvePackInputs deduplicates the same canonical pack version from different sources', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const explicitPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'shared-pack',
    version: '1.2.3',
    tags: ['shared-widget'],
  });
  const projectPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'shared-pack',
    version: '1.2.3',
    tags: ['shared-widget'],
  });
  const projectDir = createProjectConfigFixture({
    packs: [projectPack],
  });

  const result = await resolvePackInputs({
    explicitPacks: [explicitPack],
    projectDir,
    includeUserPacks: false,
  });

  assert.equal(result.packs.length, 1);
  assert.equal(result.packs[0].name, 'shared-pack');
  assert.equal(result.packs[0].version, '1.2.3');
  assert.equal(result.tagOwners.get('shared-widget').ownerId, 'shared-pack@1.2.3');
});

test('resolvePackInputs rejects different packs that claim the same tag with actionable owners', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

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

  await assert.rejects(
    async () => await resolvePackInputs({
      explicitPacks: [alphaPack, betaPack],
      projectDir: null,
      includeUserPacks: false,
    }),
    (error) => {
      assert.match(error.message, /shared-widget/);
      assert.match(error.message, /alpha-pack@1\.0\.0/);
      assert.match(error.message, /beta-pack@2\.0\.0/);
      assert.equal(error.details?.tagName, 'shared-widget');
      return true;
    },
  );
});

test('resolvePackInputs rejects packs that claim reserved core agent tags with the pack owner named', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const reservedPack = createPackFixture({
    agentIslesPackVersion: 1,
    name: 'reserved-pack',
    version: '1.0.0',
    tags: ['agent-decision'],
  });

  await assert.rejects(
    async () => await resolvePackInputs({
      explicitPacks: [reservedPack],
      projectDir: null,
      includeUserPacks: false,
    }),
    (error) => {
      assert.match(error.message, /agent-decision/);
      assert.match(error.message, /reserved-pack/);
      assert.match(error.message, /reserved/i);
      return true;
    },
  );
});

test('resolvePackInputs respects --no-user-packs flag', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const userPack = createPackFixture({ agentIslesPackVersion: 1, name: 'user-pack' });
  const userConfigDir = mkdtempSync(join(tmpdir(), 'agent-isles-user-config-'));
  const userConfigPath = join(userConfigDir, 'isles.config.json');
  writeFileSync(userConfigPath, JSON.stringify({ packs: [userPack] }, null, 2));

  const result = await resolvePackInputs({
    explicitPacks: [],
    projectDir: null,
    includeUserPacks: false,
    userConfigDir,
  });

  assert.equal(result.packs.length, 0);
});

test('resolvePackInputs handles missing project config gracefully', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-project-no-config-'));

  const result = await resolvePackInputs({
    explicitPacks: [],
    projectDir,
    includeUserPacks: false,
  });

  assert.equal(result.packs.length, 0);
});

test('resolvePackInputs handles missing user config gracefully', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const userConfigDir = mkdtempSync(join(tmpdir(), 'agent-isles-user-no-config-'));

  const result = await resolvePackInputs({
    explicitPacks: [],
    projectDir: null,
    includeUserPacks: true,
    userConfigDir,
  });

  assert.equal(result.packs.length, 0);
});

test('resolvePackInputs returns empty array when no packs configured', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const result = await resolvePackInputs({
    explicitPacks: [],
    projectDir: null,
    includeUserPacks: false,
  });

  assert.equal(result.packs.length, 0);
  assert.deepEqual(result.packs, []);
});

test('resolvePackInputs rejects unsupported pack source types with helpful error', async () => {
  const { resolvePackInputs } = await import('../src/pack-resolver.mjs');

  const projectDir = createProjectConfigFixture({
    packs: ['npm:some-package'], // V1+ feature
  });

  await assert.rejects(
    async () => await resolvePackInputs({
      explicitPacks: [],
      projectDir,
      includeUserPacks: false,
    }),
    (error) => {
      assert.match(error.message, /npm:/);
      assert.match(error.message, /not supported/i);
      assert.match(error.message, /V1\+/i);
      return true;
    },
  );
});

test('loadProjectConfig returns null when config file does not exist', async () => {
  const { loadProjectConfig } = await import('../src/pack-resolver.mjs');

  const projectDir = mkdtempSync(join(tmpdir(), 'agent-isles-project-no-config-'));
  const config = loadProjectConfig(projectDir);

  assert.equal(config, null);
});

test('loadProjectConfig loads valid isles.config.json', async () => {
  const { loadProjectConfig } = await import('../src/pack-resolver.mjs');

  const pack1 = createPackFixture({ agentIslesPackVersion: 1, name: 'config-pack' });
  const projectDir = createProjectConfigFixture({
    packs: [pack1],
  });

  const config = loadProjectConfig(projectDir);

  assert.ok(config);
  assert.deepEqual(config.packs, [pack1]);
});

test('loadUserConfig returns null when config file does not exist', async () => {
  const { loadUserConfig } = await import('../src/pack-resolver.mjs');

  const userConfigDir = mkdtempSync(join(tmpdir(), 'agent-isles-user-no-config-'));
  const config = loadUserConfig(userConfigDir);

  assert.equal(config, null);
});

test('loadUserConfig loads valid isles.config.json from user config dir', async () => {
  const { loadUserConfig } = await import('../src/pack-resolver.mjs');

  const pack1 = createPackFixture({ agentIslesPackVersion: 1, name: 'user-config-pack' });
  const userConfigDir = mkdtempSync(join(tmpdir(), 'agent-isles-user-config-'));
  const userConfigPath = join(userConfigDir, 'isles.config.json');
  writeFileSync(userConfigPath, JSON.stringify({ packs: [pack1] }, null, 2));

  const config = loadUserConfig(userConfigDir);

  assert.ok(config);
  assert.deepEqual(config.packs, [pack1]);
});

test('getUserConfigDir returns platform-specific config directory', async () => {
  const { getUserConfigDir } = await import('../src/pack-resolver.mjs');

  const configDir = getUserConfigDir();

  assert.ok(configDir);
  assert.equal(typeof configDir, 'string');

  // Should contain agent-isles somewhere in the path
  assert.match(configDir, /agent-isles/i);
});

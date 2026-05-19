import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');

const expectedPublishedFiles = [
  'LICENSE',
  'README.md',
  'bin/isles.mjs',
  'dist/agent-components.js',
  'dist/agent-components.js.map',
  'examples/demo.md',
  'package.json',
  'src/components/agent-copy-block.js',
  'src/components/agent-decision.js',
  'src/components/agent-gantt.js',
  'src/components/agent-metric.js',
  'src/components/agent-risk.js',
  'src/components/agent-tabs.js',
  'src/components/agent-timeline.js',
  'src/components/index.js',
  'src/render.mjs',
  'src/theme/agent-theme.css',
  'src/watch.mjs',
];

function runNpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileSync(npmCommand, args, options);
}

test('package metadata defines a guarded npm prerelease path', () => {
  assert.equal(packageJson.version, '0.1.0-alpha.0');
  assert.deepEqual(packageJson.files, [
    'bin/',
    'src/',
    'dist/agent-components.js',
    'dist/agent-components.js.map',
    'examples/demo.md',
  ]);
  assert.equal(packageJson.scripts.prepack, 'npm run build');
  assert.equal(packageJson.scripts['pack:dry-run'], 'npm pack --dry-run');
  assert.equal(packageJson.publishConfig?.access, 'public');
  assert.equal(packageJson.publishConfig?.tag, 'next');
});

test('CLI --version reports the package version', () => {
  const version = execFileSync(process.execPath, ['bin/isles.mjs', '--version'], { encoding: 'utf8' }).trim();

  assert.equal(version, packageJson.version);
});

test('README documents local and future npm usage expectations', () => {
  assert.match(readme, /npm install/);
  assert.match(readme, /npm link/);
  assert.match(readme, /npm install -g agent-isles@next/);
  assert.match(readme, /npx agent-isles@next render/);
  assert.match(readme, /0\.1\.0-alpha\.N/);
  assert.match(readme, /npm run pack:dry-run -- --json/);
  assert.match(readme, /Do not publish/);
});

test('npm dry-run pack includes only the intended package files', () => {
  const stdout = runNpm(['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
  });
  const [pack] = JSON.parse(stdout);
  const actualFiles = pack.files.map((file) => file.path).sort();

  assert.deepEqual(actualFiles, expectedPublishedFiles);
  assert.equal(pack.name, 'agent-isles');
  assert.equal(pack.version, packageJson.version);
  assert.equal(pack.filename, `agent-isles-${packageJson.version}.tgz`);
  assert.equal(pack.bundled.length, 0);
});

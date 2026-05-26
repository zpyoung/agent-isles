import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const marketplace = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'));
const plugin = JSON.parse(readFileSync('plugins/agent-isles/.claude-plugin/plugin.json', 'utf8'));
const doctorPath = 'plugins/agent-isles/bin/isles-doctor.mjs';

function runDoctor(projectDir, extraArgs = []) {
  const result = spawnSync(process.execPath, [doctorPath, '--cwd', projectDir, '--json', ...extraArgs], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `doctor failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function makeProject(files) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-isles-plugin-test-'));
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
  return dir;
}

test('Claude Code marketplace exposes the in-repo Agent Isles plugin', () => {
  assert.equal(marketplace.name, 'agent-isles');
  assert.equal(marketplace.version, packageJson.version);
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, 'agent-isles');
  assert.equal(entry.version, packageJson.version);
  assert.equal(entry.source, './plugins/agent-isles');
  assert.equal(entry.homepage, 'https://github.com/zpyoung/agent-isles');
});

test('plugin metadata version tracks the npm package version', () => {
  assert.equal(plugin.name, 'agent-isles');
  assert.equal(plugin.version, packageJson.version);
});

test('plugin ships install, render, authoring skills, and doctor helper', () => {
  const requiredFiles = [
    'plugins/agent-isles/skills/install-update/SKILL.md',
    'plugins/agent-isles/skills/render/SKILL.md',
    'plugins/agent-isles/skills/component-authoring/SKILL.md',
    doctorPath,
    'plugins/agent-isles/README.md',
  ];

  for (const file of requiredFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }

  assert.match(readFileSync('plugins/agent-isles/skills/install-update/SKILL.md', 'utf8'), /agent-isles-install-update/);
  assert.match(readFileSync('plugins/agent-isles/skills/render/SKILL.md', 'utf8'), /agent-isles-render/);
  assert.match(readFileSync('plugins/agent-isles/skills/component-authoring/SKILL.md', 'utf8'), /agent-isles-component-authoring/);
});

test('isles-doctor bootstraps a directory without package.json', () => {
  const project = makeProject({ 'README.md': '# Smoke\n' });
  const report = runDoctor(project, ['--smoke', 'README.md']);

  assert.equal(report.packageJson.found, false);
  assert.deepEqual(report.commands.init, ['npm init -y']);
  assert.equal(report.packageManager.manager, 'npm');
  assert.equal(report.commands.installOrUpdate, 'npm install --save-dev agent-isles@next');
  assert.equal(
    report.commands.smoke,
    'npm exec -- isles render README.md --out dist/agent-isles-smoke.html --assets local',
  );
  assert.equal(
    report.commands.oneShotRender,
    'npx agent-isles@next render README.md --out dist/agent-isles-smoke.html --assets local',
  );
});

test('isles-doctor emits null one-shot render for missing smoke files', () => {
  const project = makeProject({ 'README.md': '# Smoke\n' });
  const report = runDoctor(project, ['--smoke', 'missing.md']);

  assert.equal(report.commands.smoke, null);
  assert.equal(report.commands.oneShotRender, null);
});

test('isles-doctor detects npm projects and existing agent-isles dependencies', () => {
  const project = makeProject({
    'package.json': JSON.stringify({ devDependencies: { 'agent-isles': '^0.1.0-alpha.0' } }),
    'package-lock.json': '{}',
  });
  const report = runDoctor(project);

  assert.equal(report.packageManager.manager, 'npm');
  assert.equal(report.packageManager.reason, 'package-lock.json');
  assert.equal(report.agentIsles.installed, true);
  assert.equal(report.agentIsles.field, 'devDependencies');
  assert.equal(report.agentIsles.spec, '^0.1.0-alpha.0');
  assert.equal(report.commands.installOrUpdate, 'npm install --save-dev agent-isles@next');
});

test('isles-doctor detects pnpm and yarn lockfiles', () => {
  const pnpmProject = makeProject({ 'package.json': '{}', 'pnpm-lock.yaml': '' });
  const yarnProject = makeProject({ 'package.json': '{}', 'yarn.lock': '' });

  const pnpmReport = runDoctor(pnpmProject);
  const yarnReport = runDoctor(yarnProject);

  assert.equal(pnpmReport.packageManager.manager, 'pnpm');
  assert.equal(pnpmReport.commands.installOrUpdate, 'pnpm add -D agent-isles@next');
  assert.equal(yarnReport.packageManager.manager, 'yarn');
  assert.equal(yarnReport.commands.installOrUpdate, 'yarn add --dev agent-isles@next');
});

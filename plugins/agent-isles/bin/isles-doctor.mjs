#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_NAME = 'agent-isles';
const DEFAULT_SPEC = 'agent-isles@next';
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function parseArgs(argv) {
  const options = { cwd: process.cwd(), json: false, smoke: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--cwd') {
      options.cwd = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--cwd=')) {
      options.cwd = arg.slice('--cwd='.length);
    } else if (arg === '--smoke') {
      options.smoke = argv[index + 1] ?? 'README.md';
      index += 1;
    } else if (arg.startsWith('--smoke=')) {
      options.smoke = arg.slice('--smoke='.length) || 'README.md';
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.cwd = path.resolve(options.cwd);
  return options;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(cwd) {
  const filePath = path.join(cwd, 'package.json');
  if (!(await exists(filePath))) {
    return { path: filePath, found: false, data: null, error: null };
  }
  try {
    return {
      path: filePath,
      found: true,
      data: JSON.parse(await readFile(filePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return { path: filePath, found: true, data: null, error: error.message };
  }
}

async function detectPackageManager(cwd, hasPackageJson) {
  const lockfiles = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['npm', 'package-lock.json'],
    ['npm', 'npm-shrinkwrap.json'],
  ];
  for (const [manager, lockfile] of lockfiles) {
    if (await exists(path.join(cwd, lockfile))) {
      return { manager, reason: lockfile };
    }
  }
  if (hasPackageJson) {
    return { manager: 'npm', reason: 'package.json without lockfile' };
  }
  return { manager: 'npm', reason: 'no package.json; npm init is the lowest-friction bootstrap' };
}

function findInstalledSpec(pkg) {
  if (!pkg) return null;
  for (const field of DEPENDENCY_FIELDS) {
    const spec = pkg[field]?.[PACKAGE_NAME];
    if (spec) return { field, spec };
  }
  return null;
}

function commandsFor(manager, hasPackageJson, smokeFile) {
  const init = hasPackageJson ? [] : ['npm init -y'];
  const install = {
    npm: `npm install --save-dev ${DEFAULT_SPEC}`,
    pnpm: `pnpm add -D ${DEFAULT_SPEC}`,
    yarn: `yarn add --dev ${DEFAULT_SPEC}`,
  }[manager];
  const exec = {
    npm: 'npm exec -- isles',
    pnpm: 'pnpm exec isles',
    yarn: 'yarn exec isles',
  }[manager];
  const smoke = smokeFile ? `${exec} render ${smokeFile} --out dist/agent-isles-smoke.html --assets local` : null;
  return {
    init,
    installOrUpdate: install,
    smoke,
  };
}

async function buildReport(options) {
  const packageJson = await readPackageJson(options.cwd);
  const packageManager = await detectPackageManager(options.cwd, packageJson.found);
  const installed = findInstalledSpec(packageJson.data);
  let smokeFile = options.smoke;
  if (smokeFile) {
    const absoluteSmoke = path.resolve(options.cwd, smokeFile);
    try {
      const info = await stat(absoluteSmoke);
      if (!info.isFile()) smokeFile = null;
    } catch {
      smokeFile = null;
    }
  }
  return {
    cwd: options.cwd,
    packageJson: {
      found: packageJson.found,
      path: packageJson.path,
      parseError: packageJson.error,
    },
    packageManager,
    agentIsles: {
      installed: Boolean(installed),
      field: installed?.field ?? null,
      spec: installed?.spec ?? null,
    },
    commands: commandsFor(packageManager.manager, packageJson.found, smokeFile),
  };
}

function printHelp() {
  console.log(`Usage: isles-doctor [--cwd <dir>] [--json] [--smoke <file.md>]\n\nDetects the host package manager and prints deterministic Agent Isles install/update commands.\n\nOptions:\n  --cwd <dir>       Project directory to inspect. Defaults to the current directory.\n  --json            Emit machine-readable JSON.\n  --smoke <file>    Include a render smoke-check command for an existing Markdown file.\n`);
}

function printHuman(report) {
  console.log('Agent Isles doctor');
  console.log(`- cwd: ${report.cwd}`);
  console.log(`- package.json: ${report.packageJson.found ? 'found' : 'not found'}`);
  if (report.packageJson.parseError) {
    console.log(`- package.json parse error: ${report.packageJson.parseError}`);
  }
  console.log(`- package manager: ${report.packageManager.manager} (${report.packageManager.reason})`);
  console.log(`- agent-isles: ${report.agentIsles.installed ? `${report.agentIsles.spec} in ${report.agentIsles.field}` : 'not installed'}`);
  console.log('\nRecommended commands:');
  for (const command of report.commands.init) console.log(`  ${command}`);
  console.log(`  ${report.commands.installOrUpdate}`);
  if (report.commands.smoke) console.log(`  ${report.commands.smoke}`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  const report = await buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.packageJson.parseError ? 2 : 0);
} catch (error) {
  console.error(`isles-doctor: ${error.message}`);
  process.exit(1);
}

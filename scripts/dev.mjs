// scripts/dev.mjs
// Repo-only dev supervisor. NOT shipped (scripts/ is excluded from package.json "files").
const SUBCOMMANDS = new Set(['live', 'preview', 'render']);
const USAGE = 'Usage: pnpm dev <live|preview|render> <target> [args...] [--no-open] [--no-build]';

export function parseDevArgs(argv) {
  if (argv.length === 0) throw new Error(USAGE);
  const [subcommand, ...rest] = argv;
  if (!SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Unsupported dev subcommand: ${subcommand}. ${USAGE}`);
  }
  let open = true;
  let build = true;
  const passthrough = [];
  for (const arg of rest) {
    if (arg === '--no-open') { open = false; continue; }
    if (arg === '--no-build') { build = false; continue; }
    passthrough.push(arg);
  }
  const target = passthrough.find((a) => !a.startsWith('-'));
  if (!target) throw new Error(`Missing <target> for dev ${subcommand}. ${USAGE}`);
  return { subcommand, target, passthrough, open, build };
}

// main() is wired in Task 10.
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  try {
    parseDevArgs(process.argv.slice(2));
    console.log('[dev] argv parsed; orchestration wired in Task 10');
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

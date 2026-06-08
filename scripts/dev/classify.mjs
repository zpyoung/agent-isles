// scripts/dev/classify.mjs
// Pure decision function: given changed absolute paths, decide what the supervisor does.

const IGNORE_SEGMENTS = ['/dist/', '/node_modules/', '/.git/', '/state/'];

function isIgnored(path) {
  return IGNORE_SEGMENTS.some((seg) => path.includes(seg));
}

function isComponentSource(path, root) {
  return path.startsWith(`${root}/src/components/`);
}

function isOtherSource(path, root) {
  return path.startsWith(`${root}/src/`) && !isComponentSource(path, root);
}

export function classifyChange(changedPaths, root) {
  const relevant = changedPaths.filter((p) => !isIgnored(p));
  if (relevant.length === 0) {
    return { rebuild: false, restart: false, ignored: true };
  }
  const rebuild = relevant.some((p) => isComponentSource(p, root));
  const restart = relevant.some((p) => isComponentSource(p, root) || isOtherSource(p, root));
  return { rebuild, restart, ignored: false };
}

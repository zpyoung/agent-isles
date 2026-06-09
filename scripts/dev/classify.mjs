// scripts/dev/classify.mjs
// Pure decision function: given changed absolute paths, decide what the supervisor does.

const IGNORE_SEGMENTS = ['/dist/', '/node_modules/', '/.git/', '/state/'];

function normalize(path) {
  return String(path || '').replace(/\\/g, '/');
}

function isIgnored(path) {
  const normalizedPath = normalize(path);
  return IGNORE_SEGMENTS.some((seg) => normalizedPath.includes(seg));
}

function isComponentSource(path, root) {
  const normalizedPath = normalize(path);
  const normalizedRoot = normalize(root);
  return normalizedPath.startsWith(`${normalizedRoot}/src/components/`);
}

function isOtherSource(path, root) {
  const normalizedPath = normalize(path);
  const normalizedRoot = normalize(root);
  return normalizedPath.startsWith(`${normalizedRoot}/src/`) && !isComponentSource(path, root);
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

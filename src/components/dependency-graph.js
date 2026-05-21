const EMPTY_LIST = Object.freeze([]);

export function parseDependencyIdList(value) {
  if (!value) return EMPTY_LIST;
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return EMPTY_LIST;
  return parts;
}

function stableSortByIndex(values, indexById) {
  return [...values].sort((a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0));
}

function findCycle(nodesById, blockersById) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function walk(id) {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      const startIndex = stack.indexOf(id);
      if (startIndex === -1) return [id, id];
      return [...stack.slice(startIndex), id];
    }

    visiting.add(id);
    stack.push(id);

    for (const blockerId of blockersById.get(id) || EMPTY_LIST) {
      if (!nodesById.has(blockerId)) continue;
      const cycle = walk(blockerId);
      if (cycle) return cycle;
    }

    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of nodesById.keys()) {
    const cycle = walk(id);
    if (cycle) return cycle;
  }

  return null;
}

function topoSort(nodeIds, blockersById, indexById) {
  const dependentsById = new Map();
  const indegreeById = new Map();

  for (const id of nodeIds) {
    indegreeById.set(id, 0);
    dependentsById.set(id, []);
  }

  for (const id of nodeIds) {
    for (const blockerId of blockersById.get(id) || EMPTY_LIST) {
      if (!indegreeById.has(blockerId)) continue;
      indegreeById.set(id, (indegreeById.get(id) ?? 0) + 1);
      dependentsById.get(blockerId).push(id);
    }
  }

  const ready = stableSortByIndex(
    nodeIds.filter((id) => (indegreeById.get(id) ?? 0) === 0),
    indexById,
  );
  const order = [];

  while (ready.length > 0) {
    const next = ready.shift();
    order.push(next);
    for (const dependentId of dependentsById.get(next) || EMPTY_LIST) {
      indegreeById.set(dependentId, (indegreeById.get(dependentId) ?? 0) - 1);
      if (indegreeById.get(dependentId) === 0) {
        ready.push(dependentId);
      }
    }
    ready.splice(0, ready.length, ...stableSortByIndex(ready, indexById));
  }

  return { order, remaining: nodeIds.filter((id) => (indegreeById.get(id) ?? 0) > 0) };
}

function computeDepths(order, blockersById) {
  const depthById = new Map();

  for (const id of order) {
    let depth = 0;
    for (const blockerId of blockersById.get(id) || EMPTY_LIST) {
      depth = Math.max(depth, (depthById.get(blockerId) ?? 0) + 1);
    }
    depthById.set(id, depth);
  }

  return depthById;
}

export function analyzeDependencyGraph(nodes) {
  const warnings = [];
  const nodesById = new Map();
  const indexById = new Map();
  const missingIdNodes = [];

  nodes.forEach((node, index) => {
    const id = typeof node.id === 'string' ? node.id.trim() : '';
    if (!id) {
      missingIdNodes.push({ ...node, index });
      return;
    }

    if (nodesById.has(id)) {
      warnings.push({ type: 'duplicate-id', id });
      return;
    }

    nodesById.set(id, { ...node, id });
    indexById.set(id, index);
  });

  const blockersById = new Map();
  const missingBlockersById = new Map();
  const edges = [];

  for (const [id, node] of nodesById.entries()) {
    const blockers = parseDependencyIdList(node.blockedBy);
    blockersById.set(id, blockers);

    const missing = [];
    for (const blockerId of blockers) {
      if (!nodesById.has(blockerId)) {
        missing.push(blockerId);
      } else {
        edges.push({ from: blockerId, to: id });
      }
    }
    if (missing.length > 0) missingBlockersById.set(id, missing);
  }

  const cycle = findCycle(nodesById, blockersById);
  if (cycle) warnings.push({ type: 'cycle', cycle });
  if (missingIdNodes.length > 0) warnings.push({ type: 'missing-id', count: missingIdNodes.length });

  const nodeIds = [...nodesById.keys()];
  let order = stableSortByIndex(nodeIds, indexById);
  let depthById = new Map(nodeIds.map((id) => [id, 0]));

  if (!cycle) {
    const sorted = topoSort(nodeIds, blockersById, indexById);
    if (sorted.remaining.length > 0) {
      warnings.push({ type: 'cycle', cycle: sorted.remaining });
    } else {
      order = sorted.order;
      depthById = computeDepths(order, blockersById);
    }
  }

  const maxDepth = Math.max(0, ...[...depthById.values()]);

  return {
    order,
    edges,
    depthById,
    maxDepth,
    missingBlockersById,
    nodesById,
    warnings,
    cycle,
    missingIdNodes,
  };
}


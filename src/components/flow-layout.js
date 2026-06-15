// Pure, dependency-free layout for <agent-flow> diagrams.
//
// Nodes are arranged into horizontal layers using longest-path layering: a node
// sits one layer below its deepest predecessor, so the diagram flows along its
// edges (top to bottom) instead of being packed into a fixed grid. Roots (no
// incoming edges) and edgeless nodes land in the top layer; siblings of a branch
// share a layer and spread across columns. Kept free of Lit/DOM imports so it can
// be unit-tested directly in Node.

const NODE_WIDTH = 156;
const COLUMN_GAP = 200; // horizontal center-to-center spacing within a layer
const ROW_GAP = 150; // vertical center-to-center spacing between layers
const MARGIN_X = 40;
const MARGIN_TOP = 80;
const MARGIN_BOTTOM = 80;
const MIN_WIDTH = 720;
const MIN_HEIGHT = 260;

export function layoutNodes(nodes, edges = []) {
  const list = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
  if (list.length === 0) {
    return { width: MIN_WIDTH, height: MIN_HEIGHT, positions: new Map() };
  }

  const ids = list.map((node) => node.id);
  const idSet = new Set(ids);
  const orderOf = new Map(ids.map((id, index) => [id, index]));

  const outgoing = new Map(ids.map((id) => [id, []]));
  const incoming = new Map(ids.map((id) => [id, []]));
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge) continue;
    const { source, target } = edge;
    if (!idSet.has(source) || !idSet.has(target) || source === target) continue;
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
  }

  const layer = assignLayers(ids, orderOf, outgoing, incoming);

  // Group ids by layer, keeping authored order within each layer for stability.
  const maxLayer = Math.max(...ids.map((id) => layer.get(id)));
  const layers = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of ids) layers[layer.get(id)].push(id);
  for (const row of layers) row.sort((a, b) => orderOf.get(a) - orderOf.get(b));

  const widestRow = layers.reduce((max, row) => Math.max(max, row.length), 1);
  const width = Math.max(MIN_WIDTH, MARGIN_X * 2 + NODE_WIDTH + (widestRow - 1) * COLUMN_GAP);

  // Vertical span between the first and last layer centers; center it inside the
  // canvas so short diagrams (clamped to MIN_HEIGHT) sit in the middle instead of
  // hugging the top. Taller diagrams resolve topOffset back to MARGIN_TOP.
  const layerSpan = maxLayer * ROW_GAP;
  const height = Math.max(MIN_HEIGHT, MARGIN_TOP + MARGIN_BOTTOM + layerSpan);
  const topOffset = (height - layerSpan) / 2;

  const positions = new Map();
  layers.forEach((row, layerIndex) => {
    const span = (row.length - 1) * COLUMN_GAP;
    const startX = (width - span) / 2;
    const y = topOffset + layerIndex * ROW_GAP;
    row.forEach((id, columnIndex) => {
      positions.set(id, {
        x: Math.round(startX + columnIndex * COLUMN_GAP),
        y: Math.round(y),
      });
    });
  });

  return { width, height, positions };
}

// Longest-path layering via Kahn's algorithm. Cycle-safe: any node whose
// in-degree never reaches zero (i.e. trapped in a cycle) is placed, in authored
// order, one layer below its deepest already-placed predecessor — so cycle tails
// still stack downward and only the back-edge points up.
function assignLayers(ids, orderOf, outgoing, incoming) {
  const layer = new Map(ids.map((id) => [id, 0]));
  const remainingIndeg = new Map(ids.map((id) => [id, incoming.get(id).length]));
  const byOrder = (a, b) => orderOf.get(a) - orderOf.get(b);

  const queue = ids.filter((id) => remainingIndeg.get(id) === 0).sort(byOrder);
  const ranked = new Set();

  while (queue.length > 0) {
    const id = queue.shift();
    if (ranked.has(id)) continue;
    ranked.add(id);
    for (const next of outgoing.get(id)) {
      if (layer.get(next) < layer.get(id) + 1) {
        layer.set(next, layer.get(id) + 1);
      }
      remainingIndeg.set(next, remainingIndeg.get(next) - 1);
      if (remainingIndeg.get(next) <= 0 && !ranked.has(next)) {
        queue.push(next);
        queue.sort(byOrder);
      }
    }
  }

  const placed = new Set(ranked);
  for (const id of ids) {
    if (placed.has(id)) continue;
    let best = 0;
    for (const src of incoming.get(id)) {
      if (placed.has(src)) best = Math.max(best, layer.get(src) + 1);
    }
    layer.set(id, best);
    placed.add(id);
  }

  return layer;
}

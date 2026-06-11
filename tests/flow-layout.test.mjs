import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutNodes } from '../src/components/flow-layout.js';

function node(id) {
  return { id, type: 'process', label: id };
}

function edge(source, target) {
  return { id: `${source}-${target}`, source, target };
}

test('a linear chain is laid out along the edges, not wrapped at 3 columns', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(node);
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e')];

  const { positions } = layoutNodes(nodes, edges);
  const y = (id) => positions.get(id).y;
  const x = (id) => positions.get(id).x;

  // Each successive node flows strictly downward (one layer per chain step).
  assert.ok(y('a') < y('b'), 'a above b');
  assert.ok(y('b') < y('c'), 'b above c');
  assert.ok(y('c') < y('d'), 'c above d');
  assert.ok(y('d') < y('e'), 'd above e');

  // Single-node layers are centered, so the whole chain shares one x column
  // (the old grid would have wrapped a->d->? into 3 columns instead).
  const xs = new Set(['a', 'b', 'c', 'd', 'e'].map(x));
  assert.equal(xs.size, 1, 'linear chain stays in a single centered column');
});

test('branch siblings share a layer and spread horizontally', () => {
  const nodes = ['root', 'left', 'right'].map(node);
  const edges = [edge('root', 'left'), edge('root', 'right')];

  const { positions } = layoutNodes(nodes, edges);

  assert.ok(positions.get('root').y < positions.get('left').y, 'root sits above its children');
  assert.equal(positions.get('left').y, positions.get('right').y, 'siblings share a layer (same y)');
  assert.notEqual(positions.get('left').x, positions.get('right').x, 'siblings get distinct columns');
});

test('roots (no incoming edges) are placed at the top layer', () => {
  const nodes = ['start', 'mid', 'end'].map(node);
  const edges = [edge('start', 'mid'), edge('mid', 'end')];

  const { positions } = layoutNodes(nodes, edges);
  const ys = ['start', 'mid', 'end'].map((id) => positions.get(id).y);
  assert.equal(Math.min(...ys), positions.get('start').y, 'start is the topmost node');
});

test('cycles are handled without hanging and every node gets a position', () => {
  const nodes = ['a', 'b', 'c'].map(node);
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];

  const { positions } = layoutNodes(nodes, edges);
  assert.equal(positions.size, 3, 'all cycle nodes are positioned');
  for (const id of ['a', 'b', 'c']) {
    assert.ok(Number.isFinite(positions.get(id).x), `${id} has a finite x`);
    assert.ok(Number.isFinite(positions.get(id).y), `${id} has a finite y`);
  }
});

test('edgeless nodes occupy a single row that grows past 3 columns', () => {
  const nodes = ['n1', 'n2', 'n3', 'n4', 'n5'].map(node);

  const { width, positions } = layoutNodes(nodes, []);
  const ys = new Set(['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => positions.get(id).y));
  const xs = new Set(['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => positions.get(id).x));

  assert.equal(ys.size, 1, 'unconnected nodes share one layer');
  assert.equal(xs.size, 5, 'all five get distinct columns (no 3-column wrap)');
  assert.ok(width > 720, 'canvas widens to fit more than three columns');
});

test('layout is deterministic for the same input', () => {
  const nodes = ['a', 'b', 'c'].map(node);
  const edges = [edge('a', 'b'), edge('a', 'c')];
  const first = layoutNodes(nodes, edges);
  const second = layoutNodes(nodes, edges);
  assert.deepEqual([...first.positions.entries()], [...second.positions.entries()]);
});

test('a merge node is ranked by its longest path, not its shortest', () => {
  // Diamond: a -> b -> c and a -> c directly. The longest path to c is 2 (via b),
  // so c must sit a full layer BELOW b — this is what distinguishes longest-path
  // layering from naive BFS (which would tie b and c on the same layer).
  const nodes = ['a', 'b', 'c'].map(node);
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')];

  const { positions } = layoutNodes(nodes, edges);
  assert.ok(positions.get('a').y < positions.get('b').y, 'a above b');
  assert.ok(positions.get('b').y < positions.get('c').y, 'c sits below b (longest path wins)');
});

test('self-loops are ignored for layout but the node is still placed', () => {
  const nodes = ['a', 'b'].map(node);
  const edges = [edge('a', 'a'), edge('a', 'b')];

  const { positions } = layoutNodes(nodes, edges);
  assert.equal(positions.size, 2, 'both nodes placed');
  assert.ok(positions.get('a').y < positions.get('b').y, 'self-loop does not push a down a layer');
});

test('edges referencing unknown ids are ignored', () => {
  const nodes = ['a', 'b'].map(node);
  const edges = [edge('a', 'b'), edge('a', 'ghost'), edge('ghost', 'b')];

  const { positions } = layoutNodes(nodes, edges);
  assert.equal(positions.size, 2, 'only the two real nodes are placed');
  assert.ok(positions.get('a').y < positions.get('b').y, 'the one valid edge still drives layout');
});

test('a single node is placed without edges', () => {
  const { positions } = layoutNodes([node('solo')], []);
  assert.equal(positions.size, 1);
  assert.ok(Number.isFinite(positions.get('solo').x));
  assert.ok(Number.isFinite(positions.get('solo').y));
});

test('a cycle fed by a root stacks its tail downward', () => {
  // x -> a -> b -> c -> a. The a/b/c cycle should stack below x in chain order,
  // with only the back-edge (c -> a) pointing upward.
  const nodes = ['x', 'a', 'b', 'c'].map(node);
  const edges = [edge('x', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];

  const { positions } = layoutNodes(nodes, edges);
  assert.ok(positions.get('x').y < positions.get('a').y, 'root above the cycle');
  assert.ok(positions.get('a').y < positions.get('b').y, 'a above b');
  assert.ok(positions.get('b').y < positions.get('c').y, 'b above c');
});

test('every node rect stays inside the canvas bounds', () => {
  const HALF_W = 78; // node is 156 wide
  const HALF_H = 36; // node is 72 tall
  const cases = [
    { nodes: ['a', 'b', 'c', 'd', 'e'].map(node), edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e')] },
    { nodes: ['a', 'b', 'c'].map(node), edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')] },
    { nodes: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].map(node), edges: [] },
  ];

  for (const { nodes, edges } of cases) {
    const { width, height, positions } = layoutNodes(nodes, edges);
    for (const [id, { x, y }] of positions) {
      assert.ok(x - HALF_W >= 0 && x + HALF_W <= width, `${id} fits horizontally`);
      assert.ok(y - HALF_H >= 0 && y + HALF_H <= height, `${id} fits vertically`);
    }
  }
});

test('empty input returns a valid empty canvas', () => {
  const { width, height, positions } = layoutNodes([], []);
  assert.ok(width > 0 && height > 0);
  assert.equal(positions.size, 0);
});

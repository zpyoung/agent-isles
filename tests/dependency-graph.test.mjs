import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDependencyGraph, parseDependencyIdList } from '../src/components/dependency-graph.js';

test('parseDependencyIdList parses comma-separated dependency ids', () => {
  assert.deepEqual(parseDependencyIdList(''), []);
  assert.deepEqual(parseDependencyIdList('edit-server'), ['edit-server']);
  assert.deepEqual(parseDependencyIdList('a, b , , c'), ['a', 'b', 'c']);
});

test('analyzeDependencyGraph orders a simple chain and computes depths', () => {
  const analysis = analyzeDependencyGraph([
    { id: 'edit-server', label: 'Edit server', blockedBy: '' },
    { id: 'source-metadata', label: 'Source metadata', blockedBy: 'edit-server' },
  ]);

  assert.deepEqual(analysis.order, ['edit-server', 'source-metadata']);
  assert.equal(analysis.depthById.get('edit-server'), 0);
  assert.equal(analysis.depthById.get('source-metadata'), 1);
  assert.deepEqual(analysis.edges, [{ from: 'edit-server', to: 'source-metadata' }]);
});

test('analyzeDependencyGraph tracks missing blocker ids', () => {
  const analysis = analyzeDependencyGraph([
    { id: 'patch-api', label: 'Patch API', blockedBy: 'missing, edit-server' },
    { id: 'edit-server', label: 'Edit server', blockedBy: '' },
  ]);

  assert.deepEqual(analysis.missingBlockersById.get('patch-api'), ['missing']);
  assert.deepEqual(analysis.edges, [{ from: 'edit-server', to: 'patch-api' }]);
});

test('analyzeDependencyGraph detects cycles and surfaces warnings', () => {
  const analysis = analyzeDependencyGraph([
    { id: 'a', label: 'A', blockedBy: 'b' },
    { id: 'b', label: 'B', blockedBy: 'a' },
  ]);

  assert.ok(analysis.warnings.some((warning) => warning.type === 'cycle'));
  assert.ok(analysis.cycle);
});

test('analyzeDependencyGraph warns on nodes missing ids', () => {
  const analysis = analyzeDependencyGraph([
    { id: '', label: 'No id', blockedBy: '' },
    { id: 'ok', label: 'Ok', blockedBy: '' },
  ]);

  assert.ok(analysis.warnings.some((warning) => warning.type === 'missing-id'));
});

